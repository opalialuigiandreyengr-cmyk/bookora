import { useEffect, useMemo, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { BarChart3, CalendarDays, CheckCircle2, Download, Printer, TrendingUp, Users, XCircle } from "lucide-react"
import { OwnerMobileMenuButton, OwnerSidebar } from "@/components/owner/OwnerSidebar"
import { showToast } from "@/components/ui/toast"
import { supabase } from "@/lib/supabase"
import { buildDemoAppointments, type CalendarAppointment, toDateKey } from "@/pages/calendar/types"

type PaymentRow = { id: string; appointment_id: string | null; amount: number; status: string; created_at: string }
type StaffRow = { id: string; full_name: string }
type ReportSchedule = { recipient_email: string; frequency: "weekly" | "monthly"; send_day: number; time_zone: string; enabled: boolean }

const amount = (value: string) => Number(value.replace(/[^0-9.-]/g, "")) || 0
const money = (value: number) => value.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 })
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`
const dateKeyInZone = (date: Date, timeZone: string) => {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date) }
  catch { return toDateKey(date) }
}

export function ReportsPage({ user }: { user: User; onSignOut: () => void }) {
  const reportTimeZone = String(user.user_metadata?.time_zone || "Asia/Manila")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [from, setFrom] = useState(() => { const date = new Date(); date.setDate(1); return dateKeyInZone(date, reportTimeZone) })
  const [to, setTo] = useState(() => dateKeyInZone(new Date(), reportTimeZone))
  const [staffFilter, setStaffFilter] = useState("all")
  const [serviceFilter, setServiceFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const defaultTimeZone = String(user.user_metadata?.time_zone || "Asia/Manila")
  const [schedule, setSchedule] = useState<ReportSchedule>({ recipient_email: user.email || "", frequency: "weekly", send_day: 1, time_zone: defaultTimeZone, enabled: false })
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const isLive = Boolean(supabase && user.id !== "preview-user-123")

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true); setError("")
      if (isLive && supabase) {
        const [appointmentResult, paymentResult, staffResult, scheduleResult] = await Promise.all([
          supabase.from("appointments").select("*").eq("business_id", user.id).order("appointment_date"),
          supabase.from("payment_transactions").select("id, appointment_id, amount, status, created_at").eq("business_id", user.id),
          supabase.from("staff_members").select("id, full_name").eq("business_id", user.id).order("full_name"),
          supabase.from("report_schedules").select("recipient_email, frequency, send_day, time_zone, enabled").eq("business_id", user.id).maybeSingle(),
        ])
        if (!active) return
        if (appointmentResult.error) setError(appointmentResult.error.message)
        setAppointments((appointmentResult.data || []) as CalendarAppointment[])
        setPayments((paymentResult.data || []) as PaymentRow[])
        setStaff((staffResult.data || []) as StaffRow[])
        if (scheduleResult.data) setSchedule({ recipient_email: scheduleResult.data.recipient_email || user.email || "", frequency: scheduleResult.data.frequency === "monthly" ? "monthly" : "weekly", send_day: Number(scheduleResult.data.send_day) || 1, time_zone: String(scheduleResult.data.time_zone || defaultTimeZone), enabled: Boolean(scheduleResult.data.enabled) })
      } else if (active) {
        const saved = window.localStorage.getItem(`bookora-report-schedule-${user.id}`)
        setAppointments(buildDemoAppointments(new Date(), user.id))
        if (saved) { try { const parsed = JSON.parse(saved) as Partial<ReportSchedule>; setSchedule((current) => ({ ...current, ...parsed, time_zone: parsed.time_zone || defaultTimeZone })) } catch { /* keep defaults */ } }
      }
      if (active) setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [isLive, user.id, user.email])

  const serviceOptions = useMemo(() => [...new Set(appointments.map((item) => item.service_names).filter(Boolean))].sort(), [appointments])
  const filtered = useMemo(() => appointments.filter((item) => item.appointment_date >= from && item.appointment_date <= to && (staffFilter === "all" || item.staff_member_id === staffFilter) && (serviceFilter === "all" || item.service_names === serviceFilter) && (statusFilter === "all" || item.status === statusFilter)), [appointments, from, serviceFilter, staffFilter, statusFilter, to])
  const activeAppointments = filtered.filter((item) => !["cancelled", "no_show"].includes(item.status))
  const completed = filtered.filter((item) => item.status === "completed").length
  const cancelled = filtered.filter((item) => item.status === "cancelled").length
  const noShows = filtered.filter((item) => item.status === "no_show").length
  const revenue = activeAppointments.reduce((sum, item) => sum + amount(item.total_price), 0)
  const completionRate = activeAppointments.length ? Math.round((completed / activeAppointments.length) * 100) : 0
  const firstByCustomer = useMemo(() => {
    const result = new Map<string, string>()
    for (const item of [...appointments].sort((a, b) => `${a.appointment_date} ${a.appointment_time}`.localeCompare(`${b.appointment_date} ${b.appointment_time}`))) {
      const key = (item.customer_email || item.customer_name).trim().toLowerCase()
      if (key && !result.has(key)) result.set(key, item.id)
    }
    return result
  }, [appointments])
  const newCustomers = filtered.filter((item) => firstByCustomer.get((item.customer_email || item.customer_name).trim().toLowerCase()) === item.id).length
  const returningBookings = Math.max(0, filtered.length - newCustomers)
  const filteredIds = new Set(filtered.map((item) => item.id))
  const matchedPayments = payments.filter((item) => item.status === "paid" && item.appointment_id && filteredIds.has(item.appointment_id))
  const unmatchedPayments = payments.filter((item) => item.status === "paid" && (!item.appointment_id || !filteredIds.has(item.appointment_id)))
  const collected = matchedPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const dailyTrend = filtered.reduce((map, item) => map.set(item.appointment_date, (map.get(item.appointment_date) || 0) + 1), new Map<string, number>())
  const services = [...filtered.reduce((map, item) => map.set(item.service_names, (map.get(item.service_names) || 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const staffCounts = filtered.reduce((map, item) => { const name = staff.find((member) => member.id === item.staff_member_id)?.full_name || "Unassigned"; return map.set(name, (map.get(name) || 0) + 1) }, new Map<string, number>())
  const locationCounts = filtered.reduce((map, item) => { const name = item.location_name?.trim() || "Default location"; return map.set(name, (map.get(name) || 0) + 1) }, new Map<string, number>())

  const exportCsv = () => {
    const rows = [["Date", "Client", "Email", "Service", "Status", "Value"], ...filtered.map((item) => [item.appointment_date, item.customer_name, item.customer_email, item.service_names, item.status, amount(item.total_price).toFixed(2)])]
    const url = URL.createObjectURL(new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv" }))
    const link = document.createElement("a"); link.href = url; link.download = `bookora-report-${from}-${to}.csv`; link.click(); URL.revokeObjectURL(url); showToast("Report exported")
  }
  const printReport = () => {
    const popup = window.open("", "_blank", "width=900,height=800")
    if (!popup) { showToast("Allow pop-ups to print the report.", "error"); return }
    popup.document.write(`<html><head><title>Bookora report ${from} to ${to}</title><style>body{font:14px Arial;color:#18212b;margin:35px}h1{font-size:24px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:22px 0}.metric{border:1px solid #d8dfe6;border-radius:8px;padding:13px}.metric strong{display:block;font-size:20px;margin-top:6px}.row{padding:8px 0;border-bottom:1px solid #edf0f3}</style></head><body><h1>Bookora business report</h1><p>${from} to ${to}</p><div class="grid"><div class="metric">Bookings<strong>${filtered.length}</strong></div><div class="metric">Booked value<strong>${money(revenue)}</strong></div><div class="metric">New customers<strong>${newCustomers}</strong></div><div class="metric">Returning bookings<strong>${returningBookings}</strong></div></div><h2>Top services</h2>${services.map(([name, count]) => `<div class="row">${name} — ${count} bookings</div>`).join("")}<script>window.onload=()=>window.print()</script></body></html>`)
    popup.document.close()
  }
  const saveSchedule = async () => {
    if (schedule.enabled && !/^\S+@\S+\.\S+$/.test(schedule.recipient_email.trim())) { showToast("Add a valid report recipient email.", "error"); return }
    setScheduleSaving(true)
    const payload = { business_id: user.id, ...schedule, recipient_email: schedule.recipient_email.trim(), updated_at: new Date().toISOString() }
    if (isLive && supabase) { const result = await supabase.from("report_schedules").upsert(payload, { onConflict: "business_id" }); if (result.error) { showToast(result.error.message, "error"); setScheduleSaving(false); return } }
    else window.localStorage.setItem(`bookora-report-schedule-${user.id}`, JSON.stringify(schedule))
    setScheduleSaving(false); showToast("Report schedule saved")
  }

  return <div className="dashboard-shell reports-page-shell"><OwnerSidebar user={user} active="Reports" open={sidebarOpen} onClose={() => setSidebarOpen(false)} onNavigate={(path) => window.location.assign(path)} /><div className="dashboard-content"><header className="dashboard-header"><OwnerMobileMenuButton onOpen={() => setSidebarOpen(true)} /><div className="dashboard-header-context"><span>Reports</span><small>Owner workspace</small></div></header><main className="dashboard-main reports-main"><div className="dashboard-page-heading"><div><p className="dashboard-kicker">Business pulse</p><h1>Reports</h1><p>Understand bookings, revenue, and service demand for a selected period.</p></div><div className="reports-heading-actions"><button className="reports-export-button" type="button" onClick={printReport} disabled={loading || !filtered.length}><Printer size={15} /> Print</button><button className="reports-export-button" type="button" onClick={exportCsv} disabled={loading || !filtered.length}><Download size={16} /> Export CSV</button></div></div><div className="reports-toolbar"><label><span>From</span><input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label><label><span>To</span><input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label><label><span>Staff</span><select value={staffFilter} onChange={(event) => setStaffFilter(event.target.value)}><option value="all">All staff</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select></label><label><span>Service</span><select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}><option value="all">All services</option>{serviceOptions.map((service) => <option key={service} value={service}>{service}</option>)}</select></label><label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="approved">Confirmed</option><option value="pending">Pending</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="no_show">No-show</option></select></label></div>{error && <div className="reports-error" role="alert">{error}</div>}{loading ? <div className="reports-empty">Loading report…</div> : !filtered.length ? <div className="reports-empty"><BarChart3 size={24} /><strong>No report data for this period</strong><span>Choose a wider date range or adjust the filters.</span></div> : <><section className="reports-metric-grid"><div><CalendarDays /><strong>{filtered.length}</strong><span>Bookings</span></div><div><TrendingUp /><strong>{money(revenue)}</strong><span>Booked value</span></div><div><CheckCircle2 /><strong>{completionRate}%</strong><span>Completion rate</span></div><div><XCircle /><strong>{cancelled}</strong><span>Cancelled</span></div><div><XCircle /><strong>{noShows}</strong><span>No-shows</span></div><div><Users /><strong>{newCustomers}</strong><span>New customers</span></div><div><Users /><strong>{returningBookings}</strong><span>Returning bookings</span></div></section><div className="reports-content-grid"><section className="reports-card"><header><div><p className="dashboard-kicker">Demand</p><h2>Top services</h2></div><BarChart3 size={19} /></header>{services.length ? <div className="reports-service-list">{services.map(([service, count]) => <div key={service}><span>{service}</span><strong>{count}<small> bookings</small></strong><i style={{ width: `${Math.max(12, (count / services[0][1]) * 100)}%` }} /></div>)}</div> : <div className="reports-empty compact">No service data.</div>}</section><section className="reports-card"><header><div><p className="dashboard-kicker">Customers</p><h2>New vs returning</h2></div><Users size={19} /></header><dl className="reports-summary-list"><div><dt>New customers</dt><dd>{newCustomers}</dd></div><div><dt>Returning bookings</dt><dd>{returningBookings}</dd></div><div><dt>Repeat share</dt><dd>{filtered.length ? Math.round((returningBookings / filtered.length) * 100) : 0}%</dd></div></dl></section></div><div className="reports-content-grid"><section className="reports-card"><header><div><p className="dashboard-kicker">Trend</p><h2>Booking activity</h2></div><TrendingUp size={19} /></header>{[...dailyTrend.entries()].slice(-7).map(([date, count]) => <div className="reports-trend-list" key={date}><span>{date}</span><i><b style={{ width: `${Math.max(10, (count / Math.max(...dailyTrend.values())) * 100)}%` }} /></i><strong>{count}</strong></div>)}</section><section className="reports-card"><header><div><p className="dashboard-kicker">Reconciliation</p><h2>Payments</h2></div></header><dl className="reports-summary-list"><div><dt>Collected in period</dt><dd>{money(collected)}</dd></div><div><dt>Matched transactions</dt><dd>{matchedPayments.length}</dd></div><div><dt>Unmatched paid transactions</dt><dd className={unmatchedPayments.length ? "reports-warning-value" : ""}>{unmatchedPayments.length}</dd></div></dl></section></div><div className="reports-content-grid"><section className="reports-card"><header><div><p className="dashboard-kicker">Ownership</p><h2>By staff</h2></div></header><dl className="reports-summary-list">{[...staffCounts.entries()].map(([name, count]) => <div key={name}><dt>{name}</dt><dd>{count}</dd></div>)}</dl></section><section className="reports-card"><header><div><p className="dashboard-kicker">Locations</p><h2>By location</h2></div></header><dl className="reports-summary-list">{[...locationCounts.entries()].map(([name, count]) => <div key={name}><dt>{name}</dt><dd>{count}</dd></div>)}</dl></section></div><section className="reports-schedule-card"><div><p className="dashboard-kicker">Automation</p><h2>Scheduled report</h2><p>Weekly reports send on the selected weekday (1=Monday); monthly reports send on the selected calendar day.</p></div><label><span>Recipient email</span><input type="email" value={schedule.recipient_email} onChange={(event) => setSchedule({ ...schedule, recipient_email: event.target.value })} placeholder="owner@business.com" /></label><label><span>Frequency</span><select value={schedule.frequency} onChange={(event) => { const frequency = event.target.value as ReportSchedule["frequency"]; setSchedule({ ...schedule, frequency, send_day: frequency === "weekly" ? Math.min(schedule.send_day, 7) : schedule.send_day }) }}><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label><span>Send day</span><input type="number" min={1} max={schedule.frequency === "weekly" ? 7 : 28} value={schedule.send_day} onChange={(event) => setSchedule({ ...schedule, send_day: Math.max(1, Math.min(schedule.frequency === "weekly" ? 7 : 28, Number(event.target.value) || 1)) })} /></label><label className="reports-schedule-toggle"><input type="checkbox" checked={schedule.enabled} onChange={(event) => setSchedule({ ...schedule, enabled: event.target.checked })} /><span>Enable schedule</span></label><button className="reports-export-button" type="button" onClick={() => void saveSchedule()} disabled={scheduleSaving}>{scheduleSaving ? "Saving…" : "Save schedule"}</button></section></>}</main></div></div>
}
