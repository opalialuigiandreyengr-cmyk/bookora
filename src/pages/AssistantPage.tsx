import { Fragment, useEffect, useRef, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { AlertCircle, ArrowUp, CheckCircle2, ChevronDown, ChevronUp, Copy, Lightbulb, Loader2, Sparkles, Square, Trash2 } from "lucide-react"
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
    type: "delete_service"
    label: string
    data: {
      service_id?: string
      name: string
    }
  }
  | {
    type: "delete_appointment"
    label: string
    data: {
      appointment_id?: string
      customer_name?: string
      appointment_date?: string
      appointment_time?: string
    }
  }
  | {
    type: "delete_client"
    label: string
    data: {
      client_id?: string
      full_name?: string
    }
  }
  | {
    type: "delete_block_time"
    label: string
    data: {
      block_id?: string
      title?: string
      event_date?: string
      start_time?: string
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

type AssistantToolCall = {
  id: string
  tool: string
  page: string
  status: "running" | "done" | "error"
  count: number
  duration_ms: number
  summary: string
}

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  thinking?: string | null
  thinkingSeconds?: number | null
  toolCalls?: AssistantToolCall[]
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
  const [liveTools, setLiveTools] = useState<AssistantToolCall[]>([])
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({})
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({})
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
    setLiveTools([])
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
    setLiveTools([])
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
          stream: true,
        }),
        signal: controller.signal,
      })

      const contentType = res.headers.get("content-type") || ""
      let data: Record<string, unknown> = {}
      let streamErrorStatus: number | null = null
      const streamedTools: AssistantToolCall[] = []

      if (contentType.includes("application/x-ndjson") && res.body?.getReader) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        const upsertTool = (t: AssistantToolCall) => {
          const idx = streamedTools.findIndex((item) => item.id === t.id)
          if (idx >= 0) streamedTools[idx] = t
          else streamedTools.push(t)
          setLiveTools((prev) => {
            const pIdx = prev.findIndex((item) => item.id === t.id)
            if (pIdx >= 0) {
              const next = [...prev]
              next[pIdx] = t
              return next
            }
            return [...prev, t]
          })
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 40)
        }

        const handleLine = (rawLine: string) => {
          const line = rawLine.trim()
          if (!line) return
          try {
            const ev = JSON.parse(line) as Record<string, unknown>
            if ((ev.type === "tool_start" || ev.type === "tool_done") && ev.tool && typeof ev.tool === "object") {
              upsertTool(ev.tool as AssistantToolCall)
            } else if (ev.type === "result" && ev.data && typeof ev.data === "object") {
              data = ev.data as Record<string, unknown>
            } else if (ev.type === "error") {
              streamErrorStatus = Number(ev.status || 500)
              data = {
                error: ev.error,
                configured: ev.configured,
                tool_calls: ev.tool_calls || streamedTools,
              }
            }
          } catch {
            // Ignore malformed line
          }
        }

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""
          for (const line of lines) handleLine(line)
        }
        if (buffer.trim()) handleLine(buffer)
      } else {
        data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      }

      const finalElapsed = Math.max(0.1, Number(((Date.now() - startRef.current) / 1000).toFixed(1)))

      if (!res.ok || (streamErrorStatus && streamErrorStatus >= 400) || data?.configured === false || data?.error) {
        const msg = String(data?.error || `Request failed (${streamErrorStatus || res.status})`)
        if (
          data?.configured === false ||
          res.status === 503 ||
          res.status === 401 ||
          streamErrorStatus === 401 ||
          streamErrorStatus === 503 ||
          msg.toLowerCase().includes("openrouter_api_key")
        ) {
          setSetupNotice(msg)
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `e_${Date.now()}`,
              role: "assistant",
              content: msg,
              thinkingSeconds: finalElapsed,
              toolCalls: Array.isArray(data?.tool_calls) ? (data.tool_calls as AssistantToolCall[]) : streamedTools,
            },
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
          toolCalls: Array.isArray(data?.tool_calls) ? (data.tool_calls as AssistantToolCall[]) : streamedTools,
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
      setLiveTools([])
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
        const normTime = normalizeTime24h(action.data.appointment_time)
        const normName = action.data.customer_name.trim().toLowerCase()
        const { data: existingBookings } = await supabase
          .from("appointments")
          .select("id, customer_name, appointment_time, status")
          .eq("business_id", user.id)
          .eq("appointment_date", action.data.appointment_date)
        const dupBooking = (existingBookings || []).find(
          (a) =>
            !["cancelled", "no_show"].includes(String(a.status || "")) &&
            String(a.customer_name || "").trim().toLowerCase() === normName &&
            normalizeTime24h(String(a.appointment_time || "")) === normTime
        )
        if (dupBooking) {
          throw new Error(
            `Duplicate booking: ${action.data.customer_name} already has a booking on ${action.data.appointment_date} at ${normTime}. Did not proceed.`
          )
        }

        const { error } = await supabase.from("appointments").insert({
          business_id: user.id,
          customer_name: action.data.customer_name.trim(),
          customer_phone: (action.data.customer_phone || "").trim(),
          customer_email: (action.data.customer_email || "").trim(),
          service_names: action.data.service_names.trim(),
          appointment_date: action.data.appointment_date,
          appointment_time: normTime,
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

        const { data: existingServices } = await supabase
          .from("services")
          .select("name")
          .eq("business_id", user.id)
        const existingSet = new Set((existingServices || []).map((s) => String(s.name || "").trim().toLowerCase()))
        const seenBatch = new Set<string>()
        const dupNames: string[] = []
        for (const r of rows) {
          const k = r.name.toLowerCase()
          if (existingSet.has(k) || seenBatch.has(k)) dupNames.push(r.name)
          seenBatch.add(k)
        }
        if (dupNames.length > 0) {
          throw new Error(`Duplicate service found (${dupNames.join(", ")}) — already exists. Did not proceed.`)
        }

        const { error } = await supabase.from("services").insert(rows)
        if (error) throw new Error(error.message)
        showToast(`Added ${rows.length} service(s)`, "success")
        setExecutedKeys((prev) => ({ ...prev, [key]: "done" }))
        return
      }

      if (action.type === "create_client") {
        const normName = action.data.full_name.trim().toLowerCase()
        const normPhone = (action.data.phone || "").replace(/\s+/g, "")
        const normEmail = (action.data.email || "").trim().toLowerCase()
        const { data: existingClients } = await supabase
          .from("clients")
          .select("full_name, phone, email")
          .eq("business_id", user.id)
        const dupClient = (existingClients || []).find(
          (c) =>
            (normName && String(c.full_name || "").trim().toLowerCase() === normName) ||
            (normPhone && c.phone && String(c.phone).replace(/\s+/g, "") === normPhone) ||
            (normEmail && c.email && String(c.email).trim().toLowerCase() === normEmail)
        )
        if (dupClient) {
          throw new Error(`Duplicate client (${dupClient.full_name}) already exists. Did not proceed.`)
        }

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
        const { data: existingBlocks } = await supabase
          .from("block_time_events")
          .select("title, start_time")
          .eq("business_id", user.id)
          .eq("event_date", action.data.event_date)
        const dupBlock = (existingBlocks || []).find(
          (b) => normalizeTime24h(String(b.start_time || "")) === start
        )
        if (dupBlock) {
          throw new Error(
            `Duplicate block time: "${dupBlock.title}" already exists on ${action.data.event_date} at ${start}. Did not proceed.`
          )
        }

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
        return
      }

      if (action.type === "delete_service") {
        let targetId = action.data.service_id || ""
        let targetName = action.data.name || ""
        if (!targetId && targetName) {
          const { data: rows } = await supabase
            .from("services")
            .select("id, name")
            .eq("business_id", user.id)
          const match = (rows || []).find(
            (r) => String(r.name || "").trim().toLowerCase() === targetName.trim().toLowerCase()
          )
          if (match) {
            targetId = String(match.id)
            targetName = String(match.name)
          }
        }
        if (!targetId) throw new Error(`Service "${action.data.name}" not found. Did not delete.`)
        if (!window.confirm(`Permanently delete service "${targetName || action.data.name}"? This cannot be undone.`)) {
          setExecutedKeys((prev) => {
            const next = { ...prev }
            delete next[key]
            return next
          })
          return
        }
        const { error } = await supabase.from("services").delete().eq("id", targetId).eq("business_id", user.id)
        if (error) throw new Error(error.message)
        showToast(`Deleted "${targetName || action.data.name}"`, "success")
        setExecutedKeys((prev) => ({ ...prev, [key]: "done" }))
        return
      }

      if (action.type === "delete_appointment") {
        let targetId = action.data.appointment_id || ""
        let summaryLabel = action.data.customer_name || "booking"
        if (!targetId) {
          const { data: rows } = await supabase
            .from("appointments")
            .select("id, customer_name, appointment_date, service_names")
            .eq("business_id", user.id)
          const match = (rows || []).find(
            (r) =>
              (!action.data.customer_name ||
                String(r.customer_name || "").trim().toLowerCase() ===
                  action.data.customer_name.trim().toLowerCase()) &&
              (!action.data.appointment_date || String(r.appointment_date || "") === action.data.appointment_date)
          )
          if (match) {
            targetId = String(match.id)
            summaryLabel = `${match.customer_name} (${match.appointment_date})`
          }
        }
        if (!targetId) throw new Error("Matching booking not found. Did not delete.")
        if (!window.confirm(`Permanently delete booking for ${summaryLabel}? This cannot be undone.`)) {
          setExecutedKeys((prev) => {
            const next = { ...prev }
            delete next[key]
            return next
          })
          return
        }
        const { error } = await supabase.from("appointments").delete().eq("id", targetId).eq("business_id", user.id)
        if (error) throw new Error(error.message)
        showToast(`Deleted booking for ${summaryLabel}`, "success")
        setExecutedKeys((prev) => ({ ...prev, [key]: "done" }))
        return
      }

      if (action.type === "delete_client") {
        let targetId = action.data.client_id || ""
        let targetName = action.data.full_name || ""
        if (!targetId && targetName) {
          const { data: rows } = await supabase
            .from("clients")
            .select("id, full_name")
            .eq("business_id", user.id)
          const match = (rows || []).find(
            (r) => String(r.full_name || "").trim().toLowerCase() === targetName.trim().toLowerCase()
          )
          if (match) {
            targetId = String(match.id)
            targetName = String(match.full_name)
          }
        }
        if (!targetId) throw new Error(`Client "${targetName}" not found. Did not delete.`)
        if (!window.confirm(`Permanently delete client "${targetName}"? This cannot be undone.`)) {
          setExecutedKeys((prev) => {
            const next = { ...prev }
            delete next[key]
            return next
          })
          return
        }
        const { error } = await supabase.from("clients").delete().eq("id", targetId).eq("business_id", user.id)
        if (error) throw new Error(error.message)
        showToast(`Deleted client "${targetName}"`, "success")
        setExecutedKeys((prev) => ({ ...prev, [key]: "done" }))
        return
      }

      if (action.type === "delete_block_time") {
        let targetId = action.data.block_id || ""
        let targetTitle = action.data.title || "blocked time"
        if (!targetId) {
          const start = action.data.start_time ? normalizeTime24h(action.data.start_time) : ""
          const { data: rows } = await supabase
            .from("block_time_events")
            .select("id, title, event_date, start_time")
            .eq("business_id", user.id)
          const match = (rows || []).find(
            (r) =>
              (!action.data.event_date || String(r.event_date || "") === action.data.event_date) &&
              (!start || normalizeTime24h(String(r.start_time || "")) === start) &&
              (!action.data.title ||
                String(r.title || "").trim().toLowerCase() === action.data.title.trim().toLowerCase())
          )
          if (match) {
            targetId = String(match.id)
            targetTitle = `${match.title} (${match.event_date})`
          }
        }
        if (!targetId) throw new Error("Blocked time entry not found. Did not delete.")
        if (!window.confirm(`Permanently delete "${targetTitle}"? This cannot be undone.`)) {
          setExecutedKeys((prev) => {
            const next = { ...prev }
            delete next[key]
            return next
          })
          return
        }
        const { error } = await supabase.from("block_time_events").delete().eq("id", targetId).eq("business_id", user.id)
        if (error) throw new Error(error.message)
        showToast(`Deleted "${targetTitle}"`, "success")
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
                  setExpandedTools({})
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
                const toolCalls = !isUser && Array.isArray(msg.toolCalls) ? msg.toolCalls : []
                const hasTools = toolCalls.length > 0
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
                    {hasTools && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-start" }}>
                        {toolCalls.map((t) => {
                          const toolKey = `${msg.id}_${t.id}`
                          const isOpen = Boolean(expandedTools[toolKey])
                          return (
                            <div key={t.id} style={{ display: "grid", gap: 4 }}>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedTools((prev) => ({ ...prev, [toolKey]: !prev[toolKey] }))
                                }
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: "#111827",
                                  background: "#FFF5F3",
                                  border: "1px solid #FAD7D0",
                                  borderRadius: 999,
                                  padding: "4px 10px",
                                  cursor: "pointer",
                                }}
                              >
                                {t.status === "error" ? (
                                  <AlertCircle size={12} color="#DC2626" />
                                ) : (
                                  <CheckCircle2 size={12} color="#16A34A" />
                                )}
                                <span>
                                  {t.page} · {t.count} · {t.duration_ms}ms
                                </span>
                                {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>
                              {isOpen && (
                                <div
                                  style={{
                                    padding: "7px 10px",
                                    borderRadius: 10,
                                    border: "1px solid #E5E7EB",
                                    background: "#FFFFFF",
                                    display: "grid",
                                    gap: 2,
                                  }}
                                >
                                  <code style={{ fontSize: 11, color: "#FF6B57" }}>{t.tool}()</code>
                                  {t.summary && (
                                    <span style={{ fontSize: 12, color: "#64748B" }}>{t.summary}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

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
                        const isDelete = action.type.startsWith("delete_")
                        return (
                          <article
                            key={key}
                            className="admin-card"
                            style={{
                              padding: 14,
                              borderColor: isDelete ? "#FCA5A5" : undefined,
                              background: isDelete ? "#FFFBFB" : undefined,
                            }}
                          >
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
                              style={
                                isDelete && state !== "done"
                                  ? { background: "#DC2626", color: "#FFFFFF" }
                                  : undefined
                              }
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
                                  {isDraft ? "Copied" : isDelete ? "Deleted" : "Completed"}
                                </>
                              ) : isDraft ? (
                                <>
                                  <Copy data-icon="inline-start" />
                                  Copy Message
                                </>
                              ) : isDelete ? (
                                <>
                                  <Trash2 data-icon="inline-start" />
                                  Confirm Delete
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
                <div style={{ display: "grid", gap: 6 }}>
                  {liveTools.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        justifySelf: "start",
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: "#FFF5F3",
                        border: "1px solid #FAD7D0",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#111827",
                      }}
                    >
                      {t.status === "running" ? (
                        <Loader2 size={12} className="animate-spin" color="#FF6B57" />
                      ) : t.status === "error" ? (
                        <AlertCircle size={12} color="#DC2626" />
                      ) : (
                        <CheckCircle2 size={12} color="#16A34A" />
                      )}
                      <span>
                        {t.status === "running"
                          ? `Querying ${t.page}…`
                          : `${t.page} · ${t.count} · ${t.duration_ms}ms`}
                      </span>
                    </div>
                  ))}
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
