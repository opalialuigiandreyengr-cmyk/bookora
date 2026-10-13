import { useState } from "react"
import type { User } from "@supabase/supabase-js"
import { ArrowRight, BarChart3, Bell, CalendarDays, CalendarRange, ChevronDown, Clock3, CreditCard, Home, Link2, ListChecks, Menu, MoreVertical, Plus, Search, Scissors, Settings2, Store, Upload, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/brand/Logo"
import { dashboardNav, upcomingAppointments } from "@/data/mock"
import { SettingsPage } from "@/pages/SettingsPage"

const icons = [Home, CalendarDays, CalendarRange, Users, Scissors, Users, CreditCard, BarChart3, Settings2]

export function DashboardPage({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [active, setActive] = useState(() => (window.location.pathname.includes("/settings") ? "Settings" : "Overview"))
  const [open, setOpen] = useState(false)
  const name = String(user.user_metadata?.business_name ?? "Your business")
  const firstName = String(user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "there").split(" ")[0]
  const select = (item: string) => {
    setActive(item)
    setOpen(false)
    window.history.replaceState({}, "", item === "Settings" ? "/settings" : "/dashboard")
  }
  return <div className="dashboard-shell">{open && <button className="dashboard-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}<aside className={`dashboard-sidebar ${open ? "open" : ""}`}><div className="dashboard-brand"><Logo /></div><div className="workspace-switcher"><span className="workspace-avatar"><Store /></span><span><strong>{name}</strong><small>Business account</small></span></div><nav className="dashboard-nav"><p className="dashboard-nav-label">Workspace</p>{dashboardNav.map((item, index) => { const Icon = icons[index]; return <button key={item} className={active === item ? "active" : ""} onClick={() => select(item)}><Icon /><span>{item}</span></button> })}</nav><div className="dashboard-sidebar-bottom"><div className="help-card"><strong>Need a hand?</strong><span>Our team is here to help you get set up.</span><button>Visit Help Center <ArrowRight /></button></div></div></aside><div className="dashboard-content"><header className="dashboard-header"><button className="dashboard-menu" aria-label="Open navigation" onClick={() => setOpen(true)}><Menu /></button><div className="dashboard-search"><Search /><input aria-label="Search" placeholder="Search anything..." /></div><div className="dashboard-header-actions"><button className="dashboard-icon-button" aria-label="Notifications"><Bell /><i /></button><span className="dashboard-divider" /><span className="user-avatar">{firstName.slice(0, 2).toUpperCase()}</span></div></header><main className="dashboard-main">{active === "Settings" ? <SettingsPage user={user} onSignOut={onSignOut} /> : active === "Services" ? <ServicesPage /> : <Overview name={name} firstName={firstName} onNavigate={select} />}</main></div></div>
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

function Overview({ name, firstName, onNavigate }: { name: string; firstName: string; onNavigate: (item: string) => void }) {
  return <><div className="dashboard-page-heading"><div><p className="dashboard-kicker">Today, April 16</p><h1>Good morning, {firstName} <span>✦</span></h1><p>Here’s what’s happening with {name} today.</p></div><Button><Plus data-icon="inline-start" /> New appointment</Button></div><section className="dashboard-welcome"><div><span className="dashboard-welcome-label">Your day at a glance</span><h2>Keep your schedule moving.</h2><p>Three quick actions will help you make the most of Bookora.</p><div className="welcome-actions"><button onClick={() => onNavigate("Services")}><Scissors /> Add your services <ArrowRight /></button><button onClick={() => onNavigate("Staff")}><Users /> Invite your team <ArrowRight /></button></div></div><div className="welcome-orbit"><span>Today</span><strong>12</strong><small>appointments</small></div></section><section className="dashboard-metrics"><article><span className="metric-icon coral"><CalendarDays /></span><div><small>Today’s appointments</small><strong>12</strong><em className="positive">+20.4%</em></div></article><article><span className="metric-icon lavender"><CreditCard /></span><div><small>Revenue this week</small><strong>₱18,420</strong><em className="positive">+12.8%</em></div></article><article><span className="metric-icon mint"><Users /></span><div><small>New clients</small><strong>8</strong><em className="positive">+4.2%</em></div></article><article><span className="metric-icon peach"><BarChart3 /></span><div><small>Completion rate</small><strong>94%</strong><em>Last 30 days</em></div></article></section><section className="dashboard-lower-grid"><article className="dashboard-panel appointments-panel"><div className="panel-heading"><div><h2>Upcoming appointments</h2><p>Your schedule for today</p></div><button onClick={() => onNavigate("Calendar")}>View calendar <ArrowRight /></button></div><div className="appointments-list">{upcomingAppointments.map((appointment) => <div className="appointment-row" key={appointment.name}><span className={`appointment-avatar ${appointment.color}`}>{appointment.initials}</span><div><strong>{appointment.name}</strong><small>{appointment.service}</small></div><time>{appointment.time}</time><span className="appointment-status">Confirmed</span><button aria-label="More options">•••</button></div>)}</div><button className="panel-footer-link" onClick={() => onNavigate("Appointments")}>View all appointments <ArrowRight /></button></article><article className="dashboard-panel setup-panel"><div className="panel-heading"><div><h2>Finish setting up</h2><p>Unlock the full Bookora experience</p></div><span className="setup-count">2/4</span></div><div className="setup-progress"><span /></div><div className="setup-task done"><span>✓</span><div><strong>Business details</strong><small>Completed</small></div></div><div className="setup-task"><span>2</span><div><strong>Add your first service</strong><small>Help clients know what you offer</small></div><ArrowRight /></div><div className="setup-task"><span>3</span><div><strong>Set your availability</strong><small>Choose when clients can book</small></div><ArrowRight /></div></article></section></>
}
