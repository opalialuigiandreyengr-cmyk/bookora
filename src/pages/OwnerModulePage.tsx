import type { User } from "@supabase/supabase-js"
import { useState } from "react"
import { ArrowRight, CheckCircle2, Construction, Sparkles } from "lucide-react"
import { OwnerSidebar, OwnerMobileMenuButton } from "@/components/owner/OwnerSidebar"
import { getOwnerRoute, type OwnerRouteKey } from "@/lib/ownerNavigation"

type OwnerModulePageProps = {
  user: User
  active: OwnerRouteKey
  onSignOut: () => void
}

const moduleCopy: Record<Exclude<OwnerRouteKey, "Overview" | "Calendar" | "Services" | "Settings" | "Notifications" | "Reports" | "Integrations" | "Packages" | "Advanced Scheduling">, { title: string; description: string; next: string[] }> = {
  Appointments: {
    title: "Appointments",
    description: "A focused list for confirming, rescheduling, completing, and exporting every booking.",
    next: ["Date, staff, service, status, and payment filters", "Reschedule and cancellation workflow", "Bulk actions and export"],
  },
  Clients: {
    title: "Clients",
    description: "A client workspace for contact details, appointment history, notes, tags, and lifetime value.",
    next: ["Searchable client directory", "Client profile and appointment timeline", "Internal notes and customer tags"],
  },
  Staff: {
    title: "Staff",
    description: "Invite your team, assign services, set availability, and control what each person can access.",
    next: ["Staff profiles and invitations", "Working hours and time off", "Owner, manager, staff, and limited-access roles"],
  },
  Payments: {
    title: "Payments",
    description: "A complete ledger for deposits, balances, refunds, receipts, and payment status by appointment.",
    next: ["Transaction history and filters", "Deposit and balance tracking", "Refunds and CSV export"],
  },
  Webhooks: {
    title: "Webhooks",
    description: "Configure signed outbound appointment events for automation tools and custom workflows.",
    next: ["HTTPS endpoint configuration", "HMAC signature verification", "Delivery retries and history"],
  },
  "Booking Page": {
    title: "Booking Page",
    description: "Share and refine the customer-facing page where clients discover your services and book online.",
    next: ["Public booking link", "Customer-facing preview", "Branding and booking controls"],
  },
  Memberships: {
    title: "Memberships",
    description: "Create loyalty plans, enroll clients, and track points earned through repeat visits.",
    next: ["Membership plan catalog", "Client enrollment", "Loyalty point balances"],
  },
  "Block Time": {
    title: "Block Time",
    description: "Protect breaks, personal commitments, and private events from public booking availability.",
    next: ["Owner-managed unavailable periods", "Personal event notes", "Availability conflict prevention"],
  },
}

export function OwnerModulePage({ user, active, onSignOut: _onSignOut }: OwnerModulePageProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const route = getOwnerRoute(window.location.pathname)
  const copy = moduleCopy[active as keyof typeof moduleCopy]
  const navigate = (path: string) => {
    window.location.assign(path)
  }

  return <div className="dashboard-shell owner-module-shell">
    <OwnerSidebar user={user} active={active} open={sidebarOpen} onClose={() => setSidebarOpen(false)} onNavigate={navigate} />
    <div className="dashboard-content">
      <header className="dashboard-header">
        <OwnerMobileMenuButton onOpen={() => setSidebarOpen(true)} />
        <div className="dashboard-header-context"><span>{route.label}</span><small>Owner workspace</small></div>
        <div className="dashboard-header-actions"><span className="user-avatar">{String(user.user_metadata?.full_name ?? "Owner").slice(0, 2).toUpperCase()}</span></div>
      </header>
      <main className="dashboard-main owner-module-main">
        <div className="owner-module-hero">
          <div>
            <p className="dashboard-kicker">Phase 0 foundation</p>
            <h1>{copy.title}</h1>
            <p>{copy.description}</p>
          </div>
          <span className="owner-module-icon"><Construction /></span>
        </div>
        <section className="owner-module-card" aria-labelledby="module-status-title">
          <div className="owner-module-card-heading">
            <div><span className="owner-module-eyebrow"><Sparkles /> Planned owner workflow</span><h2 id="module-status-title">This module is now a real destination.</h2></div>
            <span className="owner-module-badge">Building next</span>
          </div>
          <p className="owner-module-card-copy">The route is intentionally explicit while the data workflow is being built. You will no longer be silently returned to Overview when selecting this area.</p>
          <ul className="owner-module-checklist">{copy.next.map((item) => <li key={item}><CheckCircle2 /> <span>{item}</span></li>)}</ul>
          <button className="owner-module-action" type="button" onClick={() => navigate("/dashboard")}>Back to overview <ArrowRight /></button>
        </section>
      </main>
    </div>
  </div>
}
