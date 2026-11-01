import { useEffect, useRef } from "react"
import { ChevronLeft } from "lucide-react"

export type EditableClient = {
  id: string
  full_name: string
  email: string
  phone: string
  notes: string
  tags: string[]
  blocked?: boolean
  created_at?: string
}

type EditClientPageProps = {
  client: EditableClient
  isNew?: boolean
  saving: boolean
  onChange: (client: EditableClient) => void
  onClose: () => void
  onSave: () => void
}

const initialsFor = (name: string) => name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?"

export function EditClientPage({ client, isNew = false, saving, onChange, onClose, onSave }: EditClientPageProps) {
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const onCloseRef = useRef(onClose)
  const savingRef = useRef(saving)
  onCloseRef.current = onClose
  savingRef.current = saving

  useEffect(() => {
    firstFieldRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !savingRef.current) onCloseRef.current() }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  const update = (changes: Partial<EditableClient>) => onChange({ ...client, ...changes })

  return (
    <div className="edit-client-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
      <section className="edit-client-sheet" role="dialog" aria-modal="true" aria-labelledby="edit-client-title">
        <header className="edit-client-header">
          <button type="button" className="edit-client-back" onClick={onClose} aria-label="Back to client details" disabled={saving}>
            <ChevronLeft size={22} />
          </button>
          <h2 id="edit-client-title">{isNew ? "Add client" : "Edit client"}</h2>
          <span className="edit-client-header-spacer" aria-hidden="true" />
        </header>

        <div className="edit-client-content">
          <div className="edit-client-identity">
            <span className="edit-client-avatar" aria-hidden="true">{initialsFor(client.full_name)}</span>
            <div><strong>{client.full_name || "New client"}</strong><span>Client details</span></div>
          </div>

          <form className="edit-client-form" onSubmit={(event) => { event.preventDefault(); onSave() }}>
            <label className={`edit-client-floating-field ${client.full_name ? "has-value" : ""}`}>
              <span>Full name</span>
              <input ref={firstFieldRef} value={client.full_name} onChange={(event) => update({ full_name: event.target.value })} aria-label="Full name" maxLength={100} required />
            </label>
            <label className={`edit-client-floating-field ${client.phone ? "has-value" : ""}`}>
              <span>Phone number</span>
              <input type="tel" value={client.phone} onChange={(event) => update({ phone: event.target.value })} aria-label="Phone number" maxLength={40} />
            </label>
            <label className={`edit-client-floating-field ${client.email ? "has-value" : ""}`}>
              <span>Email</span>
              <input type="email" value={client.email} disabled={!isNew} onChange={(event) => update({ email: event.target.value })} aria-label="Email" aria-describedby={!isNew ? "edit-client-email-note" : undefined} />
              {!isNew && <small id="edit-client-email-note">Email is managed from the client account.</small>}
            </label>
            <label className={`edit-client-floating-field ${client.tags.length ? "has-value" : ""}`}>
              <span>Tags</span>
              <input value={client.tags.join(", ")} onChange={(event) => update({ tags: event.target.value.split(",").map((tag) => tag.trim()) })} aria-label="Tags" />
            </label>
            <label className={`edit-client-floating-field edit-client-textarea-field ${client.notes ? "has-value" : ""}`}>
              <span>Internal notes</span>
              <textarea value={client.notes} onChange={(event) => update({ notes: event.target.value })} rows={4} maxLength={500} aria-label="Internal notes" />
              <small>Internal only · {client.notes.length}/500</small>
            </label>
            <label className="edit-client-toggle">
              <input type="checkbox" checked={Boolean(client.blocked)} onChange={(event) => update({ blocked: event.target.checked })} />
              <span><strong>Block online booking</strong><small>Prevent this client from creating new public bookings.</small></span>
            </label>
          </form>
        </div>

        <footer className="edit-client-footer">
          <button type="button" className="staff-secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="staff-primary-button" onClick={onSave} disabled={saving}>{saving ? "Saving…" : isNew ? "Add client" : "Save changes"}</button>
        </footer>
      </section>
    </div>
  )
}
