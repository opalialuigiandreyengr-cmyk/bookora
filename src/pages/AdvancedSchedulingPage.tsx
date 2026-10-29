import { useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { CalendarClock, Check, Plus, Trash2, Users, X } from "lucide-react"
import { OwnerMobileMenuButton, OwnerSidebar } from "@/components/owner/OwnerSidebar"
import { hasSupabaseConfig, supabase } from "@/lib/supabase"
import { showToast } from "@/components/ui/toast"

type Props = { user: User; onSignOut: () => void }
type Settings = { waitlist_enabled: boolean; daily_capacity: number; resources: string[]; private_booking_enabled: boolean; seasonal_availability_enabled: boolean }
type ClassSession = { id: string; name: string; description: string; session_date: string; start_time: string; duration_minutes: number; capacity: number; enrolled_count: number; status: string }
const defaults: Settings = { waitlist_enabled: true, daily_capacity: 0, resources: [], private_booking_enabled: false, seasonal_availability_enabled: false }

export function AdvancedSchedulingPage({ user, onSignOut }: Props) {
  const isLive = hasSupabaseConfig && Boolean(supabase) && user.id !== "preview-user-123"
  const storageKey = `bookora-advanced-scheduling-${user.id}`
  const classStorageKey = `bookora-class-sessions-${user.id}`
  const [settings, setSettings] = useState<Settings>(defaults)
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [resourceDraft, setResourceDraft] = useState("")
  const [classOpen, setClassOpen] = useState(false)
  const [classDraft, setClassDraft] = useState({ name: "", description: "", session_date: "", start_time: "09:00", duration_minutes: 60, capacity: 10 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const load = async () => {
      if (isLive && supabase) {
        const [settingsResult, sessionsResult] = await Promise.all([
          supabase.from("scheduling_settings").select("waitlist_enabled, daily_capacity, resources, private_booking_enabled, seasonal_availability_enabled").eq("business_id", user.id).maybeSingle(),
          supabase.from("class_sessions").select("id, name, description, session_date, start_time, duration_minutes, capacity, enrolled_count, status").eq("business_id", user.id).order("session_date").order("start_time"),
        ])
        if (settingsResult.error) setError(settingsResult.error.message)
        else if (settingsResult.data) setSettings({ ...defaults, ...settingsResult.data })
        if (!sessionsResult.error) setSessions((sessionsResult.data || []) as ClassSession[])
      } else {
        try {
          const raw = window.localStorage.getItem(storageKey)
          if (raw) setSettings({ ...defaults, ...JSON.parse(raw) })
          const classRaw = window.localStorage.getItem(classStorageKey)
          if (classRaw) setSessions(JSON.parse(classRaw) as ClassSession[])
        } catch { /* defaults */ }
      }
      setLoading(false)
    }
    void load()
  }, [isLive, storageKey, classStorageKey, user.id])

  const save = async () => {
    setSaving(true)
    if (isLive && supabase) {
      const result = await supabase.from("scheduling_settings").upsert({ business_id: user.id, ...settings }, { onConflict: "business_id" })
      if (result.error) { showToast(result.error.message, "error"); setSaving(false); return }
    } else window.localStorage.setItem(storageKey, JSON.stringify(settings))
    setSaving(false)
    showToast("Scheduling settings saved")
  }

  const addResource = () => {
    const value = resourceDraft.trim()
    if (!value || settings.resources.includes(value)) return
    setSettings({ ...settings, resources: [...settings.resources, value] })
    setResourceDraft("")
  }

  const saveClass = async () => {
    if (!classDraft.name.trim() || !classDraft.session_date || classDraft.capacity < 1) { showToast("Add a class name, date, and capacity.", "error"); return }
    const payload = { business_id: user.id, ...classDraft, name: classDraft.name.trim(), description: classDraft.description.trim(), status: "scheduled", enrolled_count: 0 }
    setSaving(true)
    if (isLive && supabase) {
      const result = await supabase.from("class_sessions").insert(payload).select("id, name, description, session_date, start_time, duration_minutes, capacity, enrolled_count, status").single()
      if (result.error) { showToast(result.error.message, "error"); setSaving(false); return }
      setSessions((current) => [...current, result.data as ClassSession].sort((a, b) => `${a.session_date}${a.start_time}`.localeCompare(`${b.session_date}${b.start_time}`)))
    } else {
      const next = [...sessions, { ...payload, id: `demo-class-${Date.now()}` } as ClassSession]
      setSessions(next)
      window.localStorage.setItem(classStorageKey, JSON.stringify(next))
    }
    setClassDraft({ name: "", description: "", session_date: "", start_time: "09:00", duration_minutes: 60, capacity: 10 })
    setClassOpen(false); setSaving(false); showToast("Class session added")
  }

  const removeClass = async (session: ClassSession) => {
    if (!window.confirm(`Remove ${session.name}?`)) return
    if (isLive && supabase) { const result = await supabase.from("class_sessions").delete().eq("id", session.id).eq("business_id", user.id); if (result.error) { showToast(result.error.message, "error"); return } }
    const next = sessions.filter((item) => item.id !== session.id)
    setSessions(next)
    if (!isLive) window.localStorage.setItem(classStorageKey, JSON.stringify(next))
    showToast("Class session removed")
  }

  return <div className="dashboard-shell advanced-scheduling-shell">
    <OwnerSidebar user={user} active="Calendar" open={sidebarOpen} onClose={() => setSidebarOpen(false)} onNavigate={(path) => window.location.assign(path)} />
    <div className="dashboard-content">
      <header className="dashboard-header"><OwnerMobileMenuButton onOpen={() => setSidebarOpen(true)} /><div className="dashboard-header-context"><span>Advanced scheduling</span><small>Owner workspace</small></div></header>
      <main className="dashboard-main advanced-scheduling-main">
        <div className="dashboard-page-heading"><div><p className="dashboard-kicker">Phase 9 controls</p><h1>Advanced scheduling</h1><p>Set the guardrails that keep complex bookings predictable for your team and clients.</p></div><button className="advanced-save-button" type="button" disabled={saving || loading} onClick={() => void save()}>{saving ? "Saving…" : "Save settings"}</button></div>
        {error && <div className="advanced-error" role="alert">{error}</div>}
        <div className="advanced-grid">
          <section className="advanced-card"><span className="advanced-icon"><CalendarClock size={19} /></span><h2>Capacity and waitlist</h2><p>Prevent overbooking and capture demand when the day is full.</p><label>Daily appointment capacity<input type="number" min={0} max={500} value={settings.daily_capacity} onChange={(event) => setSettings({ ...settings, daily_capacity: Math.max(0, Math.min(500, Number(event.target.value) || 0)) })} /><small>Use 0 for unlimited capacity.</small></label><label className="advanced-check"><input type="checkbox" checked={settings.waitlist_enabled} onChange={(event) => setSettings({ ...settings, waitlist_enabled: event.target.checked })} /><span>Allow customers to join a waitlist</span></label></section>
          <section className="advanced-card"><span className="advanced-icon"><Check size={19} /></span><h2>Availability modes</h2><p>Control which booking surfaces are visible while rules are being built out.</p><label className="advanced-check"><input type="checkbox" checked={settings.private_booking_enabled} onChange={(event) => setSettings({ ...settings, private_booking_enabled: event.target.checked })} /><span>Enable private booking links</span></label><label className="advanced-check"><input type="checkbox" checked={settings.seasonal_availability_enabled} onChange={(event) => setSettings({ ...settings, seasonal_availability_enabled: event.target.checked })} /><span>Enable seasonal availability rules</span></label></section>
          <section className="advanced-card advanced-resource-card"><span className="advanced-icon"><Plus size={19} /></span><h2>Resources and rooms</h2><p>Add rooms, chairs, or equipment that future bookings can reserve.</p><div className="advanced-resource-add"><input value={resourceDraft} onChange={(event) => setResourceDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addResource() } }} placeholder="e.g. Treatment room 1" /><button type="button" onClick={addResource} aria-label="Add resource"><Plus size={16} /></button></div><ul className="advanced-resource-list">{settings.resources.map((resource) => <li key={resource}><span>{resource}</span><button type="button" onClick={() => setSettings({ ...settings, resources: settings.resources.filter((item) => item !== resource) })} aria-label={`Remove ${resource}`}><Trash2 size={14} /></button></li>)}</ul>{settings.resources.length === 0 && <small className="advanced-muted">No resources added yet.</small>}</section>
        </div>
        <section className="class-sessions-card"><header><div><p className="dashboard-kicker">Group bookings</p><h2>Classes and group sessions</h2><p>Schedule a shared session with a capacity limit and track enrollment.</p></div><button type="button" onClick={() => setClassOpen(true)}><Plus size={15} /> New class</button></header>{sessions.length ? <div className="class-session-list">{sessions.map((session) => <article key={session.id}><div><strong>{session.name}</strong><small>{session.session_date} · {session.start_time} · {session.duration_minutes} min</small></div><span><Users size={14} /> {session.enrolled_count}/{session.capacity}</span><em className={session.status}>{session.status}</em><button type="button" aria-label={`Remove ${session.name}`} onClick={() => void removeClass(session)}><Trash2 size={14} /></button></article>)}</div> : <div className="advanced-muted">No group sessions scheduled yet.</div>}</section>
        {classOpen && <div className="class-session-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setClassOpen(false) }}><section className="class-session-modal" role="dialog" aria-modal="true" aria-labelledby="class-session-title"><header><h2 id="class-session-title">New class session</h2><button type="button" onClick={() => setClassOpen(false)} aria-label="Close"><X size={17} /></button></header><label>Class name<input value={classDraft.name} onChange={(event) => setClassDraft({ ...classDraft, name: event.target.value })} placeholder="e.g. Saturday Nail Art Workshop" /></label><label>Description<textarea rows={3} value={classDraft.description} onChange={(event) => setClassDraft({ ...classDraft, description: event.target.value })} /></label><div className="class-session-fields"><label>Date<input type="date" value={classDraft.session_date} onChange={(event) => setClassDraft({ ...classDraft, session_date: event.target.value })} /></label><label>Start time<input type="time" value={classDraft.start_time} onChange={(event) => setClassDraft({ ...classDraft, start_time: event.target.value })} /></label><label>Duration<input type="number" min={5} max={1440} value={classDraft.duration_minutes} onChange={(event) => setClassDraft({ ...classDraft, duration_minutes: Number(event.target.value) })} /></label><label>Capacity<input type="number" min={1} max={500} value={classDraft.capacity} onChange={(event) => setClassDraft({ ...classDraft, capacity: Number(event.target.value) })} /></label></div><footer><button type="button" onClick={() => setClassOpen(false)}>Cancel</button><button type="button" disabled={saving} onClick={() => void saveClass()}>{saving ? "Saving…" : "Save class"}</button></footer></section></div>}
      </main>
    </div>
  </div>
}
