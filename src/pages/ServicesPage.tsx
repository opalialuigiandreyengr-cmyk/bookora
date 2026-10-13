import { useState } from "react"
import type { User } from "@supabase/supabase-js"
import { ArrowRight, BarChart3, Bell, CalendarDays, CalendarRange, ChevronDown, CreditCard, Home, Link2, MoreVertical, Plus, Scissors, Search, Settings2, Store, Upload, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/brand/Logo"
import { dashboardNav } from "@/data/mock"

type Service = { name: string; description?: string; duration: string; bufferTime?: string; price: string; category?: string; image?: string; showOnBookingPage?: boolean; color: string }
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
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [categoryTitle, setCategoryTitle] = useState("")
  const [serviceName, setServiceName] = useState("")
  const [serviceDescription, setServiceDescription] = useState("")
  const [serviceDuration, setServiceDuration] = useState("60 mins")
  const [serviceBufferTime, setServiceBufferTime] = useState("No buffer")
  const [servicePrice, setServicePrice] = useState("")
  const [serviceCategory, setServiceCategory] = useState("Uncategorized")
  const [serviceImage, setServiceImage] = useState("")
  const [showOnBookingPage, setShowOnBookingPage] = useState(true)

  const openServiceModal = () => {
    setServiceName("")
    setServiceDescription("")
    setServiceDuration("60 mins")
    setServiceBufferTime("No buffer")
    setServicePrice("")
    setServiceCategory(categories[0] ?? "Uncategorized")
    setServiceImage("")
    setShowOnBookingPage(true)
    setShowServiceModal(true)
  }
  const saveService = () => {
    if (!serviceName.trim()) return
    setServices((current) => [...current, { name: serviceName.trim(), description: serviceDescription.trim(), duration: serviceDuration, bufferTime: serviceBufferTime, price: servicePrice.trim() || "Free", category: serviceCategory, image: serviceImage, showOnBookingPage, color: "peach" }])
    setShowServiceModal(false)
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
    {showServiceModal && <ServiceFormModal categories={categories} onClose={() => setShowServiceModal(false)} onSave={(service) => { setServices((current) => [...current, { ...service, color: "peach" }]); setShowServiceModal(false) }} />}
  </>
}

function ServiceFormModal({ categories, onClose, onSave }: { categories: string[]; onClose: () => void; onSave: (service: Omit<Service, "color">) => void }) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [duration, setDuration] = useState("60 mins")
  const [bufferTime, setBufferTime] = useState("No buffer")
  const [price, setPrice] = useState("")
  const [category, setCategory] = useState(categories[0] ?? "Uncategorized")
  const [image, setImage] = useState("")
  const [showOnBookingPage, setShowOnBookingPage] = useState(true)

  const submit = () => {
    if (!name.trim()) return
    onSave({ name: name.trim(), description: description.trim(), duration, bufferTime, price: price.trim() || "Free", category, image, showOnBookingPage })
  }

  return <div className="services-modal-backdrop" role="presentation" onMouseDown={onClose}><section className="services-modal services-service-modal" role="dialog" aria-modal="true" aria-labelledby="new-service-title" onMouseDown={(event) => event.stopPropagation()}><div className="services-modal-heading"><h2 id="new-service-title">New service</h2><button type="button" onClick={onClose} aria-label="Close modal">×</button></div><label>Image<span className="services-modal-help">Optional service photo</span><input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) setImage(URL.createObjectURL(file)) }} /></label>{image && <img className="services-service-image-preview" src={image} alt="Service preview" />}<label>Title<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Deep tissue massage" /></label><label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe what customers can expect" maxLength={255} rows={3} /></label><div className="services-modal-grid"><label>Duration<select value={duration} onChange={(event) => setDuration(event.target.value)}><option>15 mins</option><option>30 mins</option><option>45 mins</option><option>60 mins</option><option>90 mins</option></select></label><label>Buffer time<select value={bufferTime} onChange={(event) => setBufferTime(event.target.value)}><option>No buffer</option><option>5 mins</option><option>10 mins</option><option>15 mins</option><option>30 mins</option></select></label></div><div className="services-modal-grid"><label>Cost<input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="e.g. ₱650 or Free" /></label><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Uncategorized</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label></div><label className="services-toggle-row"><span><strong>Show on booking page</strong><small>Let customers book this service online</small></span><input type="checkbox" checked={showOnBookingPage} onChange={(event) => setShowOnBookingPage(event.target.checked)} /></label><div className="services-modal-actions"><button type="button" onClick={onClose}>Cancel</button><Button type="button" onClick={submit}>Add service</Button></div></section></div>
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
