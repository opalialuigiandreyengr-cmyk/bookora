import { useEffect, useRef, useState, type PointerEvent } from "react"
import type { User } from "@supabase/supabase-js"
import { ArrowRight, BarChart3, CalendarDays, CalendarRange, ChevronDown, Copy, CreditCard, Edit2, Home, Image as ImageIcon, Link2, Minus, MoreVertical, Plus, Scissors, Search, Settings2, Store, Trash2, Upload, Users, ZoomIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/brand/Logo"
import { dashboardNav } from "@/data/mock"
import { supabase } from "@/lib/supabase"
import { showToast } from "@/components/ui/toast"

type Category = { id?: string; name: string }
type Service = { id?: string; name: string; description?: string; duration: string; bufferTime?: string; price: string; category?: string; categoryId?: string; image?: string; imageFile?: File; showOnBookingPage?: boolean; color: string }
const sidebarIcons = [Home, CalendarDays, CalendarRange, Users, Scissors, Users, CreditCard, BarChart3, Settings2]
const starterServices: Service[] = [
  { name: "Gel Manicure", duration: "60 mins", price: "PHP 650", color: "coral", showOnBookingPage: true },
  { name: "Hair Treatment", duration: "90 mins", price: "PHP 1,200", color: "lavender", showOnBookingPage: true },
  { name: "Classic Facial", duration: "60 mins", price: "Free", color: "mint", showOnBookingPage: true },
]

const restoreServiceOrder = (services: Service[], businessId: string) => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(`bookora-services-order-${businessId}`) ?? "[]") as string[]
    if (!saved.length) return services
    const positions = new Map(saved.map((key, index) => [key, index]))
    return [...services].sort((a, b) => (positions.get(a.id ?? a.name) ?? saved.length) - (positions.get(b.id ?? b.name) ?? saved.length))
  } catch {
    return services
  }
}

