import type { ReactNode } from "react"

type BookingDetailsPageProps = { children: ReactNode }

export function BookingDetailsPage({ children }: BookingDetailsPageProps) {
  return <div className="booking-route-page booking-details-page" data-booking-route="details">{children}</div>
}
