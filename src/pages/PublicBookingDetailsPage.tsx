import { useEffect, useMemo, useState } from "react"
import { CalendarDays, CheckCircle2, Clock3, Image as ImageIcon, Loader2, MapPin, ReceiptText, Scissors, X, XCircle } from "lucide-react"
import { supabase } from "@/lib/supabase"

type PublicBooking = {
  id: string
  business_id: string
  customer_name: string
  customer_email: string
  customer_phone: string
  customer_note: string | null
  service_names: string
  total_price: string
  appointment_date: string
  appointment_time: string
  duration_minutes: number | null
  status: string
  location_name: string | null
  meeting_url: string | null
  peg_image_path: string | null
  payment_receipt_path: string | null
  business_name: string
  business_logo_url: string | null
  business_location: string | null
  business_address: string | null
  business_country: string | null
  owner_name: string | null
}

const dateLabel = (value: string) => {
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)))
}

const timeToMinutes = (value: string) => {
  const match = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return -1
  let hour = Number(match[1]) % 12
  if (match[3].toUpperCase() === "PM") hour += 12
  return hour * 60 + Number(match[2])
}

const formatTime = (minutes: number) => {
  const hour = Math.floor(minutes / 60) % 24
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`
}

const cleanNote = (value?: string | null) => String(value || "")
  .replace(/\s*\[(?:Peg|Payment )?Storage Path:\s*[^\]]+\]/gi, "")
  .replace(/\s*\[(?:Paid in Full|Deposit):\s*[^\]]+\]/gi, "")
  .trim()

const isActive = (status: string) => !["cancelled", "completed", "no_show"].includes(status.toLowerCase())

export function PublicBookingDetailsPage({ bookingId }: { bookingId: string }) {
  const [booking, setBooking] = useState<PublicBooking | null>(null)
  const [attachmentUrls, setAttachmentUrls] = useState({ peg: "", receipt: "" })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [modal, setModal] = useState<"reschedule" | "cancel" | null>(null)
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [cancelText, setCancelText] = useState("")
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState("")

  const loadBooking = async () => {
    if (!supabase) { setError("Booking details are unavailable right now."); setLoading(false); return }
    const client = supabase
    setLoading(true)
    const result = await client.rpc("get_public_booking_details", { p_appointment_id: bookingId })
    const row = Array.isArray(result.data) ? result.data[0] : result.data
    if (result.error || !row) {
      setError(result.error?.message || "This booking link is no longer available.")
      setLoading(false)
      return
    }
    const nextBooking = row as PublicBooking
    setBooking(nextBooking)
    setDate(nextBooking.appointment_date)
    const start = timeToMinutes(nextBooking.appointment_time)
    setTime(start >= 0 ? `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}` : "")
    const resolve = async (path: string | null) => {
      if (!path) return ""
      if (/^(https?:\/\/|data:image\/)/i.test(path)) return path
      const signed = await client.storage.from("booking-attachments").createSignedUrl(path, 3600)
      return signed.data?.signedUrl || ""
    }
    const pegPath = nextBooking.peg_image_path || nextBooking.customer_note?.match(/\[Peg Storage Path:\s*([^\]]+)\]/i)?.[1] || ""
    const receiptPath = nextBooking.payment_receipt_path || nextBooking.customer_note?.match(/\[(?:Payment )?Receipt Storage Path:\s*([^\]]+)\]/i)?.[1] || ""
    const [peg, receipt] = await Promise.all([resolve(pegPath), resolve(receiptPath)])
    setAttachmentUrls({ peg, receipt })
    setLoading(false)
  }

  useEffect(() => { void loadBooking() }, [bookingId])

  const status = String(booking?.status || "pending").toLowerCase()
  const statusLabel = status === "approved" ? "Confirmed" : status === "cancelled" ? "Cancelled" : status === "completed" ? "Completed" : status === "no_show" ? "No-show" : "Pending"
  const durationLabel = booking?.duration_minutes ? `${booking.duration_minutes} mins` : "Duration not provided"
  const location = useMemo(() => [booking?.business_location, booking?.business_address, booking?.business_country].filter(Boolean).join(", "), [booking?.business_address, booking?.business_country, booking?.business_location])
  const note = cleanNote(booking?.customer_note)

  const closeModal = () => { if (!saving) { setModal(null); setCancelText("") } }

  const submitAction = async () => {
    if (!booking || saving || !supabase) return
    if (modal === "cancel" && cancelText.trim().toUpperCase() !== "YES") return
    setSaving(true)
    setNotice("")
    try {
      if (modal === "cancel") {
        const result = await supabase.rpc("cancel_public_appointment", { p_appointment_id: booking.id })
        if (result.error) throw new Error(result.error.message)
        await supabase.functions.invoke("send-appointment-update-email", { body: { businessId: booking.business_id, appointmentId: booking.id, eventType: "cancellation" } })
        setBooking((current) => current ? { ...current, status: "cancelled" } : current)
        setNotice("Your appointment was cancelled.")
      } else {
        if (!date || !time) throw new Error("Choose a date and time.")
        const timeValue = (() => { const [hour, minute] = time.split(":").map(Number); return `${String(hour % 12 || 12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}` })()
        const result = await supabase.rpc("reschedule_public_appointment", { p_appointment_id: booking.id, p_appointment_date: date, p_appointment_time: timeValue })
        if (result.error) throw new Error(result.error.message)
        await supabase.functions.invoke("send-appointment-update-email", { body: { businessId: booking.business_id, appointmentId: booking.id, eventType: "reschedule", appointmentDate: date, appointmentTime: timeValue } })
        setBooking((current) => current ? { ...current, appointment_date: date, appointment_time: timeValue } : current)
        setNotice("Your appointment was rescheduled.")
      }
      setModal(null)
      setCancelText("")
    } catch (actionError) {
      setNotice(actionError instanceof Error ? actionError.message : "We could not update this booking.")
    } finally { setSaving(false) }
  }

  if (loading) return <main className="public-booking-page" aria-busy="true"><Loader2 className="animate-spin" size={28} /><span>Loading booking details…</span></main>
  if (error || !booking) return <main className="public-booking-page"><section className="public-booking-state"><h1>Booking unavailable</h1><p>{error || "This booking link is no longer available."}</p><a href="/booking">Book a new appointment</a></section></main>

  return (
    <main className="public-booking-page">
      <div className="public-booking-shell">
        <header className="public-booking-header">
          <a href="/booking" className="public-booking-brand">{booking.business_logo_url ? <img src={booking.business_logo_url} alt="" /> : <span>{booking.business_name.charAt(0).toUpperCase()}</span>}<strong>{booking.business_name}</strong></a>
          <span className={`public-booking-status is-${status}`}>{statusLabel}</span>
        </header>
        <section className="public-booking-hero"><p>Appointment details</p><h1>Hello, {booking.customer_name}</h1><span>Booking ID: {booking.id}</span></section>
        <section className="public-booking-card" aria-label="Appointment details">
          <div className="public-booking-row"><span className="public-booking-icon"><Scissors size={17} /></span><div><small>Service</small><strong>{booking.service_names}</strong></div><b>{booking.total_price}</b></div>
          <div className="public-booking-row"><span className="public-booking-icon"><CalendarDays size={17} /></span><div><small>Date</small><strong>{dateLabel(booking.appointment_date)}</strong></div></div>
          <div className="public-booking-row"><span className="public-booking-icon"><Clock3 size={17} /></span><div><small>Time and duration</small><strong>{booking.appointment_time}</strong><span>{durationLabel}</span></div></div>
          {location && <div className="public-booking-row"><span className="public-booking-icon"><MapPin size={17} /></span><div><small>Location</small><strong>{location}</strong></div></div>}
          {note && <div className="public-booking-note"><small>Client note</small><p>{note}</p></div>}
          {(attachmentUrls.peg || attachmentUrls.receipt) && <div className="public-booking-attachments"><small>Attachments</small><div>{attachmentUrls.peg && <a href={attachmentUrls.peg} target="_blank" rel="noreferrer"><img src={attachmentUrls.peg} alt="Design peg" /><span><ImageIcon size={13} /> Design peg</span></a>}{attachmentUrls.receipt && <a href={attachmentUrls.receipt} target="_blank" rel="noreferrer"><img src={attachmentUrls.receipt} alt="Payment receipt" /><span><ReceiptText size={13} /> Payment receipt</span></a>}</div></div>}
        </section>
        {notice && <p className="public-booking-notice" role="status">{notice}</p>}
        {isActive(status) && <div className="public-booking-actions"><button type="button" onClick={() => setModal("reschedule")}><CalendarDays size={16} /> Reschedule</button><button type="button" className="is-danger" onClick={() => setModal("cancel")}><XCircle size={16} /> Cancel booking</button></div>}
        <footer className="public-booking-footer">Need help? Reply to your booking email.</footer>
      </div>

      {modal && <div className="public-booking-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal() }}><section className="public-booking-modal" role="dialog" aria-modal="true" aria-labelledby="public-booking-modal-title"><button type="button" className="public-booking-modal-close" onClick={closeModal} aria-label="Close"><X size={18} /></button><h2 id="public-booking-modal-title">{modal === "reschedule" ? "Reschedule appointment" : "Cancel appointment"}</h2>{modal === "reschedule" ? <div className="public-booking-modal-fields"><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Time<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label></div> : <label className="public-booking-confirm-label">Type YES to confirm<input autoFocus value={cancelText} onChange={(event) => setCancelText(event.target.value)} placeholder="YES" autoComplete="off" /></label>}<div className="public-booking-modal-actions"><button type="button" onClick={closeModal} disabled={saving}>No</button><button type="button" className={modal === "cancel" ? "is-danger" : ""} onClick={() => void submitAction()} disabled={saving || (modal === "cancel" && cancelText.trim().toUpperCase() !== "YES")}>{saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : "Yes"}</button></div></section></div>}
    </main>
  )
}