export function ServicesPage({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const name = String(user.user_metadata?.business_name ?? "Your business")
  const select = (item: string) => window.location.assign(item === "Settings" ? "/settings" : item === "Calendar" ? "/calendar" : item === "Services" ? "/services" : "/dashboard")
  return <div className="dashboard-shell services-standalone-shell"><aside className="dashboard-sidebar"><div className="dashboard-brand"><Logo /></div><div className="workspace-switcher"><span className="workspace-avatar"><Store /></span><span><strong>{name}</strong><small>Business account</small></span></div><nav className="dashboard-nav"><p className="dashboard-nav-label">Workspace</p>{dashboardNav.map((item, index) => { const Icon = sidebarIcons[index]; return <button key={item} className={item === "Services" ? "active" : ""} onClick={() => select(item)}><Icon /><span>{item}</span></button> })}</nav><div className="dashboard-sidebar-bottom"><div className="help-card"><strong>Need a hand?</strong><span>Our team is here to help you get set up.</span><button>Visit Help Center <ArrowRight /></button></div></div></aside><div className="dashboard-content services-standalone-content"><ServicesContent user={user} onSignOut={onSignOut} /></div></div>
}

function ServicesContent({ user, onSignOut: _onSignOut }: { user: User; onSignOut: () => void }) {
  const [allServices, setAllServices] = useState<Service[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [businessSlug, setBusinessSlug] = useState("")
  const services = allServices.filter((service) => {
    const matchesCategory = !selectedCategory || service.categoryId === selectedCategory || service.category === selectedCategory
    const query = searchQuery.trim().toLowerCase()
    const matchesSearch = !query || [service.name, service.category, service.price].some((value) => value?.toLowerCase().includes(query))
    return matchesCategory && matchesSearch
  })
  const setServices = setAllServices
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryTitle, setCategoryTitle] = useState("")
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [openMenu, setOpenMenu] = useState<number | null>(null)
  const [editingService, setEditingService] = useState<{ index: number; service: Service } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const nav = document.querySelector(".services-library-nav")
    if (!nav) return
    const handleCategoryClick = (event: Event) => {
      const button = (event.target as HTMLElement).closest("button")
      if (!button || !button.classList.contains("services-library-section") || button.classList.contains("services-category-add")) return
      const label = button.textContent?.trim() ?? ""
      nav.querySelectorAll(".services-library-section").forEach((item) => item.classList.remove("active"))
      button.classList.add("active")
      if (label.startsWith("Services (")) { setSelectedCategory(null); return }
      const category = categories.find((item) => label.replace(/\s+\(\d+\)$/, "") === item.name)
      if (category) setSelectedCategory(category.id ?? category.name)
    }
    nav.addEventListener("click", handleCategoryClick)
    return () => nav.removeEventListener("click", handleCategoryClick)
  }, [categories])

  useEffect(() => {
    const input = document.querySelector(".services-search input") as HTMLInputElement | null
    if (!input) return
    const handleSearch = (event: Event) => setSearchQuery((event.target as HTMLInputElement).value)
    input.addEventListener("input", handleSearch)
    return () => input.removeEventListener("input", handleSearch)
  }, [])

  const reorderServices = (source: Service, target: Service) => {
    if (source === target) return
    setServices((current) => {
      const sourceIndex = current.indexOf(source)
      const targetIndex = current.indexOf(target)
      if (sourceIndex < 0 || targetIndex < 0) return current
      const next = [...current]
      next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, source)
      try { window.localStorage.setItem(`bookora-services-order-${user.id}`, JSON.stringify(next.map((service) => service.id ?? service.name))) } catch { /* storage is optional */ }
      return next
    })
    showToast("Service order updated")
  }

  useEffect(() => {
    const list = document.querySelector(".services-list")
    if (!list) return
    const rows = Array.from(list.querySelectorAll<HTMLElement>(".service-row"))
    rows.forEach((row, index) => {
      row.draggable = true
      row.setAttribute("aria-grabbed", "false")
      if (!row.querySelector(".service-drag-handle")) {
        const handle = document.createElement("span")
        handle.className = "service-drag-handle"
        handle.setAttribute("aria-hidden", "true")
        handle.textContent = "⋮⋮"
        row.prepend(handle)
      }
      const onStart = (event: DragEvent) => {
        row.classList.add("is-dragging")
        row.setAttribute("aria-grabbed", "true")
        if (event.dataTransfer) { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(index)) }
      }
      const onEnd = () => { row.classList.remove("is-dragging"); row.setAttribute("aria-grabbed", "false"); rows.forEach((item) => item.classList.remove("is-drag-over")) }
      const onOver = (event: DragEvent) => { event.preventDefault(); row.classList.add("is-drag-over"); if (event.dataTransfer) event.dataTransfer.dropEffect = "move" }
      const onLeave = () => row.classList.remove("is-drag-over")
      const onDrop = (event: DragEvent) => { event.preventDefault(); const sourceIndex = Number(event.dataTransfer?.getData("text/plain")); const source = services[sourceIndex]; const target = services[index]; if (source && target) reorderServices(source, target); onEnd() }
      row.addEventListener("dragstart", onStart)
      row.addEventListener("dragend", onEnd)
      row.addEventListener("dragover", onOver)
      row.addEventListener("dragleave", onLeave)
      row.addEventListener("drop", onDrop)
      row.dataset.reorderBound = "true"
      ;(row as HTMLElement & { cleanupReorder?: () => void }).cleanupReorder = () => { row.removeEventListener("dragstart", onStart); row.removeEventListener("dragend", onEnd); row.removeEventListener("dragover", onOver); row.removeEventListener("dragleave", onLeave); row.removeEventListener("drop", onDrop) }
    })
    return () => rows.forEach((row) => (row as HTMLElement & { cleanupReorder?: () => void }).cleanupReorder?.())
  }, [services])

  useEffect(() => {
    const nav = document.querySelector(".services-library-nav")
    if (!nav) return
    const servicesLabel = nav.querySelector(".services-library-section:first-of-type span")
    if (servicesLabel) servicesLabel.textContent = `Services (${allServices.length})`
    categories.forEach((category) => {
      const button = Array.from(nav.querySelectorAll(".services-library-section")).find((item) => item.textContent?.trim().replace(/\s+\(\d+\)$/, "") === category.name)
      const label = button?.querySelector("span")
      if (label) { const count = allServices.filter((service) => service.categoryId === category.id || service.category === category.name).length; label.textContent = count ? `${category.name} (${count})` : category.name }
    })
  }, [categories, allServices])

  useEffect(() => {
    const nav = document.querySelector(".services-library-nav")
    if (!nav) return
    const categoryButtons = Array.from(nav.querySelectorAll(".services-library-section")).slice(1)
    categoryButtons.forEach((button, index) => {
      if (button.querySelector(".category-options-trigger")) return
      const trigger = document.createElement("span")
      trigger.className = "category-options-trigger"
      trigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>'
      trigger.setAttribute("role", "button")
      trigger.setAttribute("tabindex", "0")
      trigger.setAttribute("aria-label", `Options for ${categories[index]?.name ?? "category"}`)
      const openMenu = (event: Event) => {
        event.stopPropagation()
        nav.querySelector(".category-options-menu")?.remove()
        const category = categories[index]
        if (!category) return
        const menu = document.createElement("div")
        menu.className = "service-action-menu category-options-menu"
        const edit = document.createElement("button")
        edit.type = "button"
        edit.innerHTML = '<svg class="category-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg><span>Edit</span>'
        edit.onclick = () => { menu.remove(); void editCategory(category) }
        const remove = document.createElement("button")
        remove.type = "button"
        remove.innerHTML = '<svg class="category-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg><span>Delete</span>'
        remove.className = "danger"
        remove.onclick = () => { menu.remove(); void deleteCategory(category) }
        menu.append(edit, remove)
        nav.append(menu)
        const rect = button.getBoundingClientRect()
        const navRect = nav.getBoundingClientRect()
        menu.style.top = `${rect.bottom - navRect.top + 6}px`
        menu.style.right = "0"
      }
      trigger.addEventListener("click", openMenu)
      trigger.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") openMenu(event) })
      button.insertBefore(trigger, button.querySelector("svg"))
    })
    const closeMenu = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest(".category-options-menu, .category-options-trigger")) nav.querySelector(".category-options-menu")?.remove() }
    document.addEventListener("mousedown", closeMenu)
    return () => { document.removeEventListener("mousedown", closeMenu); nav.querySelector(".category-options-menu")?.remove() }
  }, [categories])

  useEffect(() => { const closeMenu = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest(".service-row-actions")) setOpenMenu(null) }; document.addEventListener("mousedown", closeMenu); return () => document.removeEventListener("mousedown", closeMenu) }, [])
  useEffect(() => {
    let active = true
    const load = async () => {
      if (!supabase || user.id.startsWith("preview-")) { if (active) { setServices(restoreServiceOrder(starterServices, user.id)); setLoading(false) }; return }
      
      const [{ data: categoryRows, error: categoryError }, serviceResWithDesc, { data: profileRow }] = await Promise.all([
        supabase.from("service_categories").select("id, name").eq("business_id", user.id).order("created_at"),
        supabase.from("services").select("id, name, description, duration_minutes, buffer_minutes, price, category_id, image_url, show_on_booking_page").eq("business_id", user.id).order("created_at"),
        supabase.from("business_profiles").select("slug, service_defaults_seeded").eq("id", user.id).maybeSingle()
      ])
      if (!active) return
      if (profileRow?.slug) setBusinessSlug(profileRow.slug)

      let serviceRows: any[] | null = serviceResWithDesc.data
      let serviceError = serviceResWithDesc.error

      // If querying with 'description' returns 400 (column missing in Supabase), fallback to query without it
      if (serviceError) {
        const fallbackRes = await supabase.from("services").select("id, name, duration_minutes, buffer_minutes, price, category_id, image_url, show_on_booking_page").eq("business_id", user.id).order("created_at")
        if (!fallbackRes.error) {
          serviceRows = fallbackRes.data
          serviceError = null
        }
      }

      if (categoryError || serviceError) { setError(categoryError?.message ?? serviceError?.message ?? "Could not load services."); setServices(restoreServiceOrder(starterServices, user.id)); setLoading(false); return }
      const nextCategories = (categoryRows ?? []) as Category[]
      let nextServices = (serviceRows ?? []).map((row: any, index) => ({ id: row.id, name: row.name, description: row.description || "", duration: row.duration_minutes ? `${row.duration_minutes} mins` : "", bufferTime: row.buffer_minutes ? `${row.buffer_minutes} mins` : "", price: row.price || "Free", categoryId: row.category_id ?? undefined, category: nextCategories.find((item) => item.id === row.category_id)?.name, image: row.image_url || "", showOnBookingPage: row.show_on_booking_page ?? true, color: ["coral", "lavender", "mint", "peach"][index % 4] })) as Service[]
      if (!nextServices.length && !profileRow?.service_defaults_seeded) {
        const { data: seeded } = await supabase.from("services").insert(starterServices.map((service) => ({ business_id: user.id, name: service.name, duration_minutes: parseInt(service.duration, 10), buffer_minutes: 0, price: service.price, show_on_booking_page: true }))).select("id, name, duration_minutes, buffer_minutes, price, show_on_booking_page")
        nextServices = (seeded ?? []).map((row: any, index) => ({ id: row.id, name: row.name, description: "", duration: `${row.duration_minutes} mins`, bufferTime: "", price: row.price, showOnBookingPage: row.show_on_booking_page, color: ["coral", "lavender", "mint"][index] }))
        await supabase.from("business_profiles").update({ service_defaults_seeded: true }).eq("id", user.id)
      }
      setCategories(nextCategories); setServices(restoreServiceOrder(nextServices, user.id)); setLoading(false)
    }
    load().catch((loadError) => { if (active) { setError(loadError.message); setServices(restoreServiceOrder(starterServices, user.id)); setLoading(false) } })
    return () => { active = false }
  }, [user.id])

  const saveCategory = async () => { const name = categoryTitle.trim(); if (!name) return; if (!supabase || user.id.startsWith("preview-")) { setCategories((current) => [...current, { name }]); setCategoryTitle(""); setShowCategoryModal(false); showToast("Category added"); return }; const { data, error: categoryError } = await supabase.from("service_categories").insert({ business_id: user.id, name }).select("id, name").single(); if (categoryError) { setError(categoryError.message); showToast(categoryError.message, "error"); return }; setCategories((current) => [...current, { id: data?.id, name: data?.name ?? name }]); setCategoryTitle(""); setShowCategoryModal(false); showToast("Category added") }
  const editCategory = async (category: Category) => { const name = window.prompt("Edit category name", category.name)?.trim(); if (!name || name === category.name) return; if (supabase && category.id && !user.id.startsWith("preview-")) { const result = await supabase.from("service_categories").update({ name }).eq("id", category.id).eq("business_id", user.id); if (result.error) { setError(result.error.message); showToast(result.error.message, "error"); return } }; setCategories((current) => current.map((item) => item.id === category.id || (!item.id && item.name === category.name) ? { ...item, name } : item)); setServices((current) => current.map((service) => service.categoryId === category.id || service.category === category.name ? { ...service, category: name } : service)); showToast("Category updated") }
  const deleteCategory = async (category: Category) => { if (!window.confirm(`Delete ${category.name}?`)) return; if (supabase && category.id && !user.id.startsWith("preview-")) { const result = await supabase.from("service_categories").delete().eq("id", category.id).eq("business_id", user.id); if (result.error) { setError(result.error.message); showToast(result.error.message, "error"); return } }; setCategories((current) => current.filter((item) => item.id !== category.id || (!category.id && item.name !== category.name))); setServices((current) => current.map((service) => service.categoryId === category.id || service.category === category.name ? { ...service, category: undefined, categoryId: undefined } : service)); setSelectedCategory(null); showToast("Category deleted") }
  const saveService = async (service: Omit<Service, "color">) => {
    let imageUrl = service.image || ""
    if (supabase && service.imageFile && !user.id.startsWith("preview-")) { const extension = service.imageFile.name.split(".").pop() || "jpg"; const path = `${user.id}/${crypto.randomUUID()}.${extension}`; const upload = await supabase.storage.from("service-assets").upload(path, service.imageFile, { upsert: true }); if (upload.error) { setError(upload.error.message); return }; imageUrl = supabase.storage.from("service-assets").getPublicUrl(path).data.publicUrl }
    const categoryId = categories.find((item) => item.name === service.category)?.id ?? null
    const payloadWithDesc = { name: service.name, description: service.description || "", duration_minutes: parseInt(service.duration, 10) || null, buffer_minutes: parseInt(service.bufferTime ?? "", 10) || 0, price: service.price, category_id: categoryId, image_url: imageUrl, show_on_booking_page: service.showOnBookingPage ?? true }
    const payloadWithoutDesc = { name: service.name, duration_minutes: parseInt(service.duration, 10) || null, buffer_minutes: parseInt(service.bufferTime ?? "", 10) || 0, price: service.price, category_id: categoryId, image_url: imageUrl, show_on_booking_page: service.showOnBookingPage ?? true }
    
    if (supabase && !user.id.startsWith("preview-")) {
      let result = editingService
        ? await supabase.from("services").update(payloadWithDesc).eq("id", editingService.service.id).eq("business_id", user.id).select("id").single()
        : await supabase.from("services").insert({ ...payloadWithDesc, business_id: user.id }).select("id").single()

      // If description column doesn't exist yet in Supabase, retry without description
      if (result.error && (result.error.code === "PGRST100" || result.error.message?.includes("description") || result.error.message?.includes("column"))) {
        result = editingService
          ? await supabase.from("services").update(payloadWithoutDesc).eq("id", editingService.service.id).eq("business_id", user.id).select("id").single()
          : await supabase.from("services").insert({ ...payloadWithoutDesc, business_id: user.id }).select("id").single()
      }

      if (result.error) { setError(result.error.message); showToast(result.error.message, "error"); return }
      const saved = { ...service, id: result.data.id, image: imageUrl, categoryId: categoryId ?? undefined, color: editingService?.service.color ?? "peach" }
      setServices((current) => editingService ? current.map((item, index) => index === editingService.index ? saved : item) : [...current, saved])
    } else {
      const saved = { ...service, image: imageUrl, categoryId: categoryId ?? undefined, color: editingService?.service.color ?? "peach" }
      setServices((current) => editingService ? current.map((item, index) => index === editingService.index ? { ...item, ...saved } : item) : [...current, saved])
    }
    setShowServiceModal(false); showToast(editingService ? "Service updated" : "Service added"); setEditingService(null)
  }
  const duplicateService = async (service: Service) => { await saveService({ ...service, id: undefined, name: `${service.name} copy`, description: service.description, imageFile: undefined }) }
  const deleteService = async (service: Service, index: number) => { if (supabase && service.id && !user.id.startsWith("preview-")) { const result = await supabase.from("services").delete().eq("id", service.id).eq("business_id", user.id); if (result.error) { setError(result.error.message); showToast(result.error.message, "error"); return } }; setServices((current) => current.filter((_, itemIndex) => itemIndex !== index)); setOpenMenu(null); showToast("Service deleted") }

  const activeSlug = businessSlug || (typeof user.user_metadata?.slug === "string" ? user.user_metadata.slug : "") || user.user_metadata?.business_name?.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "nailsou"
  const publicBookingUrl = `${window.location.origin}/book?slug=${activeSlug}`

  return <>
    <main className="services-standalone"><aside className="services-library-nav"><h1>Services</h1><button className="services-library-section active"><span>Services ({services.length})</span><ChevronDown /></button><button className="services-category-add" onClick={() => setShowCategoryModal(true)}><Plus /> New service category</button>{categories.map((category) => <button className="services-library-section" key={category.id ?? category.name}><span>{category.name}</span><ChevronDown /></button>)}</aside><section className="services-main"><header className="services-main-heading"><h2>Services</h2><div><button className="services-icon-action" aria-label="Export services"><Upload /></button><Button onClick={() => { setEditingService(null); setShowServiceModal(true) }} aria-label="Add service"><Plus /></Button></div></header><div className="services-toolbar"><button className="services-team-filter"><Plus /> Team <ChevronDown /></button><label className="services-search"><Search /><input placeholder="Services" aria-label="Search services" /></label><button className="services-booking-link" type="button" onClick={() => window.open(publicBookingUrl, "_blank")} title="Open customer booking page"><span>*</span><u>{activeSlug}.bookora.com</u><Link2 /></button></div>{error && <p className="services-error" role="alert">{error}</p>}{loading ? <div className="services-empty-state">Loading services...</div> : <div className="services-list">{services.map((service, index) => <article className={`service-row ${service.color}`} key={service.id ?? `${service.name}-${index}`}><div className={`service-row-icon ${service.color}`}>{service.image ? <img src={service.image} alt="" /> : <Scissors />}</div><div className="service-row-info"><h3>{service.name}</h3>{service.description && <p className="service-row-subtitle">{service.description}</p>}<p>{service.duration} · {service.price}</p></div><button className="service-copy-link" type="button" onClick={() => { navigator.clipboard?.writeText(publicBookingUrl); showToast("Booking link copied!") }}><Link2 /> Copy link</button><div className="service-row-actions"><button className="service-row-menu" aria-label={`More options for ${service.name}`} aria-expanded={openMenu === index} onClick={() => setOpenMenu(openMenu === index ? null : index)}><MoreVertical /></button>{openMenu === index && <div className="service-action-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setEditingService({ index, service }); setShowServiceModal(true); setOpenMenu(null) }}><Edit2 /> Edit</button><button type="button" role="menuitem" onClick={() => { duplicateService(service); setOpenMenu(null) }}><Copy /> Duplicate</button><button type="button" role="menuitem" className="danger" onClick={() => deleteService(service, index)}><Trash2 /> Delete</button></div>}</div></article>)}</div>}</section></main>
    {showCategoryModal && <div className="services-modal-backdrop" role="presentation" onMouseDown={() => setShowCategoryModal(false)}><section className="services-modal" role="dialog" aria-modal="true" aria-labelledby="new-category-title" onMouseDown={(event) => event.stopPropagation()}><div className="services-modal-heading"><h2 id="new-category-title">New category</h2><button type="button" onClick={() => setShowCategoryModal(false)} aria-label="Close modal">×</button></div><label>Category title<input autoFocus value={categoryTitle} onChange={(event) => setCategoryTitle(event.target.value)} placeholder="e.g. Hair services" /></label><div className="services-modal-actions"><button type="button" onClick={() => setShowCategoryModal(false)}>Cancel</button><Button type="button" onClick={saveCategory}>Add category</Button></div></section></div>}
    {showServiceModal && <ServiceFormModal initialService={editingService?.service} categories={categories} onClose={() => { setShowServiceModal(false); setEditingService(null) }} onSave={saveService} />}
  </>
}

function ServiceFormModal({ initialService, categories, onClose, onSave }: { initialService?: Service; categories: Category[]; onClose: () => void; onSave: (service: Omit<Service, "color">) => Promise<void> }) {
  const [name, setName] = useState(initialService?.name ?? "")
  const [description, setDescription] = useState(initialService?.description ?? "")
  const [duration, setDuration] = useState(initialService?.duration ?? "")
  const [bufferTime, setBufferTime] = useState(initialService?.bufferTime ?? "")
  const [price, setPrice] = useState(initialService?.price === "Free" ? "" : initialService?.price?.replace(/^(PHP|₱)\s*/i, "") ?? "")
  const [category, setCategory] = useState(initialService?.category ?? "Default services")
  const [image, setImage] = useState(initialService?.image ?? "")
  const [imageFile, setImageFile] = useState<File>()
  const [cropFile, setCropFile] = useState<File>()
  const [cropSource, setCropSource] = useState("")
  const [cropZoom, setCropZoom] = useState(1)
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 })
  const [imageError, setImageError] = useState("")
  const [showOnBookingPage, setShowOnBookingPage] = useState(initialService?.showOnBookingPage ?? true)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setPrice(initialService?.price === "Free" ? "" : initialService?.price?.replace(/^\s*(?:PHP|₱|â‚±)\s*/i, "") ?? "") }, [initialService])
  useEffect(() => { const fallback = document.querySelector<HTMLSelectElement>(".services-service-modal select"); const option = fallback?.options[0]; if (option?.text === "Uncategorized") { option.text = "Default services"; option.value = "Default services" } }, [categories])
  const selectImage = (file?: File) => { if (!file) return; if (!["image/jpeg", "image/png"].includes(file.type)) { setImageError("Please choose a JPG, JPEG, or PNG file."); return }; if (file.size > 5 * 1024 * 1024) { setImageError("The image must be 5MB or smaller."); return }; setImageError(""); setCropFile(file); setCropSource(URL.createObjectURL(file)); setCropZoom(1); setCropPosition({ x: 0, y: 0 }) }
  const applyCrop = (position = cropPosition) => { if (!cropFile || !cropSource) return; const source = new Image(); source.onload = () => { const side = Math.min(source.naturalWidth, source.naturalHeight) / cropZoom; const offsetX = position.x * side; const offsetY = position.y * side; const canvas = document.createElement("canvas"); canvas.width = 200; canvas.height = 200; canvas.getContext("2d")?.drawImage(source, (source.naturalWidth - side) / 2 + offsetX, (source.naturalHeight - side) / 2 + offsetY, side, side, 0, 0, 200, 200); canvas.toBlob((blob) => { if (!blob) return; const cropped = new File([blob], cropFile.name, { type: "image/jpeg" }); setImageFile(cropped); setImage(URL.createObjectURL(cropped)); setCropSource(""); setCropFile(undefined) }, "image/jpeg", .9) }; source.src = cropSource }
  const submit = async () => { if (!name.trim()) return; setSaving(true); await onSave({ name: name.trim(), description: description.trim(), duration, bufferTime, price: price.trim() ? `PHP ${price.trim()}` : "Free", category, image, imageFile, showOnBookingPage }); setSaving(false) }
  return <><div className="services-modal-backdrop" role="presentation" onMouseDown={onClose}><section className="services-modal services-service-modal" role="dialog" aria-modal="true" aria-labelledby="new-service-title" onMouseDown={(event) => event.stopPropagation()}><div className="services-modal-heading"><h2 id="new-service-title">New Service</h2><button type="button" onClick={onClose} aria-label="Close modal">×</button></div><div className="services-image-field"><div className="services-image-placeholder">{image ? <img src={image} alt="Service preview" /> : <ImageIcon />}</div><div><label htmlFor="service-image-upload" className="services-image-label">Service image</label><p>200 × 200px recommended · JPG, JPEG and PNG files only · Up to 5MB in size.</p><label htmlFor="service-image-upload" className="services-upload-button"><ImageIcon /> Upload</label><input id="service-image-upload" type="file" accept="image/jpeg,image/png" onChange={(event) => selectImage(event.target.files?.[0])} />{imageError && <small className="services-image-error" role="alert">{imageError}</small>}</div></div><label>Title <span className="services-required">*</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Softgel Extension" /></label><label>Subtitle / Note <span className="services-info">i</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. (prices may vary depending on your design) or Min. of 2pax" /></label><div className="services-modal-grid services-details-grid"><label>Duration <span className="services-required">*</span><div className="services-input-suffix"><input inputMode="numeric" value={duration.replace(" mins", "")} onChange={(event) => setDuration(event.target.value ? `${event.target.value} mins` : "")} /><span>mins</span></div></label><label>Buffer time <span className="services-info">i</span><div className="services-input-suffix"><input inputMode="numeric" value={bufferTime.replace(" mins", "")} onChange={(event) => setBufferTime(event.target.value ? `${event.target.value} mins` : "")} /><span>mins</span></div></label><label>Cost<div className="services-input-prefix"><span>PHP</span><input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" /></div></label></div><div className="services-modal-grid"><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Uncategorized</option>{categories.map((item) => <option key={item.id ?? item.name}>{item.name}</option>)}</select></label><label className="services-toggle-row"><span><strong>Show on booking page</strong><small>Let customers book this service online</small></span><input type="checkbox" checked={showOnBookingPage} onChange={(event) => setShowOnBookingPage(event.target.checked)} /></label></div><div className="services-modal-actions"><button type="button" onClick={onClose}>Cancel</button><Button type="button" onClick={submit} disabled={saving}>{saving ? "Saving..." : initialService ? "Save changes" : "Add service"}</Button></div></section></div>{cropSource && <ServiceImageCropModal source={cropSource} zoom={cropZoom} onZoom={setCropZoom} onCancel={() => { setCropSource(""); setCropFile(undefined) }} onApply={applyCrop} />}</>
}

