import { Fragment, useEffect, useRef, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { ArrowUp, CheckCircle2, ChevronDown, ChevronUp, Copy, Lightbulb, Loader2, Sparkles, Square, Trash2 } from "lucide-react"
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
  thinking?: string | null
  thinkingSeconds?: number | null
  model?: string
  actions?: AssistantAction[]
}

const QUICK_PROMPTS = [
  "Summarize my bookings and revenue this month",
  "Draft a friendly Taglish reminder for upcoming bookings",
  "Book Maria Santos for Gel Manicure tomorrow 2:00 PM",
  "Add Classic Pedicure ₱350 (45m) and Nail Removal ₱150 (20m) to services",
  "Block lunch break tomorrow 12:00 PM to 1:00 PM",
]

const FREE_MODELS = [
  { id: "openrouter/free", label: "Auto Free Router" },
  { id: "nvidia/nemotron-3.5-lightning:free", label: "Nemotron 3.5 Lightning (:free)" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra (:free)" },
  { id: "nvidia/nemotron-3.5-super-vl:free", label: "Nemotron 3.5 Super VL (:free)" },
  { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", label: "Nemotron 3 Nano Omni (:free)" },
  { id: "baidu/ernie-5.5-flash-preview:free", label: "ERNIE 5.5 Flash (:free)" },
  { id: "recursive/flint-v1.0:free", label: "Recursive Flint v1.0 (:free)" },
  { id: "liquid/lfm-3-1.7b:free", label: "Liquid LFM 3 1.7B (:free)" },
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

const INLINE_PATTERN = /(\*\*\*[^*]+?\*\*\*|\*\*[^*]+?\*\*|__[^_]+?__|(?<!\*)\*[^*\n]+?\*(?!\*)|`[^`]+?`)/g

function renderInlineMarkdown(line: string, keyPrefix: string) {
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  INLINE_PATTERN.lastIndex = 0
  let i = 0

  while ((match = INLINE_PATTERN.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={`${keyPrefix}_t_${i++}`}>{line.slice(lastIndex, match.index)}</Fragment>)
    }
    const raw = match[0]
    if (raw.startsWith("***") && raw.endsWith("***")) {
      nodes.push(<strong key={`${keyPrefix}_bi_${i++}`} style={{ fontStyle: "italic" }}>{raw.slice(3, -3)}</strong>)
    } else if (raw.startsWith("**") && raw.endsWith("**")) {
      nodes.push(<strong key={`${keyPrefix}_b_${i++}`}>{raw.slice(2, -2)}</strong>)
    } else if (raw.startsWith("__") && raw.endsWith("__")) {
      nodes.push(<u key={`${keyPrefix}_u_${i++}`}>{raw.slice(2, -2)}</u>)
    } else if (raw.startsWith("`") && raw.endsWith("`")) {
      nodes.push(
        <code key={`${keyPrefix}_c_${i++}`} style={{ background: "rgba(15,23,42,0.06)", padding: "1px 4px", borderRadius: 4 }}>
          {raw.slice(1, -1)}
        </code>
      )
    } else if (raw.startsWith("*") && raw.endsWith("*")) {
      nodes.push(<em key={`${keyPrefix}_i_${i++}`}>{raw.slice(1, -1)}</em>)
    }
    lastIndex = match.index + raw.length
  }

  if (lastIndex < line.length) {
    nodes.push(<Fragment key={`${keyPrefix}_tail`}>{line.slice(lastIndex)}</Fragment>)
  }
  return nodes
}

function FormattedMarkdown({ content }: { content: string }) {
  const lines = String(content || "").split(/\r?\n/)
  return (
    <div>
      {lines.map((rawLine, idx) => {
        const headingMatch = rawLine.trim().match(/^#{1,4}\s+(.*)$/)
        const bulletMatch = rawLine.match(/^\s*[-*•]\s+(.*)$/)
        return (
          <div key={idx} style={{ minHeight: rawLine.trim() ? undefined : 8 }}>
            {headingMatch ? (
              <strong>{renderInlineMarkdown(headingMatch[1], `h${idx}`)}</strong>
            ) : bulletMatch ? (
              <span>• {renderInlineMarkdown(bulletMatch[1], `b${idx}`)}</span>
            ) : (
              renderInlineMarkdown(rawLine, `l${idx}`)
            )}
          </div>
        )
      })}
    </div>
  )
}

export function AssistantPage({ user }: { user: User; onSignOut?: () => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [selectedModel, setSelectedModel] = useState("openrouter/free")
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({})
  const [setupNotice, setSetupNotice] = useState("")
  const [executedKeys, setExecutedKeys] = useState<Record<string, "running" | "done">>({})
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const startRef = useRef(0)

  useEffect(() => {
    if (!sending) return
    const timer = setInterval(() => {
      setElapsedSeconds(Number(((Date.now() - startRef.current) / 1000).toFixed(1)))
    }, 100)
    return () => clearInterval(timer)
  }, [sending])

  const navigate = (path: string) => {
    window.location.assign(path)
  }

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setSending(false)
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

    const controller = new AbortController()
    abortRef.current = controller
    startRef.current = Date.now()
    setElapsedSeconds(0)
    setSending(true)
    setSetupNotice("")

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const url = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "")
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ""
      if (!token || !url || !anonKey) {
        showToast("Session expired. Please sign in again.", "error")
        return
      }

      const res = await fetch(`${url}/functions/v1/bookora-ai-assistant`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextThread.slice(-10).map((m) => ({ role: m.role, content: m.content })),
          model: selectedModel,
        }),
        signal: controller.signal,
      })

      const data = await res.json().catch(() => ({}))
      const finalElapsed = Math.max(0.1, Number(((Date.now() - startRef.current) / 1000).toFixed(1)))

      if (!res.ok || data?.configured === false) {
        const msg = String(data?.error || `Request failed (${res.status})`)
        if (data?.configured === false || res.status === 503 || res.status === 401 || msg.toLowerCase().includes("openrouter_api_key")) {
          setSetupNotice(msg)
        } else {
          setMessages((prev) => [
            ...prev,
            { id: `e_${Date.now()}`, role: "assistant", content: msg, thinkingSeconds: finalElapsed },
          ])
        }
        return
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: "assistant",
          content: String(data?.reply || ""),
          thinking: typeof data?.thinking === "string" && data.thinking.trim() ? data.thinking.trim() : null,
          thinkingSeconds: typeof data?.thinking_seconds === "number" ? data.thinking_seconds : finalElapsed,
          model: data?.model ? String(data.model) : undefined,
          actions: Array.isArray(data?.actions) ? (data.actions as AssistantAction[]) : [],
        },
      ])
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60)
    } catch (err) {
      const finalElapsed = Math.max(0.1, Number(((Date.now() - startRef.current) / 1000).toFixed(1)))
      if (err instanceof Error && (err.name === "AbortError" || err.message.toLowerCase().includes("abort"))) {
        setMessages((prev) => [
          ...prev,
          { id: `s_${Date.now()}`, role: "assistant", content: `_Stopped after ${finalElapsed}s._`, thinkingSeconds: finalElapsed },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `e_${Date.now()}`,
            role: "assistant",
            content: err instanceof Error ? err.message : "Unable to reach Bookora AI.",
            thinkingSeconds: finalElapsed,
          },
        ])
      }
    } finally {
      abortRef.current = null
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
          const { data } = await supabase
            .from("appointments")
            .select("id, customer_name, appointment_date")
            .eq("business_id", user.id)
            .order("appointment_date", { ascending: false })
            .limit(30)
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
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              aria-label="Free OpenRouter model"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{
                padding: "7px 12px",
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
            {messages.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  handleStop()
                  setMessages([])
                  setExecutedKeys({})
                  setExpandedThinking({})
                  setSetupNotice("")
                }}
              >
                <Trash2 data-icon="inline-start" />
                Clear
              </Button>
            )}
          </div>
        </header>

        <section className="admin-section" style={{ maxWidth: 880 }}>
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
                const showThought = Boolean(expandedThinking[msg.id])
                const hasThink = !isUser && (Boolean(msg.thinking) || msg.thinkingSeconds != null)
                return (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: isUser ? "flex-end" : "flex-start",
                      maxWidth: "82%",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    {hasThink && (
                      <div>
                        <button
                          type="button"
                          disabled={!msg.thinking}
                          onClick={() =>
                            setExpandedThinking((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))
                          }
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#64748B",
                            background: "#F3F4F6",
                            border: "none",
                            borderRadius: 999,
                            padding: "4px 10px",
                            cursor: msg.thinking ? "pointer" : "default",
                          }}
                        >
                          <Lightbulb size={12} />
                          <span>
                            Thought for {msg.thinkingSeconds ?? 0.5}s
                            {msg.model ? ` · ${msg.model.split("/").pop()?.replace(":free", "")}` : ""}
                          </span>
                          {msg.thinking && (showThought ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                        </button>
                        {showThought && msg.thinking && (
                          <div
                            style={{
                              marginTop: 6,
                              padding: "8px 12px",
                              borderRadius: 10,
                              borderLeft: "2px solid #E2E8F0",
                              background: "#FAFAFB",
                              color: "#64748B",
                              fontSize: 12.5,
                              lineHeight: 1.5,
                            }}
                          >
                            <FormattedMarkdown content={msg.thinking} />
                          </div>
                        )}
                      </div>
                    )}

                    <div
                      style={{
                        padding: "11px 15px",
                        borderRadius: 16,
                        background: isUser ? "#FF6B57" : "#F6F7F9",
                        color: isUser ? "#FFFFFF" : "#16181D",
                        border: isUser ? "none" : "1px solid #EAECEF",
                        fontSize: 14,
                        lineHeight: 1.55,
                      }}
                    >
                      {isUser ? msg.content : <FormattedMarkdown content={msg.content} />}
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
                              <div
                                style={{
                                  fontSize: 13,
                                  background: "#F8F9FB",
                                  padding: 10,
                                  borderRadius: 8,
                                  marginBottom: 10,
                                }}
                              >
                                <FormattedMarkdown content={action.data.message} />
                              </div>
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
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#64748B", fontSize: 13 }}>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Thinking… {elapsedSeconds.toFixed(1)}s</span>
                  <button
                    type="button"
                    onClick={handleStop}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "#FFF1F0",
                      color: "#DC2626",
                      border: "none",
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    <Square size={10} fill="currentColor" /> Stop
                  </button>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!sending) void sendMessage()
            }}
            style={{
              display: "flex",
              gap: 8,
              marginTop: 20,
              marginBottom: 16,
              padding: "10px 14px",
              borderRadius: 18,
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
            {sending ? (
              <Button type="button" variant="outline" style={{ color: "#DC2626", borderColor: "#FCA5A5" }} onClick={handleStop}>
                <Square data-icon="inline-start" size={14} />
                Stop
              </Button>
            ) : (
              <Button type="submit" disabled={!draft.trim()}>
                <ArrowUp data-icon="inline-start" />
                Send
              </Button>
            )}
          </form>
        </section>
      </main>
    </div>
  )
}
