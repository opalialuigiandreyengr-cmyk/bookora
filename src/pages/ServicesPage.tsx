import { useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { ArrowRight, BarChart3, CalendarDays, CalendarRange, ChevronDown, Copy, CreditCard, Edit2, Home, Image as ImageIcon, Link2, MoreVertical, Plus, Scissors, Search, Settings2, Store, Trash2, Upload, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/brand/Logo"
import { dashboardNav } from "@/data/mock"
import { supabase } from "@/lib/supabase"

type Category = { id?: string; name: string }
type Service = { id?: string; name: string; duration: string; bufferTime?: string; price: string; category?: string; categoryId?: string; image?: string; imageFile?: File; showOnBookingPage?: boolean; color: string }
const sidebarIcons = [Home, CalendarDays, CalendarRange, Users, Scissors, Users, CreditCard, BarChart3, Settings2]
const starterServices: Service[] = [
  { name: "Gel Manicure", duration: "60 mins", price: "PHP 650", color: "coral", showOnBookingPage: true },
  { name: "Hair Treatment", duration: "90 mins", price: "PHP 1,200", color: "lavender", showOnBookingPage: true },
  { name: "Classic Facial", duration: "60 mins", price: "Free", color: "mint", showOnBookingPage: true },
]

export function ServicesPage({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const name = String(user.user_metadata?.business_name ?? "Your business")
  const select = (item: string) => window.location.assign(item === "Settings" ? "/settings" : "/dashboard")
  return <div className="dashboard-shell services-standalone-shell"><aside className="dashboard-sidebar"><div className="dashboard-brand"><Logo /></div><div className="workspace-switcher"><span className="workspace-avatar"><Store /></span><span><strong>{name}</strong><small>Business account</small></span></div><nav className="dashboard-nav"><p className="dashboard-nav-label">Workspace</p>{dashboardNav.map((item, index) => { const Icon = sidebarIcons[index]; return <button key={item} className={item === "Services" ? "active" : ""} onClick={() => select(item)}><Icon /><span>{item}</span></button> })}</nav><div className="dashboard-sidebar-bottom"><div className="help-card"><strong>Need a hand?</strong><span>Our team is here to help you get set up.</span><button>Visit Help Center <ArrowRight /></button></div></div></aside><div className="dashboard-content services-standalone-content"><ServicesContent user={user} onSignOut={onSignOut} /></div></div>
}

function ServicesContent({ user, onSignOut: _onSignOut }: { user: User; onSignOut: () => void }) {
  const [services, setServices] = useState<Service[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryTitle, setCategoryTitle] = useState("")
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [openMenu, setOpenMenu] = useState<number | null>(null)
  const [editingService, setEditingService] = useState<{ index: number; service: Service } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const closeMenu = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest(".service-row-actions")) setOpenMenu(null) }
    document.addEventListener("mousedown", closeMenu)
    return () => document.removeEventListener("mousedown", closeMenu)
  }, [])

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!supabase || user.id.startsWith("preview-")) { if (active) { setServices(starterServices); setLoading(false) }; return }
      const [{ data: categoryRows, error: categoryError }, { data: serviceRows, error: serviceError }] = await Promise.all([
        supabase.from("service_categories").select("id, name").eq("business_id", user.id).order("created_at"),
        supabase.from("services").select("id, name, duration_minutes, buffer_minutes, price, category_id, image_url, show_on_booking_page").eq("business_id", user.id).order("created_at"),
      ])
      if (!active) return
      if (categoryError || serviceError) { setError(categoryError?.message ?? serviceError?.message ?? "Could not load services."); setServices(starterServices); setLoading(false); return }
      const nextCategories = (categoryRows ?? []) as Category[]
      let nextServices = (serviceRows ?? []).map((row: any, index) => ({ id: row.id, name: row.name, duration: row.duration_minutes ? `${row.duration_minutes} mins` : "", bufferTime: row.buffer_minutes ? `${row.buffer_minutes} mins` : "", price: row.price || "Free", categoryId: row.category_id ?? undefined, category: nextCategories.find((item) => item.id === row.category_id)?.name, image: row.image_url || "", showOnBookingPage: row.show_on_booking_page ?? true, color: ["coral", "lavender", "mint", "peach"][index % 4] })) as Service[]
      const { data: profile } = await supabase.from("business_profiles").select("service_defaults_seeded").eq("id", user.id).maybeSingle()
      if (!nextServices.length && !profile?.service_defaults_seeded) {
        const { data: seeded } = await supabase.from("services").insert(starterServices.map((service) => ({ business_id: user.id, name: service.name, duration_minutes: parseInt(service.duration, 10), buffer_minutes: 0, price: service.price, show_on_booking_page: true }))).select("id, name, duration_minutes, buffer_minutes, price, show_on_booking_page")
        nextServices = (seeded ?? []).map((row: any, index) => ({ id: row.id, name: row.name, duration: `${row.duration_minutes} mins`, bufferTime: "", price: row.price, showOnBookingPage: row.show_on_booking_page, color: ["coral", "lavender", "mint"][index] }))
        await supabase.from("business_profiles").update({ service_defaults_seeded: true }).eq("id", user.id)
      }
      setCategories(nextCategories); setServices(nextServices); setLoading(false)
    }
    load().catch((loadError) => { if (active) { setError(loadError.message); setServices(starterServices); setLoading(false) } })
    return () => { active = false }
  }, [user.id])

  const saveCategory = async () => {
    if (!categoryTitle.trim()) return
    if (!supabase || user.id.startsWith("preview-")) { setCategories((current) => [...current, { name: categoryTitle.trim() }]); setCategoryTitle(""); setShowCategoryModal(false); return }
    const { data, error: categoryError } = await supabase.from("service_categories").insert({ business_id: user.id, name: categoryTitle.trim() }).select("id, name").single()
    if (categoryError) { setError(categoryError.message); return }
    setCategories((current) => [...current, data as Category]); setCategoryTitle(""); setShowCategoryModal(false)
  }

  const saveService = async (service: Omit<Service, "color">) => {
    let imageUrl = service.image || ""
    if (supabase && service.imageFile && !user.id.startsWith("preview-")) {
      const extension = service.imageFile.name.split(".").pop() || "jpg"
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`
      const upload = await supabase.storage.from("service-assets").upload(path, service.imageFile, { upsert: true })
      if (upload.error) { setError(upload.error.message); return }
      imageUrl = supabase.storage.from("service-assets").getPublicUrl(path).data.publicUrl
    }
    const categoryId = categories.find((item) => item.name === service.category)?.id ?? null
    const payload = { name: service.name, duration_minutes: parseInt(service.duration, 10) || null, buffer_minutes: parseInt(service.bufferTime ?? "", 10) || 0, price: service.price, category_id: categoryId, image_url: imageUrl, show_on_booking_page: service.showOnBookingPage ?? true }
    if (supabase && !user.id.startsWith("preview-")) {
      const result = editingService ? await supabase.from("services").update(payload).eq("id", editingService.service.id).eq("business_id", user.id).select("id").single() : await supabase.from("services").insert({ ...payload, business_id: user.id }).select("id").single()
      if (result.error) { setError(result.error.message); return }
      const saved = { ...service, id: result.data.id, image: imageUrl, categoryId: categoryId ?? undefined, color: editingService?.service.color ?? "peach" }
      setServices((current) => editingService ? current.map((item, index) => index === editingService.index ? saved : item) : [...current, saved])
    } else {
      const saved = { ...service, image: imageUrl, categoryId: categoryId ?? undefined, color: editingService?.service.color ?? "peach" }
      setServices((current) => editingService ? current.map((item, index) => index === editingService.index ? { ...item, ...saved } : item) : [...current, saved])
    }
    setShowServiceModal(false); setEditingService(null)
  }

  const duplicateService = async (service: Service) => { await saveService({ ...service, id: undefined, name: `${service.name} copy`, imageFile: undefined }) }
  const deleteService = async (service: Service, index: number) => {
    if (supabase && service.id && !user.id.startsWith("preview-")) { const result = await supabase.from("services").delete().eq("id", service.id).eq("business_id", user.id); if (result.error) { setError(result.error.message); return } }
    setServices((current) => current.filter((_, itemIndex) => itemIndex !== index)); setOpenMenu(null)
  }

  return <>
    <main className="services-standalone"><aside className="services-library-nav"><h1>Services</h1><button className="services-library-section active"><span>Services ({services.length})</span><ChevronDown /></button><button className="services-category-add" onClick={() => setShowCategoryModal(true)}><Plus /> New service category</button>{categories.map((category) => <button className="services-library-section" key={category.id ?? category.name}><span>{category.name}</span><ChevronDown /></button>)}</aside>
      <section className="services-main"><header className="services-main-heading"><h2>Services</h2><div><button className="services-icon-action" aria-label="Export services"><Upload /></button><Button onClick={() => { setEditingService(null); setShowServiceModal(true) }} aria-label="Add service"><Plus /></Button></div></header><div className="services-toolbar"><button className="services-team-filter"><Plus /> Team <ChevronDown /></button><label className="services-search"><Search /><input placeholder="Services" aria-label="Search services" /></label><button className="services-booking-link"><span>*</span><u>nailsqo.bookora.com</u><Link2 /></button></div>{error && <p className="services-error" role="alert">{error}</p>}{loading ? <div className="services-empty-state">Loading services...</div> : <div className="services-list">{services.map((service, index) => <article className={`service-row ${service.color}`} key={service.id ?? `${service.name}-${index}`}><div className={`service-row-icon ${service.color}`}>{service.image ? <img src={service.image} alt="" /> : <Scissors />}</div><div className="service-row-info"><h3>{service.name}</h3><p>{service.duration} · {service.price}</p></div><button className="service-copy-link" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/book/${service.id ?? service.name.toLowerCase().replace(/\s+/g, "-")}`)}><Link2 /> Copy link</button><div className="service-row-actions"><button className="service-row-menu" aria-label={`More options for ${service.name}`} aria-expanded={openMenu === index} onClick={() => setOpenMenu(openMenu === index ? null : index)}><MoreVertical /></button>{openMenu === index && <div className="service-action-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setEditingService({ index, service }); setShowServiceModal(true); setOpenMenu(null) }}><Edit2 /> Edit</button><button type="button" role="menuitem" onClick={() => { duplicateService(service); setOpenMenu(null) }}><Copy /> Duplicate</button><button type="button" role="menuitem" className="danger" onClick={() => deleteService(service, index)}><Trash2 /> Delete</button></div>}</div></article>)}</div>}</section></main>
    {showCategoryModal && <div className="services-modal-backdrop" role="presentation" onMouseDown={() => setShowCategoryModal(false)}><section className="services-modal" role="dialog" aria-modal="true" aria-labelledby="new-category-title" onMouseDown={(event) => event.stopPropagation()}><div className="services-modal-heading"><h2 id="new-category-title">New category</h2><button type="button" onClick={() => setShowCategoryModal(false)} aria-label="Close modal">×</button></div><label>Category title<input autoFocus value={categoryTitle} onChange={(event) => setCategoryTitle(event.target.value)} placeholder="e.g. Hair services" /></label><div className="services-modal-actions"><button type="button" onClick={() => setShowCategoryModal(false)}>Cancel</button><Button type="button" onClick={saveCategory}>Add category</Button></div></section></div>}
    {showServiceModal && <ServiceFormModal initialService={editingService?.service} categories={categories} onClose={() => { setShowServiceModal(false); setEditingService(null) }} onSave={saveService} />}
  </>
}

