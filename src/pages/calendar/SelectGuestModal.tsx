import { Check, ChevronLeft, Mail, Phone, Plus, UserRound } from "lucide-react"
import { useState } from "react"
import type { CalendarClientOption } from "./types"

type SelectGuestModalProps = {
  clients: CalendarClientOption[]
  selectedName: string
  onSelect: (client: CalendarClientOption) => void
  onAddNew: (client: CalendarClientOption) => void
  onClose: () => void
}

export function SelectGuestModal({ clients, selectedName, onSelect, onAddNew, onClose }: SelectGuestModalProps) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ full_name: "", email: "", phone: "" })
  const saveNew = () => { if (!draft.full_name.trim()) return; onAddNew({ id: `new-client-${Date.now()}`, full_name: draft.full_name.trim(), email: draft.email.trim(), phone: draft.phone.trim() }) }
  return <div className="edit-service-backdrop" role="presentation">
    <section className="edit-service-sheet edit-guest-sheet" role="dialog" aria-modal="true" aria-labelledby="select-guest-title">
      <header className="edit-service-header"><button type="button" onClick={onClose} aria-label="Back to edit appointment"><ChevronLeft size={22} /></button><h2 id="select-guest-title">Select guest</h2><span aria-hidden="true" /></header>
      <div className="edit-service-list">
        <button type="button" className="edit-guest-add" onClick={() => setAdding(true)}><Plus size={16} /> Add new customer</button>
        {adding && <div className="edit-guest-new-form"><label>Full name<input autoFocus value={draft.full_name} onChange={(event) => setDraft({ ...draft, full_name: event.target.value })} /></label><label>Email<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label><label>Phone<input type="tel" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label><button type="button" className="edit-guest-save" disabled={!draft.full_name.trim()} onClick={saveNew}>Use this customer</button></div>}
        {clients.length === 0 ? <p className="edit-service-empty">No saved customers yet.</p> : clients.map((client) => <button className={`edit-service-option ${selectedName === client.full_name ? "is-selected" : ""}`} type="button" key={client.id} onClick={() => onSelect(client)}><span className="edit-service-option-copy"><strong><UserRound size={14} /> {client.full_name}</strong><small>{client.email && <><Mail size={12} /> {client.email}</>} {client.phone && <><Phone size={12} /> {client.phone}</>}</small></span><span className="edit-service-check">{selectedName === client.full_name && <Check size={16} />}</span></button>)}
      </div>
    </section>
  </div>
}
