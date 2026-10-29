import { ArrowRight, Menu, Store } from "lucide-react"
import type { User } from "@supabase/supabase-js"
import { Logo } from "@/components/brand/Logo"
import { getOwnerRoute, soloOwnerRoutes, type OwnerRouteKey } from "@/lib/ownerNavigation"

type OwnerSidebarProps = {
  user: User
  active?: OwnerRouteKey
  open?: boolean
  onClose?: () => void
  onNavigate: (path: string) => void
}

export function OwnerSidebar({ user, active, open = false, onClose, onNavigate }: OwnerSidebarProps) {
  const name = String(user.user_metadata?.business_name ?? "Your business")
  const current = active ?? getOwnerRoute(window.location.pathname).key

  return <>
    {open && <button className="dashboard-scrim" aria-label="Close navigation" onClick={onClose} />}
    <aside className={`dashboard-sidebar ${open ? "open" : ""}`}>
      <div className="dashboard-brand"><Logo /></div>
      <div className="workspace-switcher">
        <span className="workspace-avatar"><Store /></span>
        <span><strong>{name}</strong><small>Solo salon</small></span>
      </div>
      <nav className="dashboard-nav" aria-label="Owner workspace">
        <p className="dashboard-nav-label">Workspace</p>
        {soloOwnerRoutes.map((route) => {
          const Icon = route.icon
          return <button
            key={route.key}
            className={current === route.key ? "active" : ""}
            aria-current={current === route.key ? "page" : undefined}
            onClick={() => { onClose?.(); onNavigate(route.path) }}
          >
            <Icon />
            <span>{route.label}</span>
          </button>
        })}
      </nav>
      <div className="dashboard-sidebar-bottom">
        <div className="help-card">
          <strong>Need a hand?</strong>
          <span>Our team is here to help you get set up.</span>
          <button type="button">Visit Help Center <ArrowRight /></button>
        </div>
      </div>
    </aside>
  </>
}

export function OwnerMobileMenuButton({ onOpen }: { onOpen: () => void }) {
  return <button className="dashboard-menu" aria-label="Open navigation" onClick={onOpen}><Menu /></button>
}
