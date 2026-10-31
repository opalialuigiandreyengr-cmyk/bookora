import { FormEvent, useEffect, useState } from "react"
import { CalendarPlus, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CalendarServiceOption, CalendarStaffOption, toDateKey } from "./types"

interface NewAppointmentModalProps {
  open: boolean
  defaultDate?: string
  defaultTime?: string
  services: CalendarServiceOption[]
  staff: CalendarStaffOption[]
  onClose: () => void
  onCreate: (payload: {
    customer_name: string
    customer_email: string
    customer_phone: string
    customer_note: string
    service_names: string
    total_price: string
    appointment_date: string
    appointment_time: string
    duration_minutes: number
    staff_member_id: string | null
    location_name: string
    meeting_url: string
    recurrence_rule: "none" | "weekly" | "biweekly"
    recurrence_count: number
  }) => Promise<void>
}

const TIME_SLOTS = [
  "8:00 AM",
  "8:30 AM",
  "9:00 AM",
  "9:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "12:00 PM",
  "12:30 PM",
  "1:00 PM",
  "1:30 PM",
  "2:00 PM",
  "2:30 PM",
  "3:00 PM",
  "3:30 PM",
  "4:00 PM",
  "4:30 PM",
  "5:00 PM",
  "5:30 PM",
  "6:00 PM",
  "6:30 PM",
  "7:00 PM",
]

