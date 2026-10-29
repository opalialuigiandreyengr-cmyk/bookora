import { useEffect, useMemo, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { Check, Clock3, Pencil, Plus, Search, ShieldCheck, Trash2, Users, X } from "lucide-react"
import { OwnerMobileMenuButton, OwnerSidebar } from "@/components/owner/OwnerSidebar"
import { supabase } from "@/lib/supabase"
import { showToast } from "@/components/ui/toast"
import { parseTimeToMinutes } from "@/pages/calendar/types"

type StaffRole = "owner" | "manager" | "staff" | "limited"
type StaffStatus = "active" | "invited" | "paused"
type Hours = { open: boolean; start: string; end: string }
type StaffMember = { id: string; full_name: string; email: string; phone: string; bio: string; role: StaffRole; status: StaffStatus; working_hours: Record<string, Hours>; time_off: string[]; service_ids: string[] }
type ServiceOption = { id: string; name: string }
type StaffAppointment = { id: string; staff_member_id: string | null; appointment_date: string; appointment_time: string; duration_minutes: number | null; status: string }

const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
const defaultHours = Object.fromEntries(dayNames.map((day, index) => [day, { open: index < 5, start: "09:00", end: "17:00" }])) as Record<string, Hours>
const roleLabels: Record<StaffRole, string> = { owner: "Owner", manager: "Manager", staff: "Staff", limited: "Limited access" }
const demoStaff: StaffMember[] = [
  { id: "demo-anna", full_name: "Anna Reyes", email: "anna@example.com", phone: "+63 917 204 8812", bio: "Senior nail artist", role: "staff", status: "active", working_hours: defaultHours, time_off: [], service_ids: [] },
  { id: "demo-liza", full_name: "Liza Gomez", email: "liza@example.com", phone: "+63 918 552 3109", bio: "Hair and color specialist", role: "manager", status: "active", working_hours: defaultHours, time_off: [], service_ids: [] },
]

function emptyStaff(): StaffMember { return { id: "", full_name: "", email: "", phone: "", bio: "", role: "staff", status: "invited", working_hours: structuredClone(defaultHours), time_off: [], service_ids: [] } }
function normalizeStaff(row: Record<string, unknown>): StaffMember { return { id: String(row.id || ""), full_name: String(row.full_name || ""), email: String(row.email || ""), phone: String(row.phone || ""), bio: String(row.bio || ""), role: (["owner", "manager", "staff", "limited"] as string[]).includes(String(row.role)) ? row.role as StaffRole : "staff", status: (["active", "invited", "paused"] as string[]).includes(String(row.status)) ? row.status as StaffStatus : "invited", working_hours: (row.working_hours as Record<string, Hours>) || structuredClone(defaultHours), time_off: Array.isArray(row.time_off) ? row.time_off.map(String) : [], service_ids: [] } }

export function StaffPage({ user }: { user: User; onSignOut: () => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [services, setServices] = useState<ServiceOption[]>([])
  const [staffAppointments, setStaffAppointments] = useState<StaffAppointment[]>([])
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<StaffMember | null>(null)
  const [removeCandidate, setRemoveCandidate] = useState<StaffMember | null>(null)
  const [timeOffDraft, setTimeOffDraft] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const isLive = Boolean(supabase && user.id !== "preview-user-123")

  const visibleStaff = useMemo(() => { const query = search.trim().toLowerCase(); return staff.filter((member) => !query || [member.full_name, member.email, roleLabels[member.role], member.status].some((value) => value.toLowerCase().includes(query))) }, [search, staff])

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      if (!isLive || !supabase) {
        let localStaff = demoStaff
        try { const stored = window.localStorage.getItem(`bookora-staff-${user.id}`); localStaff = stored ? JSON.parse(stored) as StaffMember[] : demoStaff } catch { localStaff = demoStaff }
        if (active) setStaff(localStaff)
        setLoading(false)
        return
      }
      const [staffResult, servicesResult, appointmentsResult] = await Promise.all([supabase.from("staff_members").select("*").eq("business_id", user.id).order("created_at", { ascending: true }), supabase.from("services").select("id, name").eq("business_id", user.id).order("created_at", { ascending: true }), supabase.from("appointments").select("id, staff_member_id, appointment_date, appointment_time, duration_minutes, status").eq("business_id", user.id).not("staff_member_id", "is", null).gte("appointment_date", new Date().toISOString().slice(0, 10))])
      if (!active) return
      if (staffResult.error) setError(staffResult.error.message)
      const rows = (staffResult.data || []).map((row) => normalizeStaff(row as Record<string, unknown>))
      if (rows.length) { const assignments = await supabase.from("staff_service_assignments").select("staff_id, service_id").in("staff_id", rows.map((member) => member.id)); for (const row of assignments.data || []) { const member = rows.find((item) => item.id === String(row.staff_id)); if (member) member.service_ids.push(String(row.service_id)) } }
      setStaff(rows); setServices((servicesResult.data || []).map((row) => ({ id: String(row.id), name: String(row.name) }))); setLoading(false)
      setStaffAppointments((appointmentsResult.data || []) as StaffAppointment[])
    }
    void load()
    return () => { active = false }
  }, [isLive, user.id])

  useEffect(() => {
    if (!selected) return
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null) }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [selected])

  const openEditor = (member: StaffMember) => { setTimeOffDraft(""); setSelected({ ...member, working_hours: structuredClone(member.working_hours), time_off: [...member.time_off], service_ids: [...member.service_ids] }) }
  const persistPreview = (next: StaffMember[]) => window.localStorage.setItem(`bookora-staff-${user.id}`, JSON.stringify(next))
  const updateHours = (day: string, change: Partial<Hours>) => setSelected((current) => current ? { ...current, working_hours: { ...current.working_hours, [day]: { ...(current.working_hours[day] || { open: false, start: "09:00", end: "17:00" }), ...change } } } : current)

  const sendInvite = async (member: StaffMember) => {
    if (!isLive || !supabase || member.status !== "invited") return
    const result = await supabase.functions.invoke("send-staff-invite", { body: { staffMemberId: member.id, email: member.email, fullName: member.full_name, businessName: String(user.user_metadata?.business_name || "your business"), redirectTo: `${window.location.origin}/auth` } })
    if (result.error) { showToast("Staff saved, but the activation email could not be sent.", "error"); return }
    if (result.data?.actionLink) { try { await navigator.clipboard?.writeText(String(result.data.actionLink)); showToast("Staff saved. Activation link copied because email delivery is not configured.") } catch { showToast("Staff saved. Configure email delivery to send the activation link.") } }
    else showToast("Staff saved and activation email queued")
  }

  const saveStaff = async (draft: StaffMember) => {
    if (!draft.full_name.trim() || !draft.email.trim()) { showToast("Add a name and email first.", "error"); return }
    const invalidDay = Object.entries(draft.working_hours).find(([, hours]) => hours.open && (!hours.start || !hours.end || hours.start >= hours.end))
    if (invalidDay) { showToast(`${invalidDay[0]} needs a valid start and end time.`, "error"); return }
    const conflicts = staffAppointments.filter((appointment) => appointment.staff_member_id === draft.id && !["cancelled", "no_show"].includes(appointment.status)).filter((appointment) => {
      const date = new Date(`${appointment.appointment_date}T12:00:00`)
      const dayName = dayNames[date.getDay() === 0 ? 6 : date.getDay() - 1]
      const hours = draft.working_hours[dayName]
      if (!hours?.open) return true
      const start = parseTimeToMinutes(appointment.appointment_time)
      const end = start + Math.max(Number(appointment.duration_minutes) || 60, 1)
      return start < parseTimeToMinutes(hours.end) && end > parseTimeToMinutes(hours.start)
    })
    if (conflicts.length) { showToast(`${conflicts.length} upcoming appointment${conflicts.length === 1 ? "" : "s"} fall outside this availability. Adjust the schedule or review the appointments.`, "error"); return }
    setSaving(true)
    const payload = { business_id: user.id, full_name: draft.full_name.trim(), email: draft.email.trim(), phone: draft.phone.trim(), bio: draft.bio.trim(), role: draft.role, status: draft.status, working_hours: draft.working_hours, time_off: draft.time_off }
    if (!isLive || !supabase) { const saved = { ...draft, id: draft.id || `demo-${Date.now()}` }; const next = draft.id ? staff.map((item) => item.id === draft.id ? saved : item) : [...staff, saved]; setStaff(next); persistPreview(next); setSelected(saved); showToast("Staff member saved"); setSaving(false); return }
    const result = draft.id ? await supabase.from("staff_members").update(payload).eq("id", draft.id).eq("business_id", user.id).select("*").single() : await supabase.from("staff_members").insert(payload).select("*").single()
    if (result.error) showToast(result.error.message, "error")
    else { const saved = normalizeStaff(result.data as Record<string, unknown>); await supabase.from("staff_service_assignments").delete().eq("staff_id", saved.id); if (draft.service_ids.length) await supabase.from("staff_service_assignments").insert(draft.service_ids.map((serviceId) => ({ staff_id: saved.id, service_id: serviceId }))); saved.service_ids = draft.service_ids; setStaff((current) => draft.id ? current.map((item) => item.id === draft.id ? saved : item) : [...current, saved]); setSelected(saved); showToast("Staff member saved"); await sendInvite(saved) }
    setSaving(false)
  }

  const removeStaff = async (member: StaffMember) => {
    if (!removeCandidate || removeCandidate.id !== member.id) { setRemoveCandidate(member); return }
    if (isLive && supabase) { const result = await supabase.from("staff_members").delete().eq("id", member.id).eq("business_id", user.id); if (result.error) { showToast(result.error.message, "error"); return } }
    const next = staff.filter((item) => item.id !== member.id); setStaff(next); if (!isLive) persistPreview(next); setSelected(null); setRemoveCandidate(null); showToast("Staff member removed")
  }

  return <div className="dashboard-shell staff-page-shell"><OwnerSidebar user={user} active="Staff" open={sidebarOpen} onClose={() => setSidebarOpen(false)} onNavigate={(path) => window.location.assign(path)} /><div className="dashboard-content"><header className="dashboard-header staff-page-header"><OwnerMobileMenuButton onOpen={() => setSidebarOpen(true)} /><div className="dashboard-header-context"><span>Staff</span><small>Owner workspace</small></div></header><main className="dashboard-main staff-page-main"><div className="dashboard-page-heading staff-heading"><div><p className="dashboard-kicker">Team and access</p><h1>Staff</h1><p>Manage your team, permissions, and working hours in one place.</p></div><button className="staff-primary-button" type="button" onClick={() => setSelected(emptyStaff())}><Plus size={16} /> Invite staff</button></div>{error && <div className="staff-error" role="alert">{error}</div>}<section className="staff-summary"><div><Users /><strong>{staff.length}</strong><span>Team members</span></div><div><ShieldCheck /><strong>{staff.filter((member) => member.status === "active").length}</strong><span>Active access</span></div><div><Clock3 /><strong>{staff.filter((member) => Object.values(member.working_hours).some((day) => day.open)).length}</strong><span>With availability</span></div></section><div className="staff-toolbar"><label className="staff-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff" aria-label="Search staff" /></label><span className="staff-result-count">{visibleStaff.length} member{visibleStaff.length === 1 ? "" : "s"}</span></div>{loading ? <div className="staff-empty"><span className="staff-spinner" /> Loading staff…</div> : visibleStaff.length === 0 ? <div className="staff-empty"><Users size={22} /><strong>{staff.length ? "No matching staff" : "No staff yet"}</strong><span>{staff.length ? "Try a different name, email, or role." : "Invite your first team member to start assigning services and schedules."}</span>{staff.length === 0 && <button type="button" onClick={() => openEditor(emptyStaff())}>Invite staff</button>}</div> : <section className="staff-list" aria-label="Staff members">{visibleStaff.map((member) => <article className="staff-card" key={member.id}><div className="staff-avatar">{member.full_name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?"}</div><div className="staff-card-main"><div className="staff-card-title"><div><h2>{member.full_name}</h2><p>{member.email}</p></div><button className="staff-icon-button" type="button" aria-label={`Edit ${member.full_name}`} onClick={() => openEditor(member)}><Pencil size={15} /></button></div><div className="staff-card-meta"><span className={`staff-status ${member.status}`}><i />{member.status}</span><span className="staff-role">{roleLabels[member.role]}</span><span>{Object.values(member.working_hours).filter((day) => day.open).length} working days</span></div></div></article>)}</section>}</main></div>
    {selected && <div className="staff-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}><aside className="staff-drawer" role="dialog" aria-modal="true" aria-labelledby="staff-drawer-title"><header><div><p className="dashboard-kicker">Team member</p><h2 id="staff-drawer-title">{selected.id ? "Edit staff member" : "Invite staff"}</h2><p className="staff-drawer-note">Set access, availability, and services for this team member.</p></div><button type="button" aria-label="Close staff editor" onClick={() => setSelected(null)}><X size={18} /></button></header><div className="staff-form"><fieldset><legend>Profile</legend><label>Name<input value={selected.full_name} onChange={(event) => setSelected({ ...selected, full_name: event.target.value })} placeholder="e.g. Mia Santos" maxLength={100} required /></label><label>Email<input type="email" value={selected.email} onChange={(event) => setSelected({ ...selected, email: event.target.value })} placeholder="name@business.com" maxLength={150} required /></label><label>Phone<input value={selected.phone} onChange={(event) => setSelected({ ...selected, phone: event.target.value })} placeholder="Optional" maxLength={40} /></label><label>Bio<textarea value={selected.bio} onChange={(event) => setSelected({ ...selected, bio: event.target.value })} placeholder="Short profile description" rows={3} maxLength={240} /></label></fieldset><fieldset><legend>Access</legend><label>Role<select value={selected.role} onChange={(event) => setSelected({ ...selected, role: event.target.value as StaffRole })}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Status<select value={selected.status} onChange={(event) => setSelected({ ...selected, status: event.target.value as StaffStatus })}><option value="invited">Invited</option><option value="active">Active</option><option value="paused">Paused</option></select></label></fieldset><fieldset><legend>Availability</legend><div className="staff-day-list">{dayNames.map((day) => { const hours = selected.working_hours[day] || { open: false, start: "09:00", end: "17:00" }; return <div className="staff-day-row" key={day}><button type="button" className={hours.open ? "selected" : ""} aria-pressed={hours.open} onClick={() => updateHours(day, { open: !hours.open })}><span>{day}</span>{hours.open ? <Check size={14} /> : <span>Off</span>}</button>{hours.open && <div className="staff-time-inputs"><label><span>Opens</span><input type="time" value={hours.start} aria-label={`${day} opening time`} onChange={(event) => updateHours(day, { start: event.target.value })} /></label><span aria-hidden="true">to</span><label><span>Closes</span><input type="time" value={hours.end} aria-label={`${day} closing time`} onChange={(event) => updateHours(day, { end: event.target.value })} /></label></div>}</div> })}</div></fieldset><fieldset><legend>Time off</legend><div className="staff-timeoff-add"><label className="sr-only" htmlFor="staff-timeoff-date">Time off date</label><input id="staff-timeoff-date" type="date" value={timeOffDraft} onChange={(event) => setTimeOffDraft(event.target.value)} /><button type="button" onClick={() => { if (timeOffDraft && !selected.time_off.includes(timeOffDraft)) setSelected({ ...selected, time_off: [...selected.time_off, timeOffDraft].sort() }); setTimeOffDraft("") }}>Add day</button></div>{selected.time_off.length > 0 && <ul className="staff-timeoff-list">{selected.time_off.map((date) => <li key={date}><span>{date}</span><button type="button" aria-label={`Remove time off ${date}`} onClick={() => setSelected({ ...selected, time_off: selected.time_off.filter((item) => item !== date) })}><X size={13} /></button></li>)}</ul>}</fieldset>{services.length > 0 && <fieldset><legend>Assigned services</legend><div className="staff-service-options">{services.map((service) => <label key={service.id}><input type="checkbox" checked={selected.service_ids.includes(service.id)} onChange={(event) => setSelected({ ...selected, service_ids: event.target.checked ? [...selected.service_ids, service.id] : selected.service_ids.filter((id) => id !== service.id) })} />{service.name}</label>)}</div></fieldset>}</div><footer><button type="button" className="staff-secondary-button" onClick={() => setSelected(null)}>Cancel</button>{selected.id && <button type="button" className="staff-danger-button" onClick={() => removeStaff(selected)}><Trash2 size={15} /> Remove</button>}<button type="button" className="staff-primary-button" disabled={saving} onClick={() => void saveStaff(selected)}>{saving ? "Saving…" : selected.id ? "Save changes" : "Save invited staff"}</button></footer></aside></div>}
    {removeCandidate && <div className="staff-confirm-backdrop" role="presentation"><div className="staff-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="remove-staff-title" aria-describedby="remove-staff-description"><h2 id="remove-staff-title">Remove {removeCandidate.full_name}?</h2><p id="remove-staff-description">This removes the staff profile and its service assignments. Their sign-in access will need to be handled separately.</p><footer><button type="button" className="staff-secondary-button" onClick={() => setRemoveCandidate(null)}>Keep staff member</button><button type="button" className="staff-danger-button" onClick={() => void removeStaff(removeCandidate)}>Remove staff</button></footer></div></div>}
  </div>
}
