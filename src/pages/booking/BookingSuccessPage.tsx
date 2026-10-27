import type { ReactNode } from "react"

type BookingSuccessPageProps = { children: ReactNode }

export function BookingSuccessPage({ children }: BookingSuccessPageProps) {
  return <div className="booking-route-page booking-success-page" data-booking-route="success">{children}</div>
}