export function NewAppointmentModal({
  open,
  defaultDate,
  defaultTime,
  services,
  staff,
  onClose,
  onCreate,
}: NewAppointmentModalProps) {
  const [customerName, setCustomerName] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerNote, setCustomerNote] = useState("")
  const [selectedService, setSelectedService] = useState(services[0]?.name ?? "Gel Manicure")
  const [additionalServiceNames, setAdditionalServiceNames] = useState<string[]>([])
  const [price, setPrice] = useState(services[0]?.price ?? "₱650")
  const [duration, setDuration] = useState(String(services[0]?.duration_minutes ?? 60))
  const [date, setDate] = useState(defaultDate || toDateKey(new Date()))
  const [time, setTime] = useState(defaultTime || "10:00 AM")
  const [saving, setSaving] = useState(false)
  const [staffMemberId, setStaffMemberId] = useState(staff[0]?.id ?? "")
  const [recurrenceRule, setRecurrenceRule] = useState<"none" | "weekly" | "biweekly">("none")
  const [recurrenceCount, setRecurrenceCount] = useState("4")

  useEffect(() => {
    if (defaultDate) setDate(defaultDate)
    if (defaultTime) setTime(defaultTime)
  }, [defaultDate, defaultTime, open])

  useEffect(() => {
    if (services.length > 0 && !services.some((s) => s.name === selectedService)) {
      setSelectedService(services[0].name)
      setPrice(services[0].price)
      setDuration(String(services[0].duration_minutes || 60))
    }
  }, [services, selectedService])

  useEffect(() => {
    // This workspace currently has one owner/team member. Keep the assignment
    // implicit so the appointment cannot accidentally be left unassigned.
    if (staff.length > 0) setStaffMemberId(staff[0].id)
  }, [staff, open])

  if (!open) return null

  const handleServiceChange = (serviceName: string) => {
    setSelectedService(serviceName)
    const match = services.find((s) => s.name === serviceName)
    if (match) {
      setPrice(match.price)
      setDuration(String(match.duration_minutes || 60))
    }
  }

  const selectedServiceOptions = services.filter((service) => service.name === selectedService || additionalServiceNames.includes(service.name))
  const combinedDuration = selectedServiceOptions.reduce((sum, service) => sum + (service.duration_minutes || 0), 0) || Number(duration) || 60
  const combinedPrice = selectedServiceOptions.reduce((sum, service) => sum + (Number(service.price.replace(/[^0-9.-]/g, "")) || 0), 0)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!customerName.trim()) return
    setSaving(true)
    try {
      await onCreate({
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim() || "walkin@client.local",
        customer_phone: customerPhone.trim() || "Walk-in",
        customer_note: customerNote.trim(),
        service_names: selectedServiceOptions.map((service) => service.name).join(" + ") || selectedService.trim() || "Salon Service",
        total_price: selectedServiceOptions.length > 1 && combinedPrice > 0 ? `₱${combinedPrice.toLocaleString("en-PH")}` : price.trim() || "₱0",
        appointment_date: date,
        appointment_time: time,
        duration_minutes: combinedDuration,
        staff_member_id: staffMemberId || null,
        location_name: "",
        meeting_url: "",
        recurrence_rule: recurrenceRule,
        recurrence_count: recurrenceRule === "none" ? 1 : Number(recurrenceCount) || 2,
      })
      setCustomerName("")
      setCustomerEmail("")
      setCustomerPhone("")
      setCustomerNote("")
      onClose()
    } catch {
      // Parent already shows an error toast; keep the form open so nothing is lost
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="cal-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !saving) onClose()
      }}
    >
      <div className="cal-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="new-appt-title">
        <header className="cal-modal-header">
          <div className="cal-modal-title-row">
            <span className="cal-modal-icon">
              <CalendarPlus size={20} />
            </span>
            <div>
              <h2 id="new-appt-title">New Appointment</h2>
              <p>Schedule a client booking directly on your calendar.</p>
            </div>
          </div>
          <button type="button" className="cal-drawer-close" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </header>

        <form className="cal-modal-form" onSubmit={handleSubmit}>
          <div className="cal-form-grid">
            <label className="cal-form-field cal-field-full">
              <span>Client full name *</span>
              <input
                type="text"
                placeholder="e.g. Camille Santos"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
              />
            </label>

            <label className="cal-form-field">
              <span>Phone number</span>
              <input
                type="tel"
                placeholder="e.g. +63 917 123 4567"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </label>

            <label className="cal-form-field">
              <span>Email address</span>
              <input
                type="email"
                placeholder="client@example.com"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </label>

            <label className="cal-form-field cal-field-full">
              <span>Service</span>
              {services.length > 0 ? (
                <select value={selectedService} onChange={(e) => handleServiceChange(e.target.value)}>
                  {services.map((service) => (
                    <option key={service.name} value={service.name}>
                      {service.name} ({service.duration_minutes} mins · {service.price})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="e.g. Softgel Extension"
                  value={selectedService}
                  onChange={(e) => setSelectedService(e.target.value)}
                  required
                />
              )}
            </label>

            {services.length > 1 && <fieldset className="cal-form-field cal-field-full cal-additional-services"><legend>Additional services <small>Select any extras</small></legend><div>{services.filter((service) => service.name !== selectedService).map((service) => <label className={additionalServiceNames.includes(service.name) ? "is-selected" : ""} key={service.name}><input type="checkbox" checked={additionalServiceNames.includes(service.name)} onChange={(event) => setAdditionalServiceNames((current) => event.target.checked ? [...current, service.name] : current.filter((name) => name !== service.name))} /><span><strong>{service.name}</strong><small>{service.duration_minutes} mins · {service.price}</small></span></label>)}</div></fieldset>}

            <label className="cal-form-field cal-date-field">
              <span>Date *</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>

            <label className="cal-form-field cal-time-field">
              <span>Start Time *</span>
              <select value={time} onChange={(e) => setTime(e.target.value)}>
                {TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </label>

            <label className="cal-form-field cal-duration-field">
              <span>Duration</span>
              <input value={`${combinedDuration} mins`} readOnly aria-readonly="true" />
            </label>

            <label className="cal-form-field cal-price-field">
              <span>Total Price</span>
              <input
                type="text"
                placeholder="₱650"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>

            {staff[0] && <div className="cal-form-field cal-owner-field"><span>Assigned staff</span><div className="cal-owner-value">{staff[0].full_name}<small>Owner</small></div></div>}

            <label className="cal-form-field cal-field-full">
              <span>Notes (optional)</span>
              <textarea
                rows={2}
                placeholder="Shade preferences, nail art requests, or staff notes…"
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
              />
            </label>
            <label className="cal-form-field">
              <span>Repeat</span>
              <select value={recurrenceRule} onChange={(e) => setRecurrenceRule(e.target.value as typeof recurrenceRule)}><option value="none">Does not repeat</option><option value="weekly">Every week</option><option value="biweekly">Every 2 weeks</option></select>
            </label>
            {recurrenceRule !== "none" && <label className="cal-form-field"><span>Occurrences</span><select value={recurrenceCount} onChange={(e) => setRecurrenceCount(e.target.value)}>{[2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count} appointments</option>)}</select></label>}
          </div>

          <footer className="cal-modal-actions">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving…
                </>
              ) : (
                "Save Appointment"
              )}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  )
}