function ServiceFormModal({ initialService, categories, onClose, onSave }: { initialService?: Service; categories: Category[]; onClose: () => void; onSave: (service: Omit<Service, "color">) => Promise<void> }) {
  const [name, setName] = useState(initialService?.name ?? "")
  const [duration, setDuration] = useState(initialService?.duration ?? "")
  const [bufferTime, setBufferTime] = useState(initialService?.bufferTime ?? "")
  const [price, setPrice] = useState(initialService?.price === "Free" ? "" : initialService?.price ?? "")
  const [category, setCategory] = useState(initialService?.category ?? categories[0]?.name ?? "Uncategorized")
  const [image, setImage] = useState(initialService?.image ?? "")
  const [imageFile, setImageFile] = useState<File>()
  const [showOnBookingPage, setShowOnBookingPage] = useState(initialService?.showOnBookingPage ?? true)
  const [saving, setSaving] = useState(false)
  const submit = async () => { if (!name.trim()) return; setSaving(true); await onSave({ name: name.trim(), duration, bufferTime, price: price.trim() || "Free", category, image, imageFile, showOnBookingPage }); setSaving(false) }
  return <div className="services-modal-backdrop" role="presentation" onMouseDown={onClose}><section className="services-modal services-service-modal" role="dialog" aria-modal="true" aria-labelledby="new-service-title" onMouseDown={(event) => event.stopPropagation()}><div className="services-modal-heading"><h2 id="new-service-title">New Service</h2><button type="button" onClick={onClose} aria-label="Close modal">×</button></div><div className="services-image-field"><div className="services-image-placeholder">{image ? <img src={image} alt="Service preview" /> : <ImageIcon />}</div><div><label htmlFor="service-image-upload" className="services-image-label">Service image</label><p>Up to 5 MB in size</p><label htmlFor="service-image-upload" className="services-upload-button"><ImageIcon /> Upload</label><input id="service-image-upload" type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file && file.size <= 5 * 1024 * 1024) { setImageFile(file); setImage(URL.createObjectURL(file)) } }} /></div></div><label>Title <span className="services-required">*</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Deep tissue massage" /></label><div className="services-modal-grid services-details-grid"><label>Duration <span className="services-required">*</span><div className="services-input-suffix"><input inputMode="numeric" value={duration.replace(" mins", "")} onChange={(event) => setDuration(event.target.value ? `${event.target.value} mins` : "")} /><span>mins</span></div></label><label>Buffer time <span className="services-info">i</span><div className="services-input-suffix"><input inputMode="numeric" value={bufferTime.replace(" mins", "")} onChange={(event) => setBufferTime(event.target.value ? `${event.target.value} mins` : "")} /><span>mins</span></div></label><label>Cost<div className="services-input-prefix"><span>PHP</span><input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" /></div></label></div><div className="services-modal-grid"><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Uncategorized</option>{categories.map((item) => <option key={item.id ?? item.name}>{item.name}</option>)}</select></label><label className="services-toggle-row"><span><strong>Show on booking page</strong><small>Let customers book this service online</small></span><input type="checkbox" checked={showOnBookingPage} onChange={(event) => setShowOnBookingPage(event.target.checked)} /></label></div><div className="services-modal-actions"><button type="button" onClick={onClose}>Cancel</button><Button type="button" onClick={submit} disabled={saving}>{saving ? "Saving..." : initialService ? "Save changes" : "Add service"}</Button></div></section></div>
}
