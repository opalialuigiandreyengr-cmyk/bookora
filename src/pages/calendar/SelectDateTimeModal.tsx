import { Check, ChevronLeft, ChevronRight } from "lucide-react"
import { useMemo, useState } from "react"
import type { CalendarAppointment } from "./types"
import { parseTimeToMinutes, toDateKey as currentDateKey } from "./types"

type SelectDateTimeModalProps = {
  date: string
  time: string
  onChange: (date: string, time: string) => void
  onClose: () => void
  appointments: CalendarAppointment[]
  appointmentId: string
  durationMinutes: number
}

const TIME_SLOTS = ["8:00 AM", "8:30 AM", "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM", "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM", "5:00 PM", "5:30 PM", "6:00 PM", "6:30 PM", "7:00 PM"]

export function SelectDateTimeModal({ date, time, onChange, onClose, appointments, appointmentId, durationMinutes }: SelectDateTimeModalProps) {
  const selectedDate = new Date(`${date}T00:00:00`)
  const todayKey = currentDateKey(new Date())
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  const calendarDays = useMemo(() => {
    const year = visibleMonth.getFullYear()
    const month = visibleMonth.getMonth()
    const firstDay = (new Date(year, month, 1).getDay() + 6) % 7
    const dayCount = new Date(year, month + 1, 0).getDate()
    return Array.from({ length: firstDay + dayCount }, (_, index) => index < firstDay ? null : index - firstDay + 1)
  }, [visibleMonth])
  const toDateKey = (day: number) => `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  const monthLabel = visibleMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  const availableSlots = useMemo(() => {
    const now = new Date()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const booked = appointments.filter((item) => item.id !== appointmentId && item.appointment_date === date && !["cancelled", "no_show"].includes(item.status))
    return TIME_SLOTS.filter((slot) => {
      if (date === todayKey && parseTimeToMinutes(slot) <= nowMinutes) return false
      const slotStart = parseTimeToMinutes(slot)
      const slotEnd = slotStart + durationMinutes
      return !booked.some((item) => {
        const bookedStart = parseTimeToMinutes(item.appointment_time)
        const bookedEnd = bookedStart + (item.duration_minutes || 30)
        return slotStart < bookedEnd && slotEnd > bookedStart
      })
    })
  }, [appointments, appointmentId, date, durationMinutes, todayKey])

  return (
    <div className="edit-datetime-backdrop" role="presentation">
      <section className="edit-datetime-sheet" role="dialog" aria-modal="true" aria-labelledby="select-datetime-title">
        <header className="edit-datetime-header">
          <button type="button" onClick={onClose} aria-label="Back to edit appointment"><ChevronLeft size={22} /></button>
          <h2 id="select-datetime-title">Select date &amp; time</h2>
          <span aria-hidden="true" />
        </header>
        <div className="edit-datetime-content">
          <div className="edit-datetime-date"><div className="edit-calendar"><div className="edit-calendar-toolbar"><button type="button" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={16} /></button><strong>{monthLabel}</strong><button type="button" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={16} /></button></div><div className="edit-calendar-weekdays">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div><div className="edit-calendar-grid">{calendarDays.map((day, index) => { if (!day) return <span key={index} />; const dayKey = toDateKey(day); const disabled = dayKey < todayKey; return <button key={index} type="button" disabled={disabled} className={`${date === dayKey ? "is-selected" : ""}${disabled ? " is-disabled" : ""}`} onClick={() => onChange(dayKey, time)}>{day}</button> })}</div></div></div>
          <div className="edit-datetime-times" role="listbox" aria-label="Available start times">
            {availableSlots.length ? availableSlots.map((slot) => <button key={slot} type="button" role="option" aria-selected={time === slot} className={time === slot ? "is-selected" : ""} onClick={() => onChange(date, slot)}>{slot}{time === slot && <Check size={14} />}</button>) : <p className="edit-datetime-empty">No available times for this date.</p>}
          </div>
        </div>
        <footer className="edit-datetime-footer"><button type="button" onClick={onClose}>Done</button></footer>
      </section>
    </div>
  )
}
