import { useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { Ban, Plus, Trash2, X } from "lucide-react"
import { OwnerMobileMenuButton, OwnerSidebar } from "@/components/owner/OwnerSidebar"
import { hasSupabaseConfig, supabase } from "@/lib/supabase"
import { showToast } from "@/components/ui/toast"
import { EmptyState, LoadingState } from "@/components/ui/states"

type Props = { user: User; onSignOut: () => void }
type BlockEvent = { id: string; title: string; event_date: string; start_time: string; duration_minutes: number; personal_event: boolean; notes: string }

export function BlockTimePage({ user }: Props) {
  const isLive = hasSupabaseConfig && Boolean(supabase) && user.id !== "preview-user-123"
  const storageKey = `bookora-block-time-${user.id}`
  const [events, setEvents] = useState<BlockEvent[]>([])
  const [open, setOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState({ title: "", event_date: "", start_time: "09:00", duration_minutes: 60, personal_event: true, notes: "" })

  useEffect(() => {
    const load = async () => {
      if (isLive && supabase) {
        const result = await supabase.from("block_time_events").select("id, title, event_date, start_time, duration_minutes, personal_event, notes").eq("business_id", user.id).order("event_date").order("start_time")
        if (!result.error) setEvents((result.data || []) as BlockEvent[])
        else showToast(result.error.message, "error")
      } else {
        try { const raw = window.localStorage.getItem(storageKey); if (raw) setEvents(JSON.parse(raw) as BlockEvent[]) } catch { /* demo defaults */ }
      }
      setLoading(false)
    }
    void load()
  }, [isLive, storageKey, user.id])

  const save = async () => {
    if (!draft.title.trim() || !draft.event_date || draft.duration_minutes < 5) { showToast("Add a title, date, and duration.", "error"); return }
    setSaving(true)
    const payload = { business_id: user.id, ...draft, title: draft.title.trim(), notes: draft.notes.trim() }
    if (isLive && supabase) {
      const result = await supabase.from("block_time_events").insert(payload).select("id, title, event_date, start_time, duration_minutes, personal_event, notes").single()
      if (result.error) { showToast(result.error.message, "error"); setSaving(false); return }
      setEvents((current) => [...current, result.data as BlockEvent].sort((a, b) => `${a.event_date}${a.start_time}`.localeCompare(`${b.event_date}${b.start_time}`)))
    } else {
      const next = [...events, { ...payload, id: `demo-block-${Date.now()}` } as BlockEvent].sort((a, b) => `${a.event_date}${a.start_time}`.localeCompare(`${b.event_date}${b.start_time}`))
      setEvents(next); window.localStorage.setItem(storageKey, JSON.stringify(next))
    }
    setDraft({ title: "", event_date: "", start_time: "09:00", duration_minutes: 60, personal_event: true, notes: "" })
    setOpen(false); setSaving(false); showToast("Time blocked")
  }

  const remove = async (event: BlockEvent) => {
    if (!window.confirm(`Remove ${event.title}?`)) return
    if (isLive && supabase) { const result = await supabase.from("block_time_events").delete().eq("id", event.id).eq("business_id", user.id); if (result.error) { showToast(result.error.message, "error"); return } }
    const next = events.filter((item) => item.id !== event.id); setEvents(next)
    if (!isLive) window.localStorage.setItem(storageKey, JSON.stringify(next))
    showToast("Blocked time removed")
  }

  return <div className="dashboard-shell block-time-shell">
    <OwnerSidebar user={user} active="Calendar" open={sidebarOpen} onClose={() => setSidebarOpen(false)} onNavigate={(path) => window.location.assign(path)} />
    <div className="dashboard-content"><header className="dashboard-header"><OwnerMobileMenuButton onOpen={() => setSidebarOpen(true)} /><div className="dashboard-header-context"><span>Block time</span><small>Owner workspace</small></div></header>
      <main className="dashboard-main block-time-main"><div className="dashboard-page-heading"><div><p className="dashboard-kicker">Calendar controls</p><h1>Block time</h1><p>Keep appointments away from breaks, personal commitments, maintenance, or private events.</p></div><button type="button" onClick={() => setOpen(true)}><Plus size={16} /> Block time</button></div>
        <section className="block-time-card"><div className="block-time-card-heading"><span className="advanced-icon"><Ban size={19} /></span><div><h2>Unavailable periods</h2><p>Blocked periods are respected by public booking availability.</p></div></div>{loading ? <LoadingState label="Loading blocked periods…" /> : events.length ? <div className="block-time-list">{events.map((event) => <article key={event.id}><div><strong>{event.title}</strong><small>{event.event_date} · {event.start_time} · {event.duration_minutes} min{event.personal_event ? " · Personal" : ""}</small>{event.notes && <p>{event.notes}</p>}</div><button type="button" onClick={() => void remove(event)} aria-label={`Remove ${event.title}`}><Trash2 size={15} /></button></article>)}</div> : <EmptyState title="No blocked periods yet" description="Add a break or private event to protect that time from bookings." />}</section>
        {open && <div className="class-session-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}><section className="class-session-modal" role="dialog" aria-modal="true" aria-labelledby="block-time-title"><header><h2 id="block-time-title">Block time</h2><button type="button" onClick={() => setOpen(false)} aria-label="Close"><X size={17} /></button></header><label>Title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="e.g. Lunch break or private event" /></label><label>Notes<textarea rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Optional internal note" /></label><div className="class-session-fields"><label>Date<input type="date" value={draft.event_date} onChange={(event) => setDraft({ ...draft, event_date: event.target.value })} /></label><label>Start time<input type="time" value={draft.start_time} onChange={(event) => setDraft({ ...draft, start_time: event.target.value })} /></label><label>Duration<input type="number" min={5} max={1440} value={draft.duration_minutes} onChange={(event) => setDraft({ ...draft, duration_minutes: Number(event.target.value) })} /></label></div><label className="advanced-check"><input type="checkbox" checked={draft.personal_event} onChange={(event) => setDraft({ ...draft, personal_event: event.target.checked })} /><span>Personal/private event</span></label><footer><button type="button" onClick={() => setOpen(false)}>Cancel</button><button type="button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Block time"}</button></footer></section></div>}
      </main>
    </div>
  </div>
}
