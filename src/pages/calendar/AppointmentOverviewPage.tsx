import { forwardRef, type ReactNode } from "react"

type AppointmentOverviewPageProps = {
  titleId: string
  children: ReactNode
}

export const AppointmentOverviewPage = forwardRef<HTMLElement, AppointmentOverviewPageProps>(function AppointmentOverviewPage({ titleId, children }, ref) {
  return <aside ref={ref} className="cal-drawer cal-drawer-overview-page" role="dialog" aria-modal="true" aria-labelledby={titleId}>{children}</aside>
})
