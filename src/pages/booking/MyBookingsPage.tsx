import { CalendarDays, Check, ChevronLeft, Clock3, Image as ImageIcon, LogIn, ReceiptText } from "lucide-react"

export type CustomerBooking = {
  id: string
  customer_name: string
  customer_email: string
  service_names: string
  appointment_date: string
  appointment_time: string
  duration_minutes?: number | null
  total_price: string
  status: string
  customer_note?: string | null
  peg_image_url?: string | null
  payment_receipt_url?: string | null
  created_at: string
}

type MyBookingsPageProps = {
  businessName: string
  businessLocation: string
  businessLogo?: string | null
  customerEmail?: string | null
  bookings: CustomerBooking[]
  onBack: () => void
  onBookNew: () => void
  onSignIn: () => void
}

const cleanCustomerNote = (note?: string | null) => {
  if (!note) return ""
  return note
    .split(/\r?\n/)
    .filter((line) => !/^\[(?:Peg|Payment Receipt) (?:Reference|Storage) Path:/i.test(line.trim()))
    .filter((line) => !/^\[(?:Peg|Payment Receipt) Attached:/i.test(line.trim()))
    .join(" ")
    .trim()
}

const formatDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number)
  if (!year || !month || !day) return dateKey
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function MyBookingsPage({
  businessName,
  businessLocation,
  businessLogo,
  customerEmail,
  bookings,
  onBack,
  onBookNew,
  onSignIn,
}: MyBookingsPageProps) {
  return (
    <main className="customer-booking-page my-bookings-page">
      <header className="booking-header">
        <button type="button" className="booking-brand my-bookings-brand" onClick={onBack} aria-label={`Back to ${businessName} booking page`}>
          {businessLogo ? <img className="booking-brand-logo" src={businessLogo} alt="" /> : <span className="booking-brand-mark">{businessName.trim().charAt(0).toUpperCase() || "B"}</span>}
          <span>{businessName}</span>
        </button>
        <button type="button" className="booking-back my-bookings-back" onClick={onBack}>
          <ChevronLeft size={16} /> Back to booking
        </button>
      </header>

      <section className="my-bookings-content" aria-labelledby="my-bookings-title">
        <div className="my-bookings-heading">
          <div className="my-bookings-icon"><CalendarDays size={22} /></div>
          <p className="booking-kicker">Your appointments</p>
          <h1 id="my-bookings-title">My bookings</h1>
          <p>{customerEmail ? `Bookings for ${customerEmail}` : `Sign in to view your bookings at ${businessName}.`}</p>
        </div>

        {!customerEmail ? (
          <div className="my-bookings-empty">
            <LogIn size={24} />
            <h2>Sign in to view your bookings</h2>
            <p>Your appointments will be available here on any device when you sign in.</p>
            <button type="button" className="booking-primary" onClick={onSignIn}>Sign in to continue</button>
          </div>
        ) : bookings.length ? (
          <div className="my-bookings-list" aria-label="Your appointments">
            {bookings.map((booking) => {
              const note = cleanCustomerNote(booking.customer_note)
              const isConfirmed = ["confirmed", "approved"].includes(String(booking.status).toLowerCase())
              return (
                <article className="booking-item-card my-booking-card" key={booking.id}>
                  <div className="booking-item-top">
                    <span className={`booking-status-tag ${isConfirmed ? "confirmed" : "pending"}`}>
                      <Check size={11} /> {booking.status || "Pending"}
                    </span>
                    <strong className="my-booking-price">{booking.total_price}</strong>
                  </div>
                  <h2 className="booking-item-services">{booking.service_names}</h2>
                  <div className="booking-item-meta">
                    <span><CalendarDays size={13} /> {formatDate(booking.appointment_date)}</span>
                    <span><Clock3 size={13} /> {booking.appointment_time}</span>
                  </div>
                  <p className="my-booking-location">{businessName}{businessLocation ? ` · ${businessLocation}` : ""}</p>
                  {note && <p className="my-booking-note">{note}</p>}
                  {(booking.peg_image_url || booking.payment_receipt_url) && (
                    <div className="my-booking-attachments">
                      {booking.peg_image_url && <a href={booking.peg_image_url} target="_blank" rel="noreferrer"><img src={booking.peg_image_url} alt="Attached design peg" /><span><ImageIcon size={12} /> Design peg</span></a>}
                      {booking.payment_receipt_url && <a href={booking.payment_receipt_url} target="_blank" rel="noreferrer"><img src={booking.payment_receipt_url} alt="Attached payment receipt" /><span><ReceiptText size={12} /> Payment receipt</span></a>}
                    </div>
                  )}
                  <p className="my-booking-id">Booking ID: {booking.id}</p>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="my-bookings-empty">
            <CalendarDays size={24} />
            <h2>No appointments found</h2>
            <p>You haven’t booked any appointments yet under this account.</p>
            <button type="button" className="booking-primary" onClick={onBookNew}>Book an appointment</button>
          </div>
        )}
      </section>

      <footer className="booking-footer">
        <span className="booking-footer-brand">Powered by <strong>bookora</strong></span>
      </footer>
    </main>
  )
}
