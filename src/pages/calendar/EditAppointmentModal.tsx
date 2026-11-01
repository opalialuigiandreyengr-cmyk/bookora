import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Clock3, FileText, Mail, Phone, UserRound, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CalendarAppointment, CalendarClientOption, CalendarServiceOption } from "./types"
import { SelectServiceModal } from "./SelectServiceModal"
import { SelectDateTimeModal } from "./SelectDateTimeModal"
import { SelectGuestModal } from "./SelectGuestModal"

export type AppointmentEditDraft = Pick<CalendarAppointment, "customer_name" | "customer_email" | "customer_phone" | "service_names" | "appointment_date" | "appointment_time" | "duration_minutes" | "total_price" | "customer_note" | "status">

type EditAppointmentModalProps = {
  appointment: CalendarAppointment
  services: CalendarServiceOption[]
  saving: boolean
  onClose: () => void
  onSave: (draft: AppointmentEditDraft) => void
  appointments: CalendarAppointment[]
  clients: CalendarClientOption[]
}

const dateLabel = (date: string) => {
  const parsed = new Date(`${date}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
}

export function EditAppointmentModal({ appointment, services, saving, onClose, onSave, appointments, clients }: EditAppointmentModalProps) {
  const firstFieldRef = useRef<HTMLButtonElement>(null)
  const [serviceOpen, setServiceOpen] = useState(false)
  const [dateTimeOpen, setDateTimeOpen] = useState(false)
  const [guestOpen, setGuestOpen] = useState(false)
  const [draft, setDraft] = useState<AppointmentEditDraft>({
    customer_name: appointment.customer_name,
    customer_email: appointment.customer_email,
    customer_phone: appointment.customer_phone,
    service_names: appointment.service_names,
    appointment_date: appointment.appointment_date,
    appointment_time: appointment.appointment_time,
    duration_minutes: appointment.duration_minutes,
    total_price: appointment.total_price,
    customer_note: appointment.customer_note || "",
    status: appointment.status,
  })

  useEffect(() => {
    firstFieldRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving && !serviceOpen && !dateTimeOpen) onClose() }
    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [onClose, saving, serviceOpen, dateTimeOpen])

  const update = (changes: Partial<AppointmentEditDraft>) => setDraft((current) => ({ ...current, ...changes }))
  const selectedService = services.find((service) => service.name === draft.service_names)

  return (
    <div className="edit-appointment-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) onClose() }}>
      <section className="edit-appointment-sheet" role="dialog" aria-modal="true" aria-labelledby="edit-appointment-title">
        <header className="edit-appointment-header">
          <button type="button" onClick={onClose} disabled={saving} aria-label="Back to appointment overview"><ChevronLeft size={22} /></button>
          <h2 id="edit-appointment-title">Edit appointment</h2>
          <span aria-hidden="true" />
        </header>
        <div className="edit-appointment-content">
          <button ref={firstFieldRef} type="button" className="edit-appointment-row" onClick={() => setServiceOpen(true)}>
            <span className="edit-appointment-row-icon"><Clock3 size={16} /></span>
            <span><small>Service</small><strong>{draft.service_names || "Select a service"}</strong><em>{selectedService ? `${selectedService.duration_minutes} mins · ${selectedService.price}` : `${draft.duration_minutes} mins · ${draft.total_price}`}</em></span>
            <ChevronRight size={18} />
          </button>
          <button type="button" className="edit-appointment-row edit-appointment-row-stack" onClick={() => setDateTimeOpen((open) => !open)}>
            <span className="edit-appointment-row-icon"><Clock3 size={16} /></span>
            <span><small>Date &amp; time</small><strong>{dateLabel(draft.appointment_date)}</strong><em>{draft.appointment_time}</em></span>
            <ChevronRight size={18} />
          </button>
          <button type="button" className="edit-appointment-row edit-appointment-guest-row" onClick={() => setGuestOpen(true)}>
            <span className="edit-appointment-row-icon"><UserRound size={16} /></span>
            <span><small>Guest</small><strong>{draft.customer_name}</strong><em><Mail size={12} /> {draft.customer_email || "No email"}</em><em><Phone size={12} /> {draft.customer_phone || "No phone"}</em></span>
            <ChevronRight size={18} />
          </button>
          <label className="edit-appointment-status"><span><Tag size={15} /> Label / status</span><select value={draft.status} onChange={(event) => update({ status: event.target.value as CalendarAppointment["status"] })}><option value="pending">Pending</option><option value="approved">Approved</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="no_show">No-show</option></select></label>
          {guestOpen && <div className="edit-appointment-edit-fields">
            <label>Client name<input value={draft.customer_name} onChange={(event) => update({ customer_name: event.target.value })} /></label>
            <label>Email<input type="email" value={draft.customer_email} onChange={(event) => update({ customer_email: event.target.value })} /></label>
            <label>Phone<input type="tel" value={draft.customer_phone} onChange={(event) => update({ customer_phone: event.target.value })} /></label>
            <label>Duration<input type="number" min="1" value={draft.duration_minutes} onChange={(event) => update({ duration_minutes: Number(event.target.value) || 1 })} /></label>
            <label>Price<input value={draft.total_price} onChange={(event) => update({ total_price: event.target.value })} /></label>
          </div>}
          <label className="edit-appointment-note"><span><FileText size={15} /> Client note</span><textarea rows={3} value={draft.customer_note} onChange={(event) => update({ customer_note: event.target.value })} placeholder="Add a note" /></label>
        </div>
        <footer className="edit-appointment-footer"><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="button" onClick={() => onSave(draft)} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button></footer>
      </section>
      {serviceOpen && <SelectServiceModal services={services} selectedName={draft.service_names} onClose={() => setServiceOpen(false)} onSelect={(service) => { update({ service_names: service.name, duration_minutes: service.duration_minutes, total_price: service.price }); setServiceOpen(false) }} />}
      {guestOpen && <SelectGuestModal clients={clients} selectedName={draft.customer_name} onClose={() => setGuestOpen(false)} onSelect={(client) => { update({ customer_name: client.full_name, customer_email: client.email, customer_phone: client.phone }); setGuestOpen(false) }} onAddNew={(client) => { update({ customer_name: client.full_name, customer_email: client.email, customer_phone: client.phone }); setGuestOpen(false) }} />}
      {dateTimeOpen && <SelectDateTimeModal date={draft.appointment_date} time={draft.appointment_time} appointments={appointments} appointmentId={appointment.id} durationMinutes={draft.duration_minutes} onClose={() => setDateTimeOpen(false)} onChange={(date, time) => update({ appointment_date: date, appointment_time: time })} />}
    </div>
  )
}
