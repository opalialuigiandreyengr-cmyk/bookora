import { useEffect, useMemo, useRef, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { ArrowRight, Calendar, ChevronLeft, Mail, MessageCircle, MoreVertical, Pencil, Phone, Plus, Search, Tag, Users, X } from "lucide-react"
import { OwnerMobileMenuButton, OwnerSidebar } from "@/components/owner/OwnerSidebar"
import { showToast } from "@/components/ui/toast"
import { supabase } from "@/lib/supabase"
import { buildDemoAppointments, type CalendarAppointment } from "@/pages/calendar/types"

type Client = { id: string; full_name: string; email: string; phone: string; notes: string; tags: string[]; blocked?: boolean; created_at?: string }
const demoClients: Client[] = [
  { id: "client-anna", full_name: "Anna Reyes", email: "anna.reyes@example.com", phone: "+63 917 204 8812", notes: "Prefers soft neutral nude gel shade.", tags: ["returning"], blocked: false, created_at: "2026-01-12" },
  { id: "client-liza", full_name: "Liza Gomez", email: "liza.gomez@example.com", phone: "+63 918 552 3109", notes: "French tip nail art request.", tags: ["regular"], blocked: false, created_at: "2026-02-04" },
]
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`

function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"' && quoted && text[index + 1] === '"') { cell += '"'; index += 1; continue }
    if (character === '"') { quoted = !quoted; continue }
    if (character === "," && !quoted) { row.push(cell.trim()); cell = ""; continue }
    if ((character === "\n" || character === "\r") && !quoted) { if (character === "\r" && text[index + 1] === "\n") index += 1; row.push(cell.trim()); cell = ""; if (row.some(Boolean)) rows.push(row); row = []; continue }
    cell += character
  }
  if (cell || row.length) { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row) }
  return rows
}

const emptyClient = (): Client => ({ id: "", full_name: "", email: "", phone: "", notes: "", tags: [], blocked: false })

export function ClientsPage(props: { user: User; onSignOut: () => void }) {
  return <><LegacyClientsPage {...props} /><ClientMergePanel user={props.user} /></>
}

function ClientMergePanel({ user }: { user: User }) {
  type MergeClient = { id: string; full_name: string; email: string; phone: string; notes: string; tags: string[] }
  const [pairs, setPairs] = useState<Array<[MergeClient, MergeClient]>>([])
  const [merging, setMerging] = useState<string | null>(null)
  const isLive = Boolean(supabase && user.id !== "preview-user-123")
  const load = async () => {
    if (!isLive || !supabase) return
    const result = await supabase.from("clients").select("id, full_name, email, phone, notes, tags").eq("business_id", user.id).order("created_at", { ascending: true })
    if (result.error) return
    const rows = (result.data || []) as MergeClient[]; const seen = new Set<string>(); const next: Array<[MergeClient, MergeClient]> = []
    for (const client of rows) {
      const key = client.email.trim().toLowerCase() || `${client.full_name.trim().toLowerCase()}|${client.phone.trim()}`
      if (!key || seen.has(key)) continue
      const duplicate = rows.find((other) => other.id !== client.id && (other.email.trim().toLowerCase() === key || (!client.email && `${other.full_name.trim().toLowerCase()}|${other.phone.trim()}` === key)))
      if (duplicate) { next.push([client, duplicate]); seen.add(key) }
    }
    setPairs(next)
  }
  useEffect(() => { void load() }, [isLive, user.id])
  if (!pairs.length) return null
  const merge = async (survivor: MergeClient, duplicate: MergeClient) => {
    if (!supabase || !window.confirm(`Merge ${duplicate.full_name} into ${survivor.full_name}? This cannot be undone.`)) return
    setMerging(duplicate.id)
    const tags = [...new Set([...survivor.tags, ...duplicate.tags].filter(Boolean))]
    const notes = [survivor.notes, duplicate.notes].filter(Boolean).join("\n\n")
    const survivorUpdate = await supabase.from("clients").update({ notes, tags }).eq("id", survivor.id).eq("business_id", user.id)
    if (survivorUpdate.error) { showToast(survivorUpdate.error.message, "error"); setMerging(null); return }
    if (duplicate.email && survivor.email && duplicate.email.toLowerCase() !== survivor.email.toLowerCase()) await supabase.from("appointments").update({ customer_email: survivor.email, customer_name: survivor.full_name, customer_phone: survivor.phone }).eq("business_id", user.id).eq("customer_email", duplicate.email)
    const deleted = await supabase.from("clients").delete().eq("id", duplicate.id).eq("business_id", user.id)
    if (deleted.error) showToast(deleted.error.message, "error"); else { showToast("Duplicate client merged"); await load() }
    setMerging(null)
  }
  return <aside className="client-merge-panel" aria-live="polite"><div><strong>Possible duplicates</strong><span>Review before merging</span></div>{pairs.map(([survivor, duplicate]) => <div className="client-merge-item" key={`${survivor.id}-${duplicate.id}`}><span><strong>{survivor.full_name}</strong><small>{survivor.email || survivor.phone || "No contact"} + {duplicate.full_name}</small></span><button type="button" onClick={() => void merge(survivor, duplicate)} disabled={merging === duplicate.id}>{merging === duplicate.id ? "Merging…" : "Merge"}</button></div>)}</aside>
}

function LegacyClientsPage({ user }: { user: User; onSignOut: () => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([])
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState("")
  const importInput = useRef<HTMLInputElement>(null)
  const isLive = Boolean(supabase && user.id !== "preview-user-123")
  const storageKey = `bookora-clients-${user.id}`

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      if (!isLive || !supabase) {
        let saved = demoClients
        try { const raw = window.localStorage.getItem(storageKey); if (raw) saved = JSON.parse(raw) as Client[] } catch { /* demo fallback */ }
        if (active) { setClients(saved); setAppointments(buildDemoAppointments(new Date(), user.id)) }
        setLoading(false); return
      }
      const [clientResult, appointmentResult] = await Promise.all([
        supabase.from("clients").select("*").eq("business_id", user.id).order("created_at", { ascending: false }),
        supabase.from("appointments").select("*").eq("business_id", user.id).order("appointment_date", { ascending: false }),
      ])
      if (!active) return
      if (clientResult.error) setError(clientResult.error.message)
      setClients((clientResult.data || []).map((row) => ({ id: String(row.id), full_name: String(row.full_name || ""), email: String(row.email || ""), phone: String(row.phone || ""), notes: String(row.notes || ""), tags: Array.isArray(row.tags) ? row.tags.map(String) : [], blocked: Boolean(row.blocked), created_at: String(row.created_at || "") })))
      setAppointments((appointmentResult.data || []).map((row) => ({ id: String(row.id), business_id: user.id, customer_name: String(row.customer_name || "Client"), customer_email: String(row.customer_email || ""), customer_phone: String(row.customer_phone || ""), service_names: String(row.service_names || "Appointment"), total_price: String(row.total_price || ""), appointment_date: String(row.appointment_date || "").slice(0, 10), appointment_time: String(row.appointment_time || ""), duration_minutes: Number(row.duration_minutes) || 60, status: ["completed", "cancelled", "no_show", "pending"].includes(String(row.status)) ? String(row.status) as CalendarAppointment["status"] : "approved", color: "coral" })))
      setLoading(false)
    }
    void load(); return () => { active = false }
  }, [isLive, storageKey, user.id])

  useEffect(() => {
    if (!selected) return
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null) }
    document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close)
  }, [selected])

  const visible = useMemo(() => { const query = search.trim().toLowerCase(); return clients.filter((client) => !query || [client.full_name, client.email, client.phone, ...client.tags].some((value) => value.toLowerCase().includes(query))) }, [clients, search])
  const historyFor = (client: Client) => appointments.filter((item) => item.customer_email.toLowerCase() === client.email.toLowerCase() || item.customer_name.toLowerCase() === client.full_name.toLowerCase())

  const exportCsv = () => {
    const rows = [["Name", "Email", "Phone", "Tags", "Notes", "Booking access", "Created", "Appointments", "Lifetime spend"], ...visible.map((client) => { const history = historyFor(client); const spend = history.reduce((sum, item) => sum + (Number(String(item.total_price).replace(/[^0-9.-]+/g, "")) || 0), 0); return [client.full_name, client.email, client.phone, client.tags.join(", "), client.notes, client.blocked ? "blocked" : "active", client.created_at || "", history.length, spend.toFixed(2)] })]
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "bookora-clients.csv"; link.click(); URL.revokeObjectURL(url); showToast(`${visible.length} client${visible.length === 1 ? "" : "s"} exported`)
  }

  const importCsv = async (file: File) => {
    setImporting(true)
    try {
      const rows = parseCsv(await file.text()); if (rows.length < 2) throw new Error("The CSV needs a header row and at least one client.")
      const headers = rows[0].map((header) => header.toLowerCase()); const indexOf = (...names: string[]) => names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1
      const nameIndex = indexOf("name", "full_name", "full name"); const emailIndex = indexOf("email", "email address"); const phoneIndex = indexOf("phone", "phone number"); const tagsIndex = indexOf("tags", "tag"); const notesIndex = indexOf("notes", "internal notes"); const blockedIndex = indexOf("blocked", "booking access")
      if (nameIndex < 0) throw new Error("CSV must include a Name column.")
      const imported = new Map<string, Client>(); let invalid = 0
      for (const values of rows.slice(1)) {
        const fullName = String(values[nameIndex] || "").trim(); const email = String(emailIndex >= 0 ? values[emailIndex] || "" : "").trim().toLowerCase()
        if (!fullName || (email && !/^\S+@\S+\.\S+$/.test(email))) { invalid += 1; continue }
        const key = email || `name:${fullName.toLowerCase()}`; imported.set(key, { id: "", full_name: fullName, email, phone: String(phoneIndex >= 0 ? values[phoneIndex] || "" : "").trim(), notes: String(notesIndex >= 0 ? values[notesIndex] || "" : "").trim().slice(0, 500), tags: String(tagsIndex >= 0 ? values[tagsIndex] || "" : "").split(",").map((tag) => tag.trim()).filter(Boolean), blocked: blockedIndex >= 0 && ["blocked", "true", "yes", "1"].includes(String(values[blockedIndex] || "").trim().toLowerCase()) })
      }
      if (!imported.size) throw new Error("No valid client rows were found.")
      let next = [...clients]
      for (const draft of imported.values()) {
        const existing = draft.email ? next.find((client) => client.email.toLowerCase() === draft.email) : next.find((client) => !client.email && client.full_name.toLowerCase() === draft.full_name.toLowerCase())
        if (isLive && supabase) {
          const result = existing ? await supabase.from("clients").update({ ...draft, business_id: user.id, blocked: Boolean(existing.blocked) }).eq("id", existing.id).eq("business_id", user.id).select("*").single() : await supabase.from("clients").insert({ ...draft, business_id: user.id }).select("*").single()
          if (result.error) throw new Error(result.error.message)
          const saved = { ...draft, id: String(result.data.id), blocked: Boolean(result.data.blocked), created_at: String(result.data.created_at || "") }; next = existing ? next.map((client) => client.id === existing.id ? saved : client) : [saved, ...next]
        } else { const saved = { ...draft, id: existing?.id || `client-import-${Date.now()}-${next.length}` }; next = existing ? next.map((client) => client.id === existing.id ? saved : client) : [saved, ...next] }
      }
      setClients(next); if (!isLive) window.localStorage.setItem(storageKey, JSON.stringify(next)); showToast(`${imported.size} client${imported.size === 1 ? "" : "s"} imported${invalid ? `; ${invalid} skipped` : ""}`)
    } catch (importError) { showToast(importError instanceof Error ? importError.message : "Client import failed.", "error") } finally { setImporting(false); if (importInput.current) importInput.current.value = "" }
  }

  const saveClient = async (draft: Client) => {
    if (!draft.full_name.trim()) { showToast("Add a client name first.", "error"); return }
    setSaving(true); const payload = { business_id: user.id, full_name: draft.full_name.trim(), email: draft.email.trim(), phone: draft.phone.trim(), notes: draft.notes.trim(), tags: draft.tags.map((tag) => tag.trim()).filter(Boolean), blocked: Boolean(draft.blocked) }
    if (isLive && supabase) { const result = draft.id ? await supabase.from("clients").update(payload).eq("id", draft.id).eq("business_id", user.id).select("*").single() : await supabase.from("clients").insert(payload).select("*").single(); if (result.error) { showToast(result.error.message, "error"); setSaving(false); return }; draft = { ...draft, id: String(result.data.id), ...payload } } else { draft = { ...draft, id: draft.id || `client-${Date.now()}` } }
    const next = clients.some((client) => client.id === draft.id) ? clients.map((client) => client.id === draft.id ? draft : client) : [draft, ...clients]; setClients(next); if (!isLive) window.localStorage.setItem(storageKey, JSON.stringify(next)); setSelected(draft); setSaving(false); showToast("Client saved")
  }

  const selectedHistory = selected ? historyFor(selected) : []
  const selectedSpend = selectedHistory.reduce((sum, item) => sum + (Number(String(item.total_price).replace(/[^0-9.-]+/g, "")) || 0), 0)

  useEffect(() => {
    const noteField = document.querySelector(".client-drawer textarea")
    if (noteField instanceof HTMLTextAreaElement) noteField.placeholder = "Add your note"
  }, [selected?.id])

  return <div className="dashboard-shell clients-page-shell">
    <OwnerSidebar user={user} active="Clients" open={sidebarOpen} onClose={() => setSidebarOpen(false)} onNavigate={(path) => window.location.assign(path)} />
    <div className="dashboard-content"><header className="dashboard-header"><OwnerMobileMenuButton onOpen={() => setSidebarOpen(true)} /><div className="dashboard-header-context"><span>Clients</span><small>Owner workspace</small></div></header>
      <main className="dashboard-main clients-main">
        <div className="dashboard-page-heading clients-compact-heading"><div className="clients-heading-actions"><button className="clients-primary-action" type="button" onClick={() => setSelected(emptyClient())}><Plus size={16} /> Add client</button></div></div>
        {error && <div className="clients-error" role="alert">{error}</div>}
        <div className="clients-toolbar"><label className="clients-search"><Search size={16} /><input aria-label="Search clients" placeholder="Search name, email, phone, or tag" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
        {loading ? <div className="clients-empty">Loading clients…</div> : visible.length === 0 ? <div className="clients-empty"><Users size={24} /><strong>{clients.length ? "No matching clients" : "No clients yet"}</strong><span>{clients.length ? "Try a different search term." : "Add your first client to start building a relationship history."}</span>{clients.length === 0 && <button type="button" onClick={() => setSelected(emptyClient())}>Add client</button>}</div> : <section className="clients-list" aria-label="Clients">{visible.map((client) => <article className="client-card" key={client.id}><button type="button" className="client-card-main" onClick={() => setSelected(client)}><span className="client-avatar">{client.full_name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?"}</span><span><strong>{client.full_name}</strong><small>{client.email || "No email"}</small><small>{client.phone || "No phone"}</small></span></button><div className="client-card-tags">{client.blocked && <span className="client-blocked-tag">Blocked online</span>}{client.tags.map((tag) => <span key={tag}><Tag size={12} /> {tag}</span>)}</div><button type="button" className="client-view-action" onClick={() => setSelected(client)}>View <ArrowRight size={14} /></button></article>)}</section>}
      </main>
    </div>
    {selected && <div className="client-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}><aside className="client-drawer" role="dialog" aria-modal="true" aria-labelledby="client-drawer-title"><header><button type="button" className="client-back-button" aria-label="Back to clients" onClick={() => setSelected(null)}><ChevronLeft size={18} /></button><div className="client-profile-hero"><span className="client-profile-avatar">{selected.full_name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?"}</span><h2 id="client-drawer-title">{selected.id ? selected.full_name : "Add client"}</h2></div><div className="client-profile-actions"><button type="button" aria-label="Edit client"><Pencil size={14} /></button><button type="button" aria-label="More client actions"><MoreVertical size={14} /></button></div></header><div className="client-form"><label>Name<input value={selected.full_name} onChange={(event) => setSelected({ ...selected, full_name: event.target.value })} maxLength={100} required /></label><label>Email<input type="email" value={selected.email} onChange={(event) => setSelected({ ...selected, email: event.target.value })} maxLength={150} /></label><label>Phone<input type="tel" value={selected.phone} onChange={(event) => setSelected({ ...selected, phone: event.target.value })} maxLength={40} /></label><label>Tags<input value={selected.tags.join(", ")} onChange={(event) => setSelected({ ...selected, tags: event.target.value.split(",").map((tag) => tag.trim()) })} placeholder="regular, bridal, VIP" /></label><label>Internal notes<textarea value={selected.notes} onChange={(event) => setSelected({ ...selected, notes: event.target.value })} rows={4} maxLength={500} placeholder="Add your note" /><span className="client-field-hint">Internal only · {selected.notes.length}/500</span></label><label className="client-block-toggle"><input type="checkbox" checked={Boolean(selected.blocked)} onChange={(event) => setSelected({ ...selected, blocked: event.target.checked })} /><span><strong>Block online booking</strong><small>Prevent this customer from creating new public bookings.</small></span></label>{selected.id && <div className="client-contact-actions" aria-label="Contact client"><a href={`/appointments?client=${selected.id}`} aria-label="Appointment"><Calendar size={16} /><span>Appointment</span></a><a className={!selected.phone ? "is-disabled" : ""} href={selected.phone ? `sms:${selected.phone}` : undefined} aria-label="Message"><MessageCircle size={16} /><span>Message</span></a><a className={!selected.phone ? "is-disabled" : ""} href={selected.phone ? `tel:${selected.phone}` : undefined} aria-label="Call"><Phone size={16} /><span>Call</span></a><a className={!selected.email ? "is-disabled" : ""} href={selected.email ? `mailto:${selected.email}` : undefined} aria-label="Email"><Mail size={16} /><span>Email</span></a></div>}<section className="client-stats" aria-label="Client statistics"><div><strong>{selectedHistory.length}</strong><span>Visits</span></div><div><strong>{selectedSpend.toLocaleString("en-PH", { style: "currency", currency: "PHP" })}</strong><span>Lifetime spend</span></div><div><strong>{selectedHistory.map((item) => item.appointment_date).filter(Boolean).sort().at(-1) || "—"}</strong><span>Last visit</span></div><div><strong>{selectedHistory.map((item) => item.appointment_date).filter((value) => value >= new Date().toISOString().slice(0, 10)).sort()[0] || "—"}</strong><span>Next appointment</span></div></section><section className="client-history"><h3>Appointment history</h3>{selectedHistory.length ? selectedHistory.map((appointment) => <div key={appointment.id}><strong>{appointment.service_names}</strong><span>{appointment.appointment_date} · {appointment.appointment_time}</span></div>) : <p>No appointment history yet.</p>}</section></div><footer><button type="button" className="staff-secondary-button" onClick={() => setSelected(null)}>Cancel</button><button type="button" className="staff-primary-button" disabled={saving} onClick={() => void saveClient(selected)}>{saving ? "Saving…" : "Save client"}</button></footer></aside></div>}
  </div>
}