function ServiceImageCropModal({ source, zoom, onZoom, onCancel, onApply }: { source: string; zoom: number; onZoom: (value: number) => void; onCancel: () => void; onApply: (position: { x: number; y: number }) => void }) {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [frameSize, setFrameSize] = useState(0)
  const [dragStart, setDragStart] = useState<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const syncFrameSize = () => { const bounds = imageRef.current?.getBoundingClientRect(); if (bounds) setFrameSize(Math.min(bounds.width, bounds.height)) }
  useEffect(() => { syncFrameSize(); const image = imageRef.current; if (!image || typeof ResizeObserver === "undefined") return; const observer = new ResizeObserver(syncFrameSize); observer.observe(image); return () => observer.disconnect() }, [source, zoom])
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => { event.currentTarget.setPointerCapture(event.pointerId); setDragStart({ pointerX: event.clientX, pointerY: event.clientY, x: position.x, y: position.y }) }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => { if (!dragStart) return; const imageBounds = imageRef.current?.getBoundingClientRect(); const windowBounds = event.currentTarget.getBoundingClientRect(); const maxX = Math.max(0, ((imageBounds?.width ?? 220) - windowBounds.width) / 2); const maxY = Math.max(0, ((imageBounds?.height ?? 300) - windowBounds.height) / 2); setPosition({ x: Math.max(-maxX, Math.min(maxX, dragStart.x + event.clientX - dragStart.pointerX)), y: Math.max(-maxY, Math.min(maxY, dragStart.y + event.clientY - dragStart.pointerY)) }) }
  const onPointerUp = () => setDragStart(null)
  return <div className="service-crop-backdrop" role="presentation"><section className="service-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="service-image-title" onMouseDown={(event) => event.stopPropagation()}><div className="service-crop-heading"><h2 id="service-image-title">Service image</h2><button type="button" onClick={onCancel} aria-label="Close cropper">&times;</button></div><div className="service-crop-stage"><img ref={imageRef} src={source} alt="Crop preview" onLoad={syncFrameSize} style={{ transform: `scale(${zoom})` }} /><div className="service-crop-window" style={{ width: frameSize, height: frameSize, transform: `translate(${position.x}px, ${position.y}px)` }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} /></div><div className="service-crop-controls"><Minus /><input aria-label="Image zoom" type="range" min="1" max="2.5" step="0.05" value={zoom} onChange={(event) => onZoom(Number(event.target.value))} /><ZoomIn /></div><div className="service-crop-actions"><button type="button" onClick={onCancel}>Cancel</button><Button type="button" onClick={() => onApply({ x: position.x / (imageRef.current?.getBoundingClientRect().width || 220), y: position.y / (imageRef.current?.getBoundingClientRect().height || 300) })}>Apply</Button></div></section></div>
}
