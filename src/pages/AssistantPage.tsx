import { useRef, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { ArrowUp, CheckCircle2, Copy, Loader2, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { OwnerMobileMenuButton, OwnerSidebar } from "@/components/owner/OwnerSidebar"
import { OwnerStatusBadge } from "@/components/owner/OwnerDataPrimitives"
import { showToast } from "@/components/ui/toast"
import { supabase } from "@/lib/supabase"

type AssistantAction =
  | {
      type: "create_appointment"
      label: string
      data: {
        customer_name: string
        customer_phone?: string
        customer_email?: string
        service_names: string
        appointment_date: string
        appointment_time: string
        duration_minutes?: number
        total_price?: string | number
        customer_note?: string
        status?: "pending" | "approved" | "completed"
      }
    }
  | {
      type: "update_appointment_status"
      label: string
      data: {
        appointment_id?: string
        customer_name?: string
        appointment_date?: string
        new_status: "approved" | "completed" | "cancelled" | "no_show"
      }
    }
  | {
      type: "create_service"
      label: string
      data: {
        items: Array<{
          name: string
          price: number | string
          duration_minutes?: number
          category?: string
          description?: string
        }>
      }
    }
  | {
      type: "create_client"
      label: string
      data: {
        full_name: string
        phone?: string
        email?: string
        notes?: string
      }
    }
  | {
      type: "block_time"
      label: string
      data: {
        title: string
        event_date: string
        start_time: string
        end_time: string
        note?: string
      }
    }
  | {
      type: "draft_message"
      label: string
      data: {
        channel?: string
        recipient?: string
        message: string
      }
    }

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  actions?: AssistantAction[]
}

const QUICK_PROMPTS = [
  "Summarize my bookings and revenue this month",
  "Draft a friendly Taglish reminder for upcoming bookings",
  "Book Maria Santos for Gel Manicure tomorrow 2:00 PM",
  "Add Classic Pedicure ₱350 (45m) and Nail Removal ₱150 (20m) to services",
  "Block lunch break tomorrow 12:00 PM to 1:00 PM",
]

function normalizeTime24h(raw?: string): string {
  const input = (raw || "").trim().toUpperCase()
  if (!input) return "09:00"
  const match = input.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/)
  if (!match) return input.slice(0, 5) || "09:00"
  let h = Number(match[1])
  const m = Number(match[2] || "0")
  const ampm = match[3]
  if (ampm === "PM" && h < 12) h += 12
  if (ampm === "AM" && h === 12) h = 0
  return `${String(Math.max(0, Math.min(23, h))).padStart(2, "0")}:${String(Math.max(0, Math.min(59, m))).padStart(2, "0")}`
}

function minutesBetween(start: string, end?: string): number {
  if (!end) return 60
  const [sh, sm] = normalizeTime24h(start).split(":").map(Number)
  const [eh, em] = normalizeTime24h(end).split(":").map(Number)
  const diff = eh * 60 + em - (sh * 60 + sm)
  return diff >= 5 ? diff : 60
}

const FREE_MODELS = [
  { id: "openrouter/free", label: "Auto Free Router (openrouter/free)" },
  { id: "google/gemma-4-31b-it:free", label: "Google Gemma 4 31B (:free)" },
  { id: "google/gemma-4-26b-a4b-it:free", label: "Google Gemma 4 26B (:free)" },
  { id: "nvidia/nemotron-3.5-lightning:free", label: "NVIDIA Nemotron 3.5 Lightning (:free)" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "NVIDIA Nemotron 3 Ultra (:free)" },
  { id: "baidu/ernie-5.5-flash-preview:free", label: "Baidu ERNIE 5.5 Flash (:free)" },
]

