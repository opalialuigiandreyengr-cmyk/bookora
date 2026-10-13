import { useState } from "react"
import type { User } from "@supabase/supabase-js"
import { ArrowRight, BarChart3, CalendarDays, CalendarRange, ChevronDown, CreditCard, Home, Image as ImageIcon, Link2, MoreVertical, Plus, Scissors, Search, Settings2, Store, Upload, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/brand/Logo"
import { dashboardNav } from "@/data/mock"

type Service = { name: string; duration: string; bufferTime?: string; price: string; category?: string; image?: string; showOnBookingPage?: boolean; color: string }
const sidebarIcons = [Home, CalendarDays, CalendarRange, Users, Scissors, Users, CreditCard, BarChart3, Settings2]

export function ServicesPage({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const name = String(user.user_metadata?.business_name ?? "Your business")
  const select = (item: string) => window.location.assign(item === "Settings" ? "/settings" : "/dashboard")
  return <div className="dashboard-shell services-standalone-shell"><aside className="dashboard-sidebar"><div className="dashboard-brand"><Logo /></div><div className="workspace-switcher"><span className="workspace-avatar"><Store /></span><span><strong>{name}</strong><small>Business account</small></span></div><nav className="dashboard-nav"><p className="dashboard-nav-label">Workspace</p>{dashboardNav.map((item, index) => { const Icon = sidebarIcons[index]; return <button key={item} className={item === "Services" ? "active" : ""} onClick={() => select(item)}><Icon /><span>{item}</span></button> })}</nav><div className="dashboard-sidebar-bottom"><div className="help-card"><strong>Need a hand?</strong><span>Our team is here to help you get set up.</span><button>Visit Help Center <ArrowRight /></button></div></div></aside><div className="dashboard-content services-standalone-content"><ServicesContent onSignOut={onSignOut} /></div></div>
}

function ServicesContent({ onSignOut: _onSignOut }: { onSignOut: () => void }) {
  const [services, setServices] = useState<Service[]>([
    { name: "Gel Manicure", duration: "60 mins", price: "PHP 650", color: "coral" },
    { name: "Hair Treatment", duration: "90 mins", price: "PHP 1,200", color: "lavender" },
    { name: "Classic Facial", duration: "60 mins", price: "Free", color: "mint" },
  ])
  const [categories, setCategories] = useState<string[]>([])
  const [categoryTitle, setCategoryTitle] = useState("")
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [openMenu, setOpenMenu] = useState<number | null>(null)
  const [editingService, setEditingService] = useState<{ index: number; service: Service } | null>(null)

  const openNewService = () => { setEditingService(null); setShowServiceModal(true) }
  const saveCategory = () => {
    if (!categoryTitle.trim()) return
    setCategories((current) => [...current, categoryTitle.trim()])
    setCategoryTitle("")
    setShowCategoryModal(false)
  }

  return <>
    <main className="services-standalone">
      <aside className="services-library-nav">
        <h1>Services</h1>
        <button className="services-library-section active"><span>Services ({services.length})</span><ChevronDown /></button>
        <button className="services-category-add" onClick={() => setShowCategoryModal(true)}><Plus /> New service category</button>
        {categories.map((category) => <button className="services-library-section" key={category}><span>{category}</span><ChevronDown /></button>)}
      </aside>
      <section className="services-main">
        <header className="services-main-heading"><h2>Services</h2><div><button className="services-icon-action" aria-label="Export services"><Upload /></button><Button onClick={openNewService} aria-label="Add service"><Plus /></Button></div></header>
        <div className="services-toolbar"><button className="services-team-filter"><Plus /> Team <ChevronDown /></button><label className="services-search"><Search /><input placeholder="Services" aria-label="Search services" /></label><button className="services-booking-link"><span>*</span><u>nailsqo.bookora.com</u><Link2 /></button></div>
        <div className="services-list">{services.map((service, index) => <article className={`service-row ${service.color}`} key={`${service.name}-${index}`}><div className={`service-row-icon ${service.color}`}><Scissors /></div><div className="service-row-info"><h3>{service.name}</h3><p>{service.duration} · {service.price}</p></div><button className="service-copy-link"><Link2 /> Copy link</button><div className="service-row-actions"><button className="service-row-menu" aria-label={`More options for ${service.name}`} aria-expanded={openMenu === index} onClick={() => setOpenMenu(openMenu === index ? null : index)}><MoreVertical /></button>{openMenu === index && <div className="service-action-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setEditingService({ index, service }); setShowServiceModal(true); setOpenMenu(null) }}>Edit</button><button type="button" role="menuitem" onClick={() => { setServices((current) => [...current, { ...service, name: `${service.name} copy` }]); setOpenMenu(null) }}>Duplicate</button><button type="button" role="menuitem" className="danger" onClick={() => { setServices((current) => current.filter((_, itemIndex) => itemIndex !== index)); setOpenMenu(null) }}>Delete</button></div>}</div></article>)}</div>
      </section>
    </main>
    {showCategoryModal && <div className="services-modal-backdrop" role="presentation" onMouseDown={() => setShowCategoryModal(false)}><section className="services-modal" role="dialog" aria-modal="true" aria-labelledby="new-category-title" onMouseDown={(event) => event.stopPropagation()}><div className="services-modal-heading"><h2 id="new-category-title">New category</h2><button type="button" onClick={() => setShowCategoryModal(false)} aria-label="Close modal">×</button></div><label>Category title<input autoFocus value={categoryTitle} onChange={(event) => setCategoryTitle(event.target.value)} placeholder="e.g. Hair services" /></label><div className="services-modal-actions"><button type="button" onClick={() => setShowCategoryModal(false)}>Cancel</button><Button type="button" onClick={saveCategory}>Add category</Button></div></section></div>}
    {showServiceModal && <ServiceFormModal initialService={editingService?.service} categories={categories} onClose={() => { setShowServiceModal(false); setEditingService(null) }} onSave={(service) => { setServices((current) => editingService ? current.map((item, index) => index === editingService.index ? { ...item, ...service } : item) : [...current, { ...service, color: "peach" }]); setShowServiceModal(false); setEditingService(null) }} />}
  </>
}

function ServiceFormModal({ initialService, categories, onClose, onSave }: { initialService?: Service; categories: string[]; onClose: () => void; onSave: (service: Omit<Service, "color">) => void }) {
  const [name, setName] = useState(initialService?.name ?? "")
  const [duration, setDuration] = useState(initialService?.duration ?? "")
  const [bufferTime, setBufferTime] = useState(initialService?.bufferTime ?? "")
  const [price, setPrice] = useState(initialService?.price === "Free" ? "" : initialService?.price ?? "")
  const [category, setCategory] = useState(initialService?.category ?? categories[0] ?? "Uncategorized")
  const [image, setImage] = useState(initialService?.image ?? "")
  const [showOnBookingPage, setShowOnBookingPage] = useState(initialService?.showOnBookingPage ?? true)

  const submit = () => {
    if (!name.trim()) return
    onSave({ name: name.trim(), duration, bufferTime, price: price.trim() || "Free", category, image, showOnBookingPage })
  }

  return <div className="services-modal-backdrop" role="presentation" onMouseDown={onClose}><section className="services-modal services-service-modal" role="dialog" aria-modal="true" aria-labelledby="new-service-title" onMouseDown={(event) => event.stopPropagation()}><div className="services-modal-heading"><h2 id="new-service-title">Service details</h2><button type="button" onClick={onClose} aria-label="Close modal">×</button></div><div className="services-image-field"><div className="services-image-placeholder">{image ? <img src={image} alt="Service preview" /> : <ImageIcon />}</div><div><label htmlFor="service-image-upload" className="services-image-label">Service image</label><p>Up to 5 MB in size</p><label htmlFor="service-image-upload" className="services-upload-button"><ImageIcon /> Upload</label><input id="service-image-upload" type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file && file.size <= 5 * 1024 * 1024) setImage(URL.createObjectURL(file)) }} /></div></div><label>Title <span className="services-required">*</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Deep tissue massage" /></label><div className="services-modal-grid services-details-grid"><label>Duration <span className="services-required">*</span><div className="services-input-suffix"><input inputMode="numeric" value={duration.replace(" mins", "")} onChange={(event) => setDuration(event.target.value ? `${event.target.value} mins` : "")} /><span>mins</span></div></label><label>Buffer time <span className="services-info">i</span><div className="services-input-suffix"><input inputMode="numeric" value={bufferTime.replace(" mins", "")} onChange={(event) => setBufferTime(event.target.value ? `${event.target.value} mins` : "")} /><span>mins</span></div></label><label>Cost<div className="services-input-prefix"><span>PHP</span><input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" /></div></label></div><div className="services-modal-grid"><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Uncategorized</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label className="services-toggle-row"><span><strong>Show on booking page</strong><small>Let customers book this service online</small></span><input type="checkbox" checked={showOnBookingPage} onChange={(event) => setShowOnBookingPage(event.target.checked)} /></label></div><div className="services-modal-actions"><button type="button" onClick={onClose}>Cancel</button><Button type="button" onClick={submit}>{initialService ? "Save changes" : "Add service"}</Button></div></section></div>
}
