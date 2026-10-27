import { useEffect, useState } from "react"
import { Check, Loader2, Mail } from "lucide-react"

type BookingSuccessPageProps = {
  email: string
  businessName: string
  businessLocation: string
  selectedServiceLabel: string
  selectedDate: { day: string; month: string; date: string }
  time: string
  selectedPriceDisplay: string
  pegImage: string
  onBookAnother: () => void
}

export function BookingSuccessPage(props: BookingSuccessPageProps) {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 550)
    return () => window.clearTimeout(timer)
  }, [])

  if (loading) return <div className="booking-route-page booking-success-page booking-success-loading" data-booking-route="success" role="status" aria-label="Loading confirmation"><Loader2 size={28} className="animate-spin" /></div>

  return (
    <div className="booking-route-page booking-success-page" data-booking-route="success">
      <div className="booking-success">
        <div className="success-check"><Check size={28} /></div>
        <p className="booking-kicker">You’re all set</p>
        <h2>Appointment requested</h2>
        <p className="success-copy">We’ve sent a confirmation to <strong>{props.email}</strong>. {props.businessName} will review your requested services &amp; design peg and be in touch soon.</p>
        <div className="confirmed-card">
          <div className="confirmed-date"><span>{props.selectedDate.month}</span><strong>{props.selectedDate.date}</strong></div>
          <div>
            <strong>{props.selectedServiceLabel}</strong>
            <span>{props.selectedDate.day}, {props.selectedDate.month} {props.selectedDate.date} · {props.time}</span>
            <span>Estimated total: {props.selectedPriceDisplay} <small>(subject to design peg)</small></span>
            {props.pegImage && <div className="confirmed-peg-thumb"><img src={props.pegImage} alt="Design peg" /><span>Attached design peg</span></div>}
            <span>{props.businessName} · {props.businessLocation}</span>
          </div>
        </div>
        <button className="booking-secondary" type="button" onClick={props.onBookAnother}>Book another appointment</button>
        <p className="success-footer"><Mail size={15} /> Need to make a change or send your peg photos? Reply to your confirmation email.</p>
      </div>
    </div>
  )
}
