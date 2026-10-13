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
  const [categories, setCategories] = useState<string[]>([])
  const [modal, setModal] = useState<"category" | "service" | null>(null)
  const [categoryTitle, setCategoryTitle] = useState("")
  const [serviceName, setServiceName] = useState("")
  const [serviceDuration, setServiceDuration] = useState("60 mins")
  const [servicePrice, setServicePrice] = useState("")

  const openServiceModal = () => {
    setServiceName("")
    setServiceDuration("60 mins")
    setServicePrice("")
    setModal("service")
  }
  const saveService = () => {
    if (!serviceName.trim()) return
    setServices((current) => [...current, { name: serviceName.trim(), duration: serviceDuration, price: servicePrice.trim() || "Free", color: "peach" }])
    setModal(null)
  }
  const saveCategory = () => {
    if (!categoryTitle.trim()) return
    setCategories((current) => [...current, categoryTitle.trim()])
    setCategoryTitle("")
    setModal(null)
  }

  return <>
    <main className="services-standalone">
      <aside className="services-library-nav">
        <h1>Services</h1>
        <button className="services-library-section active"><span>Services ({services.length})</span><ChevronDown /></button>
        <button className="services-category-add" onClick={() => setModal("category")}><Plus /> New service category</button>
        {categories.map((category) => <button className="services-library-section" key={category}><span>{category}</span><ChevronDown /></button>)}
      </aside>
      <section className="services-main">
        <header className="services-main-heading"><h2>Services</h2><div><button className="services-icon-action" aria-label="Export services"><Upload /></button><Button onClick={openServiceModal} aria-label="Add service"><Plus /></Button></div></header>
        <div className="services-toolbar"><button className="services-team-filter"><Plus /> Team <ChevronDown /></button><label className="services-search"><Search /><input placeholder="Services" aria-label="Search services" /></label><button className="services-booking-link"><span>✣</span><u>nailsqo.bookora.com</u><Link2 /></button></div>
        <div className="services-list">{services.map((service, index) => <article className={`service-row ${service.color}`} key={`${service.name}-${index}`}><div className={`service-row-icon ${service.color}`}><Scissors /></div><div className="service-row-info"><h3>{service.name}</h3><p>{service.duration} · {service.price}</p></div><button className="service-copy-link"><Link2 /> Copy link</button><button className="service-row-menu" aria-label={`More options for ${service.name}`}><MoreVertical /></button></article>)}</div>
      </section>
    </main>
    {modal && <div className="services-modal-backdrop" role="presentation" onMouseDown={() => setModal(null)}><section className="services-modal" role="dialog" aria-modal="true" aria-labelledby="services-modal-title" onMouseDown={(event) => event.stopPropagation()}><div className="services-modal-heading"><h2 id="services-modal-title">{modal === "category" ? "New category" : "New service"}</h2><button type="button" onClick={() => setModal(null)} aria-label="Close modal">×</button></div>{modal === "category" ? <><label>Category title<input autoFocus value={categoryTitle} onChange={(event) => setCategoryTitle(event.target.value)} placeholder="e.g. Hair services" /></label><div className="services-modal-actions"><button type="button" onClick={() => setModal(null)}>Cancel</button><Button type="button" onClick={saveCategory}>Add category</Button></div></> : <><label>Service name<input autoFocus value={serviceName} onChange={(event) => setServiceName(event.target.value)} placeholder="e.g. Deep tissue massage" /></label><label>Duration<select value={serviceDuration} onChange={(event) => setServiceDuration(event.target.value)}><option>15 mins</option><option>30 mins</option><option>45 mins</option><option>60 mins</option><option>90 mins</option></select></label><label>Price<input value={servicePrice} onChange={(event) => setServicePrice(event.target.value)} placeholder="e.g. ₱650 or Free" /></label><div className="services-modal-actions"><button type="button" onClick={() => setModal(null)}>Cancel</button><Button type="button" onClick={saveService}>Add service</Button></div></>}</section></div>}
  </>
}

function LegacyServicesContent({ onSignOut: _onSignOut }: { onSignOut: () => void }) {
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