export function AssistantPage({ user }: { user: User; onSignOut?: () => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [selectedModel, setSelectedModel] = useState("openrouter/free")
  const [customModel, setCustomModel] = useState("")
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [setupNotice, setSetupNotice] = useState("")
  const [executedKeys, setExecutedKeys] = useState<Record<string, "running" | "done">>({})
  const bottomRef = useRef<HTMLDivElement>(null)

  const navigate = (path: string) => {
    window.location.assign(path)
  }

  const sendMessage = async (textOverride?: string) => {
    const content = (textOverride ?? draft).trim()
    if (!content || sending) return
    if (!supabase || user.id === "preview-user-123") {
      showToast("Sign in with a live Bookora account to use Bookora AI.", "error")
      return
    }

    const userMsg: ChatMessage = { id: `u_${Date.now()}`, role: "user", content }
    const nextThread = [...messages, userMsg]
    setMessages(nextThread)
    if (!textOverride) setDraft("")
    setSending(true)
    setSetupNotice("")

    try {
      const activeModel = customModel.trim().endsWith(":free") ? customModel.trim() : selectedModel
      const { data, error } = await supabase.functions.invoke("bookora-ai-assistant", {
        body: {
          messages: nextThread.slice(-10).map((m) => ({ role: m.role, content: m.content })),
          model: activeModel,
        },
      })

      if (error) {
        let msg = error.message || "Unable to reach Bookora AI."
        let configured = true
        try {
          const ctx = (error as { context?: { json?: () => Promise<Record<string, unknown>> } }).context
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json()
            if (typeof body?.error === "string" && body.error.trim()) msg = body.error.trim()
            if (body?.configured === false) configured = false
          }
        } catch {
          // Ignore parse failure
        }
        if (!configured || msg.toLowerCase().includes("openrouter_api_key")) {
          setSetupNotice(msg)
        } else {
          setMessages((prev) => [...prev, { id: `e_${Date.now()}`, role: "assistant", content: msg }])
        }
        return
      }

      if (data?.configured === false) {
        setSetupNotice(String(data?.error || "OpenRouter API key is not configured yet."))
        return
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: "assistant",
          content: String(data?.reply || ""),
          actions: Array.isArray(data?.actions) ? (data.actions as AssistantAction[]) : [],
        },
      ])
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60)
    } finally {
      setSending(false)
    }
  }

  const runAction = async (key: string, action: AssistantAction) => {
    if (!supabase || executedKeys[key]) return
    setExecutedKeys((prev) => ({ ...prev, [key]: "running" }))
    try {
      if (action.type === "draft_message") {
        await navigator.clipboard.writeText(action.data.message)
        showToast("Message copied to clipboard!", "success")
        setExecutedKeys((prev) => ({ ...prev, [key]: "done" }))
        return
      }

      if (action.type === "create_appointment") {
        const { error } = await supabase.from("appointments").insert({
          business_id: user.id,
          customer_name: action.data.customer_name.trim(),
          customer_phone: (action.data.customer_phone || "").trim(),
          customer_email: (action.data.customer_email || "").trim(),
          service_names: action.data.service_names.trim(),
          appointment_date: action.data.appointment_date,
          appointment_time: normalizeTime24h(action.data.appointment_time),
          duration_minutes: Math.max(5, Number(action.data.duration_minutes) || 60),
          total_price: String(action.data.total_price || "0"),
          customer_note: action.data.customer_note || "Booked via Bookora AI",
          status: action.data.status || "approved",
        })
        if (error) throw new Error(error.message)
        showToast(`Booked ${action.data.customer_name}`, "success")
        setExecutedKeys((prev) => ({ ...prev, [key]: "done" }))
        return
      }

      if (action.type === "update_appointment_status") {
        let targetId = action.data.appointment_id
        if (!targetId) {
          const query = supabase
            .from("appointments")
            .select("id, customer_name, appointment_date")
            .eq("business_id", user.id)
            .order("appointment_date", { ascending: false })
            .limit(30)
          const { data } = await query
          const nameNeedle = (action.data.customer_name || "").toLowerCase().trim()
          const dateNeedle = (action.data.appointment_date || "").trim()
          const match = (data || []).find(
            (a) =>
              (!nameNeedle || String(a.customer_name).toLowerCase().includes(nameNeedle)) &&
              (!dateNeedle || String(a.appointment_date) === dateNeedle)
          )
          targetId = match?.id
        }
        if (!targetId) throw new Error("Matching appointment not found.")
        const { error } = await supabase
          .from("appointments")
          .update({ status: action.data.new_status })
          .eq("id", targetId)
          .eq("business_id", user.id)
        if (error) throw new Error(error.message)
        showToast(`Updated appointment to ${action.data.new_status}`, "success")
        setExecutedKeys((prev) => ({ ...prev, [key]: "done" }))
        return
      }

      if (action.type === "create_service") {
        const rows = (action.data.items || []).map((item) => ({
          business_id: user.id,
          name: item.name.trim(),
          price: typeof item.price === "number" ? `₱${item.price}` : String(item.price),
          duration_minutes: Math.max(5, Number(item.duration_minutes) || 60),
          description: (item.description || "").trim(),
          show_on_booking_page: true,
        }))
        if (rows.length === 0) throw new Error("No services provided.")
        const { error } = await supabase.from("services").insert(rows)
        if (error) throw new Error(error.message)
        showToast(`Added ${rows.length} service(s)`, "success")
        setExecutedKeys((prev) => ({ ...prev, [key]: "done" }))
        return
      }

      if (action.type === "create_client") {
        const { error } = await supabase.from("clients").insert({
          business_id: user.id,
          full_name: action.data.full_name.trim(),
          phone: (action.data.phone || "").trim(),
          email: (action.data.email || "").trim(),
          notes: (action.data.notes || "").trim(),
        })
        if (error) throw new Error(error.message)
        showToast(`Added ${action.data.full_name}`, "success")
        setExecutedKeys((prev) => ({ ...prev, [key]: "done" }))
        return
      }

      if (action.type === "block_time") {
        const start = normalizeTime24h(action.data.start_time)
        const duration = minutesBetween(start, action.data.end_time)
        const { error } = await supabase.from("block_time_events").insert({
          business_id: user.id,
          title: action.data.title || "Blocked time",
          event_date: action.data.event_date,
          start_time: start,
          duration_minutes: duration,
          personal_event: false,
          notes: (action.data.note || "").trim(),
        })
        if (error) throw new Error(error.message)
        showToast(`Blocked ${action.data.title}`, "success")
        setExecutedKeys((prev) => ({ ...prev, [key]: "done" }))
      }
    } catch (err) {
      setExecutedKeys((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      showToast(err instanceof Error ? err.message : "Could not run action.", "error")
    }
  }

  return (
    <div className="dashboard-shell">
      <OwnerSidebar
        user={user}
        active="Assistant"
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNavigate={navigate}
      />

      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="dashboard-topbar-left">
            <OwnerMobileMenuButton onOpen={() => setSidebarOpen(true)} />
            <div>
              <h1>Bookora AI Assistant</h1>
              <p>End-to-end owner copilot for bookings, services, clients, and drafts</p>
            </div>
          </div>
          {messages.length > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMessages([])
                setExecutedKeys({})
                setSetupNotice("")
              }}
            >
              <Trash2 data-icon="inline-start" />
              Clear Chat
            </Button>
          )}
        </header>

        <section className="admin-section" style={{ maxWidth: 880 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>
              Free Model:
              <select
                value={selectedModel}
                onChange={(e) => {
                  setSelectedModel(e.target.value)
                  setCustomModel("")
                }}
                style={{
                  marginLeft: 8,
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: "1px solid #E5E7EB",
                  background: "#FFFFFF",
                  fontSize: 13,
                  color: "#111827",
                }}
              >
                {FREE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <input
              type="text"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder="Or paste custom model ending with :free"
              style={{
                flex: 1,
                minWidth: 220,
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid #E5E7EB",
                fontSize: 13,
              }}
            />
          </div>

          {setupNotice && (
            <div className="admin-security-banner">
              <Sparkles size={16} />
              <div>
                <strong>OpenRouter Setup Required</strong>
                <p>{setupNotice}</p>
              </div>
            </div>
          )}

          {messages.length === 0 ? (
            <article className="admin-card">
              <div className="panel-heading">
                <div>
                  <h2>What can I do for your business today?</h2>
                  <p>Ask in English or Taglish — Bookora AI uses your live workspace data.</p>
                </div>
                <OwnerStatusBadge label="OpenRouter Free" tone="warning" />
              </div>

              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessage(prompt)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      textAlign: "left",
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid #e6e8ec",
                      background: "#fff",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: 13.5,
                    }}
                  >
                    <Sparkles size={15} color="#FF6B57" />
                    <span>{prompt}</span>
                  </button>
                ))}
              </div>
            </article>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {messages.map((msg) => {
                const isUser = msg.role === "user"
                return (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: isUser ? "flex-end" : "flex-start",
                      maxWidth: "82%",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        padding: "11px 15px",
                        borderRadius: 16,
                        background: isUser ? "#FF6B57" : "#F6F7F9",
                        color: isUser ? "#FFFFFF" : "#16181D",
                        border: isUser ? "none" : "1px solid #EAECEF",
                        whiteSpace: "pre-wrap",
                        fontSize: 14,
                        lineHeight: 1.55,
                      }}
                    >
                      {msg.content}
                    </div>

                    {!isUser &&
                      msg.actions?.map((action, idx) => {
                        const key = `${msg.id}_${idx}`
                        const state = executedKeys[key]
                        const isDraft = action.type === "draft_message"
                        return (
                          <article key={key} className="admin-card" style={{ padding: 14 }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 10,
                                marginBottom: 8,
                              }}
                            >
                              <strong style={{ fontSize: 14 }}>{action.label}</strong>
                              {state === "done" && <OwnerStatusBadge label="Done" tone="success" />}
                            </div>
                            {isDraft && action.data.message && (
                              <p
                                style={{
                                  fontSize: 13,
                                  background: "#F8F9FB",
                                  padding: 10,
                                  borderRadius: 8,
                                  marginBottom: 10,
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                {action.data.message}
                              </p>
                            )}
                            <Button
                              type="button"
                              variant={state === "done" ? "outline" : "default"}
                              disabled={state === "running" || (state === "done" && !isDraft)}
                              onClick={() => void runAction(key, action)}
                            >
                              {state === "running" ? (
                                <>
                                  <Loader2 className="animate-spin" data-icon="inline-start" />
                                  Running…
                                </>
                              ) : state === "done" ? (
                                <>
                                  <CheckCircle2 data-icon="inline-start" />
                                  {isDraft ? "Copied" : "Completed"}
                                </>
                              ) : isDraft ? (
                                <>
                                  <Copy data-icon="inline-start" />
                                  Copy Message
                                </>
                              ) : (
                                <>
                                  <Sparkles data-icon="inline-start" />
                                  Confirm & Run
                                </>
                              )}
                            </Button>
                          </article>
                        )
                      })}
                  </div>
                )
              })}

              {sending && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748B", fontSize: 13 }}>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Thinking…</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void sendMessage()
            }}
            style={{
              display: "flex",
              gap: 8,
              marginTop: 16,
              padding: 10,
              borderRadius: 16,
              border: "1px solid #E5E7EB",
              background: "#FFFFFF",
            }}
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask Bookora AI anything (e.g., Book Maria tomorrow 2pm, summarize revenue)…"
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                fontSize: 14,
                padding: "6px 8px",
              }}
            />
            <Button type="submit" disabled={!draft.trim() || sending}>
              <ArrowUp data-icon="inline-start" />
              Send
            </Button>
          </form>
        </section>
      </main>
    </div>
  )
}

