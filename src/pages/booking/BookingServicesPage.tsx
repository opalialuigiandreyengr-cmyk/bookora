import type { ReactNode } from "react"

type BookingServicesPageProps = { children: ReactNode }

export function BookingServicesPage({ children }: BookingServicesPageProps) {
  return <div className="booking-route-page booking-services-page" data-booking-route="services">{children}</div>
}
