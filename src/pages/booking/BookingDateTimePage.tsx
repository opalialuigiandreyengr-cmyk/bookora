import type { ReactNode } from "react"

type BookingDateTimePageProps = { children: ReactNode }

export function BookingDateTimePage({ children }: BookingDateTimePageProps) {
  return <div className="booking-route-page booking-date-time-page" data-booking-route="date-time">{children}</div>
}
