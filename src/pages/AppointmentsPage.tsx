import { useEffect, useMemo, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { ArrowRight, CalendarDays, CheckCircle2, ChevronDown, Clock3, Download, Search, X } from "lucide-react"
import { OwnerMobileMenuButton, OwnerSidebar } from "@/components/owner/OwnerSidebar"
import { supabase } from "@/lib/supabase"
import { showToast } from "@/components/ui/toast"
import { AppointmentDrawer } from "@/pages/calendar/AppointmentDrawer"
import { buildDemoAppointments, type CalendarAppointment, parseDateKey, pickAppointmentColor } from "@/pages/calendar/types"
import { OwnerPagination, OwnerStatusBadge } from "@/components/owner/OwnerDataPrimitives"

type Status = CalendarAppointment["status"]
const statusLabels: Record<Status, string> = { approved: "Approved", pending: "Pending", completed: "Completed", cancelled: "Cancelled", no_show: "No-show" }
const statusTones: Record<Status, "info" | "warning" | "success" | "danger"> = { approved: "info", pending: "warning", completed: "success", cancelled: "danger", no_show: "danger" }

export function AppointmentsPage({ user }: { user: User; onSignOut: () => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([])
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<"all" | Status>("all")
  const [date, setDate] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selected, setSelected] = useState<CalendarAppointment | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [undoSnapshot, setUndoSnapshot] = useState<CalendarAppointment[] | null>(null)
  const [undoLabel, setUndoLabel] = useState("")
  const [page, setPage] = useState(1)
  const pageSize = 12
  const isLive = Boolean(supabase && user.id !== "preview-user-123")
  const storageKey = `bookora-calendar-appointments-${user.id}`

  const mapRow = (row: Record<string, unknown>): CalendarAppointment => {
    const rawStatus = String(row.status || "approved").toLowerCase()
    return { id: String(row.id), business_id: String(row.business_id), customer_name: String(row.customer_name || "Client"), customer_email: String(row.customer_email || ""), customer_phone: String(row.customer_phone || ""), customer_address: String(row.customer_address || ""), customer_note: String(row.customer_note || ""), service_names: String(row.service_names || "Appointment"), total_price: String(row.total_price || "₱0"), appointment_date: String(row.appointment_date || "").slice(0, 10), appointment_time: String(row.appointment_time || "10:00 AM"), duration_minutes: Number(row.duration_minutes) || 60, buffer_minutes: Number(row.buffer_minutes) || 0, no_show_reason: String(row.no_show_reason || ""), peg_image_path: (row.peg_image_path as string | null) ?? null, payment_receipt_path: (row.payment_receipt_path as string | null) ?? null, status: rawStatus === "completed" ? "completed" : rawStatus === "no_show" ? "no_show" : rawStatus === "cancelled" || rawStatus === "canceled" ? "cancelled" : rawStatus === "pending" ? "pending" : "approved", color: pickAppointmentColor(String(row.customer_name || row.id)) }
  }

  const load = async () => {
    setLoading(true); setError("")
    if (isLive && supabase) {
      const result = await supabase.from("appointments").select("*").eq("business_id", user.id).order("appointment_date", { ascending: true }).order("appointment_time", { ascending: true })
      if (result.error) setError(result.error.message); else setAppointments((result.data || []).map((row) => mapRow(row as Record<string, unknown>)))
    } else {
      try { const saved = window.localStorage.getItem(storageKey); setAppointments(saved ? JSON.parse(saved) as CalendarAppointment[] : buildDemoAppointments(new Date(), user.id)) } catch { setAppointments(buildDemoAppointments(new Date(), user.id)) }
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [isLive, user.id])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return appointments.filter((item) => (status === "all" || item.status === status) && (!date || item.appointment_date === date) && (!query || [item.customer_name, item.customer_email, item.customer_phone, item.service_names].some((value) => value.toLowerCase().includes(query))))
  }, [appointments, date, search, status])

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize))
  const pageRows = visible.slice((page - 1) * pageSize, page * pageSize)
  useEffect(() => { setPage(1) }, [date, search, status])
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [page, pageCount])

  const updateStatus = async (id: string, nextStatus: Status, noShowReason = "") => {
    const previous = appointments
    if (isLive && supabase) { const result = await supabase.from("appointments").update({ status: nextStatus, no_show_reason: nextStatus === "no_show" ? noShowReason : "" }).eq("id", id).eq("business_id", user.id); if (result.error) { showToast(result.error.message, "error"); return } }
    const next = appointments.map((item) => item.id === id ? { ...item, status: nextStatus } : item); setAppointments(next); setUndoSnapshot(previous); setUndoLabel("Status change"); if (!isLive) window.localStorage.setItem(storageKey, JSON.stringify(next)); setSelected((current) => current?.id === id ? { ...current, status: nextStatus } : current); showToast(`Appointment marked as ${statusLabels[nextStatus].toLowerCase()}`)
  }

  const bulkStatus = async (nextStatus: Status) => {
    if (!selectedIds.length) return
    const previous = appointments
    if (isLive && supabase) { const result = await supabase.from("appointments").update({ status: nextStatus, no_show_reason: "" }).in("id", selectedIds).eq("business_id", user.id); if (result.error) { showToast(result.error.message, "error"); return } }
    const next = appointments.map((item) => selectedIds.includes(item.id) ? { ...item, status: nextStatus } : item); const count = selectedIds.length; setAppointments(next); setUndoSnapshot(previous); setUndoLabel("Bulk status change"); setSelectedIds([]); if (!isLive) window.localStorage.setItem(storageKey, JSON.stringify(next)); showToast(`${count} appointment${count === 1 ? "" : "s"} marked as ${statusLabels[nextStatus].toLowerCase()}`)
  }

  const exportVisible = () => {
    const rows = visible.filter((item) => !selectedIds.length || selectedIds.includes(item.id))
    const csv = [["Client", "Email", "Service", "Date", "Time", "Status"], ...rows.map((item) => [item.customer_name, item.customer_email, item.service_names, item.appointment_date, item.appointment_time, statusLabels[item.status]])].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "bookora-appointments.csv"; link.click(); URL.revokeObjectURL(url); showToast("Appointment export downloaded")
  }

  const reschedule = async (appointment: CalendarAppointment) => {
    const nextDate = window.prompt("New date (YYYY-MM-DD)", appointment.appointment_date)?.trim(); if (!nextDate) return
    const nextTime = window.prompt("New time (for example, 2:30 PM)", appointment.appointment_time)?.trim(); if (!nextTime) return
    const toMinutes = (value: string) => { const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i); if (!match) return -1; let hour = Number(match[1]) % 12; if (match[3].toUpperCase() === "PM") hour += 12; return hour * 60 + Number(match[2]) }
    const start = toMinutes(nextTime); const end = start + Math.max(appointment.duration_minutes || 60, 1)
    const conflict = appointments.find((other) => other.id !== appointment.id && other.appointment_date === nextDate && other.status !== "cancelled" && other.status !== "no_show" && start < toMinutes(other.appointment_time) + Math.max(other.duration_minutes || 60, 1) && end > toMinutes(other.appointment_time))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || start < 0 || conflict) { showToast(conflict ? `That time overlaps ${conflict.customer_name}'s appointment.` : "Enter a valid date and a time like 2:30 PM.", "error"); return }
    if (isLive && supabase) { const result = await supabase.from("appointments").update({ appointment_date: nextDate, appointment_time: nextTime }).eq("id", appointment.id).eq("business_id", user.id); if (result.error) { showToast(result.error.message, "error"); return } }
    const next = appointments.map((item) => item.id === appointment.id ? { ...item, appointment_date: nextDate, appointment_time: nextTime } : item); setAppointments(next); if (!isLive) window.localStorage.setItem(storageKey, JSON.stringify(next)); setSelected((current) => current?.id === appointment.id ? { ...current, appointment_date: nextDate, appointment_time: nextTime } : current); showToast("Appointment rescheduled")
  }

  const remove = async (id: string) => {
    if (!window.confirm("Remove this appointment from the calendar?")) return
    const previous = appointments
    if (isLive && supabase) { const result = await supabase.from("appointments").delete().eq("id", id).eq("business_id", user.id); if (result.error) { showToast(result.error.message, "error"); return } }
    const next = appointments.filter((item) => item.id !== id); setAppointments(next); setUndoSnapshot(previous); setUndoLabel("Appointment removal"); setSelectedIds((current) => current.filter((item) => item !== id)); if (!isLive) window.localStorage.setItem(storageKey, JSON.stringify(next)); setSelected(null); showToast("Appointment removed")
  }

  const clearFilters = () => { setSearch(""); setStatus("all"); setDate("") }
  const toggleVisible = () => setSelectedIds((current) => pageRows.every((item) => current.includes(item.id)) ? current.filter((id) => !pageRows.some((item) => item.id === id)) : Array.from(new Set([...current, ...pageRows.map((item) => item.id)])))
  const toggleSelected = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const undo = async () => {
    if (!undoSnapshot) return
    if (isLive && supabase) {
      const currentIds = appointments.map((item) => item.id)
      const restoredIds = undoSnapshot.map((item) => item.id)
      const removedIds = currentIds.filter((id) => !restoredIds.includes(id))
      if (removedIds.length) { const result = await supabase.from("appointments").insert(undoSnapshot.filter((item) => removedIds.includes(item.id)).map(({ color: _color, ...item }) => item)); if (result.error) { showToast(result.error.message, "error"); return } }
      for (const item of undoSnapshot.filter((candidate) => currentIds.includes(candidate.id))) { const result = await supabase.from("appointments").update({ status: item.status, no_show_reason: item.no_show_reason, appointment_date: item.appointment_date, appointment_time: item.appointment_time }).eq("id", item.id).eq("business_id", user.id); if (result.error) { showToast(result.error.message, "error"); return } }
    }
    setAppointments(undoSnapshot); if (!isLive) window.localStorage.setItem(storageKey, JSON.stringify(undoSnapshot)); setUndoSnapshot(null); setUndoLabel(""); showToast("Change undone")
  }
  useEffect(() => {
    const handleUndo = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && undoSnapshot) { event.preventDefault(); void undo() } }
    window.addEventListener("keydown", handleUndo)
    return () => window.removeEventListener("keydown", handleUndo)
  }, [undoSnapshot])

  return <div className="dashboard-shell appointments-page-shell"><OwnerSidebar user={user} active="Appointments" open={sidebarOpen} onClose={() => setSidebarOpen(false)} onNavigate={(path) => window.location.assign(path)} /><div className="dashboard-content"><header className="dashboard-header"><OwnerMobileMenuButton onOpen={() => setSidebarOpen(true)} /><div className="dashboard-header-context"><span>Appointments</span><small>Owner workspace</small></div></header><main className="dashboard-main appointments-main"><div className="dashboard-page-heading"><div><p className="dashboard-kicker">Every booking, in one place</p><h1>Appointments</h1><p>Review client details, update statuses, and keep your day moving.</p></div></div>{error && <div className="appointments-error" role="alert">{error}<button type="button" onClick={() => void load()}>Retry</button></div>}<section className="appointments-summary"><div><strong>{appointments.length}</strong><span>Total appointments</span></div><div><strong>{appointments.filter((item) => item.status === "pending").length}</strong><span>Pending</span></div><div><strong>{appointments.filter((item) => item.status === "completed").length}</strong><span>Completed</span></div><div><strong>{appointments.filter((item) => item.status === "no_show").length}</strong><span>No-shows</span></div></section><div className="appointments-toolbar"><label className="appointments-search"><Search size={16} /><input aria-label="Search appointments" placeholder="Search clients or services" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="appointments-filter"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as "all" | Status)}><option value="all">All statuses</option><option value="approved">Confirmed</option><option value="pending">Pending</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="no_show">No-show</option></select><ChevronDown size={14} /></label><label className="appointments-filter"><CalendarDays size={15} /><input type="date" aria-label="Filter by date" value={date} onChange={(event) => setDate(event.target.value)} /></label>{(search || date || status !== "all") && <button className="appointments-clear" type="button" onClick={clearFilters}><X size={14} /> Clear filters</button>}</div>{loading ? <div className="appointments-empty">Loading appointments…</div> : visible.length === 0 ? <div className="appointments-empty"><CalendarDays size={26} /><strong>No appointments found</strong><span>Try changing the filters or add a booking from the calendar.</span>{(search || date || status !== "all") && <button type="button" onClick={clearFilters}>Clear filters <ArrowRight size={14} /></button>}</div> : <section className="appointments-table-wrap" aria-label="Appointments list"><div className="appointments-bulk-toolbar"><label><input type="checkbox" checked={pageRows.length > 0 && pageRows.every((item) => selectedIds.includes(item.id))} onChange={toggleVisible} /> Select page</label>{selectedIds.length > 0 && <><span>{selectedIds.length} selected</span><button type="button" onClick={() => void bulkStatus("approved")}><CheckCircle2 size={14} /> Confirm</button><button type="button" onClick={() => void bulkStatus("cancelled")}>Cancel</button></>}<button type="button" onClick={exportVisible}><Download size={14} /> Export{selectedIds.length ? " selected" : ""}</button></div><table className="appointments-table"><thead><tr><th aria-label="Select" /><th>Client</th><th>Service</th><th>Date &amp; time</th><th>Status</th><th>Action</th></tr></thead><tbody>{pageRows.map((appointment) => <tr key={appointment.id}><td><input aria-label={`Select ${appointment.customer_name}`} type="checkbox" checked={selectedIds.includes(appointment.id)} onChange={() => toggleSelected(appointment.id)} /></td><td><button className="appointment-client-button" type="button" onClick={() => setSelected(appointment)}><span className={`cal-client-avatar ${appointment.color}`}>{appointment.customer_name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><span><strong>{appointment.customer_name}</strong><small>{appointment.customer_email || "No email provided"}</small></span></button></td><td>{appointment.service_names}<small>{appointment.total_price}</small></td><td><span className="appointment-time"><Clock3 size={14} />{parseDateKey(appointment.appointment_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span><small>{appointment.appointment_time}</small></td><td><OwnerStatusBadge label={statusLabels[appointment.status]} tone={statusTones[appointment.status]} /></td><td><button className="appointment-row-action" type="button" onClick={() => setSelected(appointment)}>View details</button></td></tr>)}</tbody></table><OwnerPagination page={page} pageCount={pageCount} onPageChange={setPage} /></section>}</main></div><AppointmentDrawer appointment={selected} onClose={() => setSelected(null)} onUpdateStatus={updateStatus} onReschedule={reschedule} onDelete={remove} /></div>
}
