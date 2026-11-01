import { Check, ChevronLeft, Clock3, Tag } from "lucide-react"
import type { CalendarServiceOption } from "./types"

type SelectServiceModalProps = {
  services: CalendarServiceOption[]
  selectedName: string
  onSelect: (service: CalendarServiceOption) => void
  onClose: () => void
}

export function SelectServiceModal({ services, selectedName, onSelect, onClose }: SelectServiceModalProps) {
  return (
    <div className="edit-service-backdrop" role="presentation">
      <section className="edit-service-sheet" role="dialog" aria-modal="true" aria-labelledby="select-service-title">
        <header className="edit-service-header">
          <button type="button" onClick={onClose} aria-label="Back to edit appointment"><ChevronLeft size={22} /></button>
          <h2 id="select-service-title">Select a service</h2>
          <span aria-hidden="true" />
        </header>
        <div className="edit-service-list">
          {services.length === 0 ? <p className="edit-service-empty">No services available yet.</p> : services.map((service) => {
            const selected = service.name === selectedName
            return <button className={`edit-service-option ${selected ? "is-selected" : ""}`} type="button" key={service.id || service.name} onClick={() => onSelect(service)}>
              <span className="edit-service-option-copy"><strong>{service.name}</strong><small><Clock3 size={12} /> {service.duration_minutes} mins <Tag size={12} /> {service.price}</small></span>
              <span className="edit-service-check" aria-hidden="true">{selected && <Check size={16} />}</span>
            </button>
          })}
        </div>
      </section>
    </div>
  )
}
