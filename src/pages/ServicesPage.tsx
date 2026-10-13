import { useState } from "react"
import type { User } from "@supabase/supabase-js"
import { ArrowRight, BarChart3, Bell, CalendarDays, CalendarRange, ChevronDown, CreditCard, Home, Link2, MoreVertical, Plus, Scissors, Search, Settings2, Store, Upload, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/brand/Logo"
import { dashboardNav } from "@/data/mock"

type Service = { name: string; duration: string; price: string; color: string }
const sidebarIcons = [Home, CalendarDays, CalendarRange, Users, Scissors, Users, CreditCard, BarChart3, Settings2]

export function ServicesPage({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const name = String(user.user_metadata?.business_name ?? "Your business")
  const select = (item: string) => window.location.assign(item === "Settings" ? "/settings" : "/dashboard")
  return <div className="dashboard-shell services-standalone-shell"><aside className="dashboard-sidebar"><div className="dashboard-brand"><Logo /></div><div className="workspace-switcher"><span className="workspace-avatar"><Store /></span><span><strong>{name}</strong><small>Business account</small></span></div><nav className="dashboard-nav"><p className="dashboard-nav-label">Workspace</p>{dashboardNav.map((item, index) => { const Icon = sidebarIcons[index]; return <button key={item} className={item === "Services" ? "active" : ""} onClick={() => select(item)}><Icon /><span>{item}</span></button> })}</nav><div className="dashboard-sidebar-bottom"><div className="help-card"><strong>Need a hand?</strong><span>Our team is here to help you get set up.</span><button>Visit Help Center <ArrowRight /></button></div></div></aside><div className="dashboard-content services-standalone-content"><ServicesContent onSignOut={onSignOut} /></div></div>
}

function ServicesContent({ onSignOut: _onSignOut }: { onSignOut: () => void }) {
  const [services, setServices] = useState<Service[]>([
    { name: "Gel Manicure", duration: "60 mins", price: "₱650", color: "coral" },
    { name: "Hair Treatment", duration: "90 mins", price: "₱1,200", color: "lavender" },
    { name: "Classic Facial", duration: "60 mins", price: "Free", color: "mint" },
  ])

  const addService = () => {
    setServices((current) => [...current, { name: "New service", duration: "60 mins", price: "Free", color: "peach" }])
  }

  return <main className="services-standalone"><aside className="services-library-nav"><h1>Services</h1><button className="services-library-section active"><span>Services ({services.length})</span><ChevronDown /></button></aside><section className="services-main"><header className="services-main-heading"><h2>Services</h2><div><button className="services-icon-action" aria-label="Export services"><Upload /></button><Button onClick={addService} aria-label="Add service"><Plus /></Button></div></header><div className="services-toolbar"><button className="services-team-filter"><Plus /> Team <ChevronDown /></button><label className="services-search"><Search /><input placeholder="Services" aria-label="Search services" /></label><button className="services-booking-link"><span>✣</span><u>nailsqo.bookora.com</u><Link2 /></button></div><div className="services-list">{services.map((service, index) => <article className={`service-row ${service.color}`} key={`${service.name}-${index}`}><div className={`service-row-icon ${service.color}`}><Scissors /></div><div className="service-row-info"><h3>{service.name}</h3><p>{service.duration} · {service.price}</p></div><button className="service-copy-link"><Link2 /> Copy link</button><button className="service-row-menu" aria-label={`More options for ${service.name}`}><MoreVertical /></button></article>)}</div></section></main>
}
