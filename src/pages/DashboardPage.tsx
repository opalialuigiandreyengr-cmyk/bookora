import { useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { ArrowRight, BarChart3, Bell, CalendarDays, CalendarRange, ChevronDown, Clock3, CreditCard, Link2, ListChecks, MoreVertical, Plus, Search, Scissors, Upload, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { upcomingAppointments } from "@/data/mock"
import { SettingsPage } from "@/pages/SettingsPage"
import { ServicesPage as ServicesManagerPage } from "@/pages/ServicesPage"
import { OwnerSidebar, OwnerMobileMenuButton } from "@/components/owner/OwnerSidebar"
import { getOwnerRoute, getOwnerRouteByKey, type OwnerRouteKey } from "@/lib/ownerNavigation"

export function DashboardPage({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [active, setActive] = useState<OwnerRouteKey>(() => getOwnerRoute(window.location.pathname).key)
  const [open, setOpen] = useState(false)
  const name = String(user.user_metadata?.business_name ?? "Your business")
  const firstName = String(user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "there").split(" ")[0]
  const select = (path: string) => {
    if (path !== "/dashboard") {
      window.location.assign(path)
      return
    }
    setActive(getOwnerRoute(path).key)
    setOpen(false)
    window.history.replaceState({}, "", "/dashboard")
  }
  return <div className="dashboard-shell"> <OwnerSidebar user={user} active={active} open={open} onClose={() => setOpen(false)} onNavigate={select} /><div className="dashboard-content"><header className="dashboard-header"><OwnerMobileMenuButton onOpen={() => setOpen(true)} /><div className="dashboard-search"><Search /><input aria-label="Search" placeholder="Search anything..." /></div><div className="dashboard-header-actions"><button className="dashboard-icon-button" aria-label="Notifications"><Bell /><i /></button><span className="dashboard-divider" /><span className="user-avatar">{firstName.slice(0, 2).toUpperCase()}</span></div></header><main className="dashboard-main">{active === "Settings" ? <SettingsPage user={user} onSignOut={onSignOut} /> : active === "Services" ? <ServicesManagerPage user={user} onSignOut={onSignOut} /> : <Overview name={name} firstName={firstName} onNavigate={(item) => select(getOwnerRouteByKey(item).path)} />}</main></div></div>
}

type Service = { name: string; category: string; duration: string; price: string; color: string }

function LegacyServicesPage() {
  const [services, setServices] = useState<Service[]>([
    { name: "Gel Manicure", category: "Nails", duration: "60 min", price: "₱650", color: "coral" },
    { name: "Hair Treatment", category: "Hair", duration: "90 min", price: "₱1,200", color: "lavender" },
    { name: "Classic Facial", category: "Skin care", duration: "60 min", price: "₱900", color: "mint" },
  ])

  const addService = () => {
    setServices((current) => [...current, { name: "New service", category: "General", duration: "60 min", price: "₱0", color: "peach" }])
  }

  return <div className="services-page"><div className="dashboard-page-heading"><div><p className="dashboard-kicker">Your offerings</p><h1>Services</h1><p>Manage what clients can book and see your pricing at a glance.</p></div><Button onClick={addService}><Plus data-icon="inline-start" /> Add service</Button></div><div className="services-summary"><div><strong>{services.length}</strong><span>Active services</span></div><div><strong>₱917</strong><span>Average price</span></div><div><strong>60 min</strong><span>Average duration</span></div></div><section className="services-grid">{services.map((service, index) => <article className="service-card" key={`${service.name}-${index}`}><div className={`service-card-icon ${service.color}`}><Scissors /></div><div className="service-card-body"><div className="service-card-top"><div><span>{service.category}</span><h2>{service.name}</h2></div><button aria-label={`More options for ${service.name}`}>•••</button></div><div className="service-card-meta"><span><Clock3 /> {service.duration}</span><strong>{service.price}</strong></div></div></article>)}</section></div>
}

function ServicesPage() {
  const [services, setServices] = useState<Service[]>([
    { name: "Gel Manicure", category: "Nails", duration: "60 mins", price: "₱650", color: "coral" },
    { name: "Hair Treatment", category: "Hair", duration: "90 mins", price: "₱1,200", color: "lavender" },
    { name: "Classic Facial", category: "Skin care", duration: "60 mins", price: "Free", color: "mint" },
  ])

  const addService = () => {
    setServices((current) => [...current, { name: "New service", category: "General", duration: "60 mins", price: "Free", color: "peach" }])
  }

  return <div className="services-page"><aside className="services-library-nav"><h1>Services &amp; classes</h1><button className="services-library-section active"><span>Services ({services.length})</span><ChevronDown /></button><button className="services-category-add"><Plus /> New service category</button><button className="services-library-section"><span>Classes</span><ChevronDown /></button></aside><section className="services-main"><header className="services-main-heading"><h2>Services</h2><div><button className="services-icon-action" aria-label="Export services"><Upload /></button><Button onClick={addService} aria-label="Add service"><Plus /></Button></div></header><div className="services-toolbar"><button className="services-team-filter"><Plus /> Team <ChevronDown /></button><label className="services-search"><Search /><input placeholder="Services" aria-label="Search services" /></label><button className="services-booking-link"><span>✣</span><u>nailsqo.setmore.com</u><Link2 /></button></div><div className="services-list">{services.map((service, index) => <article className={`service-row ${service.color}`} key={`${service.name}-${index}`}><div className={`service-row-icon ${service.color}`}><Scissors /></div><div className="service-row-info"><h3>{service.name}</h3><p>{service.duration} · {service.price}</p></div><button className="service-copy-link"><Link2 /> Copy link</button><button className="service-row-menu" aria-label={`More options for ${service.name}`}><MoreVertical /></button></article>)}</div></section></div>
}

function LegacyOverview({ name, firstName, onNavigate }: { name: string; firstName: string; onNavigate: (item: string) => void }) {
  return <><div className="dashboard-page-heading"><div><p className="dashboard-kicker">Today, April 16</p><h1>Good morning, {firstName} <span>✦</span></h1><p>Here’s what’s happening with {name} today.</p></div><Button><Plus data-icon="inline-start" /> New appointment</Button></div><section className="dashboard-welcome"><div><span className="dashboard-welcome-label">Your day at a glance</span><h2>Keep your schedule moving.</h2><p>Three quick actions will help you make the most of Bookora.</p><div className="welcome-actions"><button onClick={() => onNavigate("Services")}><Scissors /> Add your services <ArrowRight /></button><button onClick={() => onNavigate("Staff")}><Users /> Invite your team <ArrowRight /></button></div></div><div className="welcome-orbit"><span>Today</span><strong>12</strong><small>appointments</small></div></section><section className="dashboard-metrics"><article><span className="metric-icon coral"><CalendarDays /></span><div><small>Today’s appointments</small><strong>12</strong><em className="positive">+20.4%</em></div></article><article><span className="metric-icon lavender"><CreditCard /></span><div><small>Revenue this week</small><strong>₱18,420</strong><em className="positive">+12.8%</em></div></article><article><span className="metric-icon mint"><Users /></span><div><small>New clients</small><strong>8</strong><em className="positive">+4.2%</em></div></article><article><span className="metric-icon peach"><BarChart3 /></span><div><small>Completion rate</small><strong>94%</strong><em>Last 30 days</em></div></article></section><section className="dashboard-lower-grid"><article className="dashboard-panel appointments-panel"><div className="panel-heading"><div><h2>Upcoming appointments</h2><p>Your schedule for today</p></div><button onClick={() => onNavigate("Calendar")}>View calendar <ArrowRight /></button></div><div className="appointments-list">{upcomingAppointments.map((appointment) => <div className="appointment-row" key={appointment.name}><span className={`appointment-avatar ${appointment.color}`}>{appointment.initials}</span><div><strong>{appointment.name}</strong><small>{appointment.service}</small></div><time>{appointment.time}</time><span className="appointment-status">Confirmed</span><button aria-label="More options">•••</button></div>)}</div><button className="panel-footer-link" onClick={() => onNavigate("Appointments")}>View all appointments <ArrowRight /></button></article><article className="dashboard-panel setup-panel"><div className="panel-heading"><div><h2>Finish setting up</h2><p>Unlock the full Bookora experience</p></div><span className="setup-count">2/4</span></div><div className="setup-progress"><span /></div><div className="setup-task done"><span>✓</span><div><strong>Business details</strong><small>Completed</small></div></div><div className="setup-task"><span>2</span><div><strong>Add your first service</strong><small>Help clients know what you offer</small></div><ArrowRight /></div><div className="setup-task"><span>3</span><div><strong>Set your availability</strong><small>Choose when clients can book</small></div><ArrowRight /></div></article></section></>
}

type DashboardAppointment = { id: string; name: string; service: string; time: string; date: string; status: string; color: string; initials: string }

function Overview({ name, firstName, onNavigate }: { name: string; firstName: string; onNavigate: (item: string) => void }) {
  const [appointments, setAppointments] = useState<DashboardAppointment[]>([])
  const [metrics, setMetrics] = useState({ today: 0, revenue: 0, newClients: 0, completionRate: 0, services: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      if (!supabase) { setLoading(false); return }
      const formatKey = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(date)
      const todayKey = formatKey(new Date())
      const monthStart = `${todayKey.slice(0, 8)}01`
      const upcomingResult = await supabase.from("appointments").select("id, customer_name, service_names, appointment_date, appointment_time, status, total_price").eq("business_id", (await supabase.auth.getUser()).data.user?.id || "").gte("appointment_date", todayKey).order("appointment_date", { ascending: true }).order("appointment_time", { ascending: true }).limit(8)
      const businessId = (await supabase.auth.getUser()).data.user?.id
      if (!businessId) { if (active) setLoading(false); return }
      const [appointmentsResult, paymentsResult, clientsResult, servicesResult] = await Promise.all([
        supabase.from("appointments").select("id, customer_name, service_names, appointment_date, appointment_time, status, total_price").eq("business_id", businessId).gte("appointment_date", monthStart),
        supabase.from("payment_transactions").select("amount, status, created_at").eq("business_id", businessId).eq("status", "paid").gte("created_at", `${monthStart}T00:00:00.000Z`),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", `${monthStart}T00:00:00.000Z`),
        supabase.from("services").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("show_on_booking_page", true),
      ])
      if (!active) return
      if (upcomingResult.error || appointmentsResult.error) { setError("Live dashboard data could not be loaded."); setLoading(false); return }
      const rows = (appointmentsResult.data || []) as Array<Record<string, unknown>>
      const next = (upcomingResult.data || []).filter((row) => !["cancelled", "no_show"].includes(String(row.status))).map((row) => {
        const customer = String(row.customer_name || "Client")
        return { id: String(row.id), name: customer, service: String(row.service_names || "Appointment"), time: String(row.appointment_time || "—"), date: String(row.appointment_date || ""), status: String(row.status || "approved"), color: ["coral", "lavender", "mint", "peach"][customer.length % 4], initials: customer.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() }
      })
      const todayCount = rows.filter((row) => String(row.appointment_date) === todayKey && !["cancelled", "no_show"].includes(String(row.status))).length
      const completed = rows.filter((row) => ["completed", "approved", "pending"].includes(String(row.status))).length
      const revenue = (paymentsResult.data || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
      setAppointments(next)
      setMetrics({ today: todayCount, revenue, newClients: clientsResult.count || 0, completionRate: rows.length ? Math.round((completed / rows.length) * 100) : 0, services: servicesResult.count || 0 })
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [])

  return <><div className="dashboard-page-heading"><div><p className="dashboard-kicker">{new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(new Date())}</p><h1>Good morning, {firstName}</h1><p>Here’s what’s happening with {name} today.</p></div><Button onClick={() => onNavigate("Calendar")}><Plus data-icon="inline-start" /> New appointment</Button></div><section className="dashboard-welcome"><div><span className="dashboard-welcome-label">Your day at a glance</span><h2>{loading ? "Loading your schedule…" : metrics.today ? `${metrics.today} appointment${metrics.today === 1 ? "" : "s"} today.` : "Your schedule is clear."}</h2><p>{error || (loading ? "Fetching your latest activity." : "Your dashboard is connected to your live Bookora data.")}</p><div className="welcome-actions"><button onClick={() => onNavigate("Services")}><Scissors /> Manage services <ArrowRight /></button><button onClick={() => onNavigate("Clients")}><Users /> View clients <ArrowRight /></button></div></div><div className="welcome-orbit"><span>Today</span><strong>{loading ? "—" : metrics.today}</strong><small>appointments</small></div></section><section className="dashboard-metrics"><article><span className="metric-icon coral"><CalendarDays /></span><div><small>Today’s appointments</small><strong>{loading ? "—" : metrics.today}</strong><em>Live count</em></div></article><article><span className="metric-icon lavender"><CreditCard /></span><div><small>Paid this month</small><strong>{loading ? "—" : `₱${metrics.revenue.toLocaleString("en-PH")}`}</strong><em>Live payments</em></div></article><article><span className="metric-icon mint"><Users /></span><div><small>New clients this month</small><strong>{loading ? "—" : metrics.newClients}</strong><em>Live count</em></div></article><article><span className="metric-icon peach"><BarChart3 /></span><div><small>Completion rate</small><strong>{loading ? "—" : `${metrics.completionRate}%`}</strong><em>Current month</em></div></article></section><section className="dashboard-lower-grid"><article className="dashboard-panel appointments-panel"><div className="panel-heading"><div><h2>Upcoming appointments</h2><p>Live schedule from your booking calendar</p></div><button onClick={() => onNavigate("Calendar")}>View calendar <ArrowRight /></button></div>{loading ? <div className="dashboard-empty-state">Loading appointments…</div> : appointments.length ? <div className="appointments-list">{appointments.map((appointment) => <div className="appointment-row" key={appointment.id}><span className={`appointment-avatar ${appointment.color}`}>{appointment.initials}</span><div><strong>{appointment.name}</strong><small>{appointment.service}</small></div><time>{appointment.date === new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()) ? appointment.time : `${appointment.date} · ${appointment.time}`}</time><span className="appointment-status">{appointment.status}</span><button aria-label={`Open ${appointment.name}`} onClick={() => onNavigate("Appointments")}>•••</button></div>)}</div> : <div className="dashboard-empty-state"><strong>No upcoming appointments</strong><span>New bookings will appear here automatically.</span></div>}<button className="panel-footer-link" onClick={() => onNavigate("Appointments")}>View all appointments <ArrowRight /></button></article><article className="dashboard-panel setup-panel"><div className="panel-heading"><div><h2>Workspace snapshot</h2><p>Live setup signals</p></div></div><div className="setup-task done"><span>✓</span><div><strong>{metrics.services} active services</strong><small>Shown on your booking page</small></div></div><div className="setup-task"><span>•</span><div><strong>Availability</strong><small>Manage hours, breaks, and time off in Settings</small></div><ArrowRight /></div><div className="setup-task"><span>•</span><div><strong>Payments</strong><small>Paid transactions update this dashboard</small></div><ArrowRight /></div></article></section></>
}
