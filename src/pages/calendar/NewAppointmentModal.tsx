import { FormEvent, useEffect, useState } from "react"
import { CalendarPlus, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CalendarServiceOption, toDateKey } from "./types"

interface NewAppointmentModalProps {
  open: boolean
  defaultDate?: string
  defaultTime?: string
  services: CalendarServiceOption[]
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
  onClose,
  onCreate,
}: NewAppointmentModalProps) {
  const [customerName, setCustomerName] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerNote, setCustomerNote] = useState("")
  const [selectedService, setSelectedService] = useState(services[0]?.name ?? "Gel Manicure")
  const [price, setPrice] = useState(services[0]?.price ?? "₱650")
  const [duration, setDuration] = useState(String(services[0]?.duration_minutes ?? 60))
  const [date, setDate] = useState(defaultDate || toDateKey(new Date()))
  const [time, setTime] = useState(defaultTime || "10:00 AM")
  const [saving, setSaving] = useState(false)

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

  if (!open) return null

  const handleServiceChange = (serviceName: string) => {
    setSelectedService(serviceName)
    const match = services.find((s) => s.name === serviceName)
    if (match) {
      setPrice(match.price)
      setDuration(String(match.duration_minutes || 60))
    }
  }

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
        service_names: selectedService.trim() || "Salon Service",
        total_price: price.trim() || "₱0",
        appointment_date: date,
        appointment_time: time,
        duration_minutes: Number(duration) || 60,
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

            <label className="cal-form-field">
              <span>Date *</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>

            <label className="cal-form-field">
              <span>Start Time *</span>
              <select value={time} onChange={(e) => setTime(e.target.value)}>
                {TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </label>

            <label className="cal-form-field">
              <span>Duration (mins)</span>
              <select value={duration} onChange={(e) => setDuration(e.target.value)}>
                <option value="30">30 mins</option>
                <option value="45">45 mins</option>
                <option value="60">60 mins</option>
                <option value="90">90 mins</option>
                <option value="120">120 mins</option>
              </select>
            </label>

            <label className="cal-form-field">
              <span>Total Price</span>
              <input
                type="text"
                placeholder="₱650"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>

            <label className="cal-form-field cal-field-full">
              <span>Notes (optional)</span>
              <textarea
                rows={2}
                placeholder="Shade preferences, nail art requests, or staff notes…"
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
              />
            </label>
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

