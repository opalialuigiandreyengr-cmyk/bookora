import { lazy, Suspense, useEffect, useRef, useState } from "react"
import type { User } from "@supabase/supabase-js"
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((module) => ({ default: module.DashboardPage })))
const ServicesPage = lazy(() => import("@/pages/ServicesPage").then((module) => ({ default: module.ServicesPage })))
const CalendarPage = lazy(() => import("@/pages/CalendarPage").then((module) => ({ default: module.CalendarPage })))
import { LandingPage } from "@/pages/LandingPage"
import { SignupPage } from "@/pages/SignupPage"
import { OnboardingPage } from "@/pages/OnboardingPage"
import { PasskeyModal } from "@/pages/PasskeyModal"
import { hasSupabaseConfig, supabase } from "@/lib/supabase"
import { ToastViewport, showToast } from "@/components/ui/toast"
const CustomerBookingPage = lazy(() => import("@/pages/CustomerBookingPage").then((module) => ({ default: module.CustomerBookingPage })))
const OwnerModulePage = lazy(() => import("@/pages/OwnerModulePage").then((module) => ({ default: module.OwnerModulePage })))
const StaffPage = lazy(() => import("@/pages/StaffPage").then((module) => ({ default: module.StaffPage })))
const AppointmentsPage = lazy(() => import("@/pages/AppointmentsWorkspacePage").then((module) => ({ default: module.AppointmentsWorkspacePage })))
const ClientsPage = lazy(() => import("@/pages/ClientsPage").then((module) => ({ default: module.ClientsPage })))
const PaymentsPage = lazy(() => import("@/pages/PaymentsPage").then((module) => ({ default: module.PaymentsPage })))
const NotificationsPage = lazy(() => import("@/pages/NotificationsPage").then((module) => ({ default: module.NotificationsPage })))
const ReportsPage = lazy(() => import("@/pages/ReportsPage").then((module) => ({ default: module.ReportsPage })))
const IntegrationsPage = lazy(() => import("@/pages/IntegrationsPage").then((module) => ({ default: module.IntegrationsPage })))
const WebhookSettingsPage = lazy(() => import("@/pages/WebhookSettingsPage").then((module) => ({ default: module.WebhookSettingsPage })))
const PackagesPage = lazy(() => import("@/pages/PackagesPage").then((module) => ({ default: module.PackagesPage })))
const AdvancedSchedulingPage = lazy(() => import("@/pages/AdvancedSchedulingPage").then((module) => ({ default: module.AdvancedSchedulingPage })))
const MembershipsPage = lazy(() => import("@/pages/MembershipsPage").then((module) => ({ default: module.MembershipsPage })))
const BlockTimePage = lazy(() => import("@/pages/BlockTimePage").then((module) => ({ default: module.BlockTimePage })))
const StaffWorkspacePage = lazy(() => import("@/pages/StaffWorkspacePage").then((module) => ({ default: module.StaffWorkspacePage })))
import { isOwnerRoute, getOwnerRoute } from "@/lib/ownerNavigation"
import { getCrossSubdomainCookie, clearCrossSubdomainCookie } from "@/lib/domain"

function WorkspaceLoadingSkeleton({ label = "Loading Bookora…" }: { label?: string }) {
  return <div className="app-loading-skeleton" role="status" aria-label={label}>
    <span className="sr-only">{label}</span>
    <div className="app-loading-topbar"><i className="skeleton-block app-loading-menu" /><i className="skeleton-block app-loading-title" /><i className="skeleton-block app-loading-avatar" /></div>
    <main className="app-loading-content">
      <div className="skeleton-block app-loading-kicker" />
      <div className="skeleton-block app-loading-heading" />
      <div className="app-loading-actions"><i className="skeleton-block" /><i className="skeleton-block" /></div>
      <div className="app-loading-metrics"><i className="skeleton-block" /><i className="skeleton-block" /><i className="skeleton-block" /></div>
      <div className="skeleton-block app-loading-panel" />
      <div className="skeleton-block app-loading-panel app-loading-panel-short" />
    </main>
  </div>
}

function AppContent() {
  const hostname = window.location.hostname
  const pathname = window.location.pathname
  const isPublicBookingHost = [".bookora.com", ".bookoraph.com"].some((suffix) => hostname.endsWith(suffix)) && !hostname.startsWith("www.")
  const isCustomerBooking =
    pathname === "/booking" ||
    pathname === "/book" ||
    pathname === "/bookings" ||
    pathname.startsWith("/book/") ||
    pathname.startsWith("/booking/") ||
    pathname.startsWith("/bookings/") ||
    isPublicBookingHost

  const [user, setUser] = useState<User | null>(null)
  const [onboardingDone, setOnboardingDone] = useState(false)
  const [staffContext, setStaffContext] = useState<{ business_id: string; staff_member_id: string; role: string } | null>(null)
  const [staffContextLoading, setStaffContextLoading] = useState(false)
  const [showPasskey, setShowPasskey] = useState(false)
  const welcomeToastUserId = useRef<string | null>(null)

  const isRootDomain = ["bookoraph.com", "www.bookoraph.com", "bookora.com", "www.bookora.com"].includes(hostname)
  const cookieSlug = getCrossSubdomainCookie("bookora_client_slug")
  // A shared subdomain cookie may be left by a previous client session. It
  // must never turn a root-domain business login into a client redirect.
  const clientSlug = isRootDomain ? user?.user_metadata?.client_slug : (user?.user_metadata?.client_slug || cookieSlug)
  const isClient = Boolean(
    !isRootDomain && (
      user?.user_metadata?.account_type === "client" ||
      user?.user_metadata?.role === "client" ||
      clientSlug
    )
  )

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""))
    const oauthError = searchParams.get("error_description") || hashParams.get("error_description") || searchParams.get("error") || hashParams.get("error")
    if (oauthError) {
      showToast(decodeURIComponent(oauthError.replace(/\+/g, " ")), "error")
      const cleanUrl = new URL(window.location.href)
      cleanUrl.hash = ""
      cleanUrl.searchParams.delete("error")
      cleanUrl.searchParams.delete("error_code")
      cleanUrl.searchParams.delete("error_description")
      window.history.replaceState({}, document.title, cleanUrl.toString())
    }

    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      const nextUser = data.session?.user ?? null
      setUser(nextUser)
      setOnboardingDone(Boolean(nextUser?.user_metadata?.onboarding_complete))
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user ?? null
      setUser(nextUser)
      setOnboardingDone(Boolean(nextUser?.user_metadata?.onboarding_complete))
      if (event === "SIGNED_IN" && nextUser) {
        if (welcomeToastUserId.current !== nextUser.id) {
          welcomeToastUserId.current = nextUser.id
          const name = String(nextUser.user_metadata?.full_name ?? nextUser.email?.split("@")[0] ?? "there")
          showToast(`Welcome back, ${name}!`)
        }
      } else if (event === "SIGNED_OUT") {
        welcomeToastUserId.current = null
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (isCustomerBooking) return
    if (!user) return
    const returnUrl = getCrossSubdomainCookie("bookora_client_return")

    if (isClient) {
      if (returnUrl) {
        clearCrossSubdomainCookie("bookora_client_return")
        window.location.replace(returnUrl)
        return
      }
      if (isRootDomain && clientSlug) {
        const rootDomain = hostname.includes("bookoraph.com") ? "bookoraph.com" : "bookora.com"
        window.location.replace(`https://${clientSlug}.${rootDomain}/`)
        return
      }
      // Clients should never be redirected to business onboarding or salon dashboard
      const internalBusinessRoutes = ["/dashboard", "/onboarding", "/services", "/calendar", "/settings", "/appointments", "/clients", "/staff", "/payments", "/reports", "/notifications", "/integrations", "/integrations/webhooks", "/packages", "/advanced-scheduling", "/block-time", "/memberships"]
      if (internalBusinessRoutes.includes(window.location.pathname)) {
        const destination = clientSlug ? `/book?slug=${encodeURIComponent(clientSlug)}` : "/book"
        window.history.replaceState({}, "", destination)
        window.location.href = destination
      }
      return
    }
    const destination = onboardingDone
      ? isOwnerRoute(window.location.pathname)
        ? window.location.pathname
        : "/dashboard"
      : "/onboarding"
    if (window.location.pathname !== destination) window.history.replaceState({}, "", destination)
  }, [user, onboardingDone, isClient, clientSlug, hostname])

  useEffect(() => {
    if (isCustomerBooking || !user || !supabase || user.id === "preview-user-123") return
    let active = true
    const client = supabase
    const loadStaffContext = async () => {
      setStaffContextLoading(true)
      await client.rpc("claim_staff_membership")
      const result = await client.rpc("get_my_staff_context")
      if (!active) return
      const context = Array.isArray(result.data) ? result.data[0] : null
      setStaffContext(context?.business_id && context?.staff_member_id ? { business_id: String(context.business_id), staff_member_id: String(context.staff_member_id), role: String(context.role || "staff") } : null)
      setStaffContextLoading(false)
    }
    void loadStaffContext()
    return () => { active = false }
  }, [isCustomerBooking, user?.id])

  if (isCustomerBooking) return <><ToastViewport /><CustomerBookingPage /></>

  // If user is a verified client from a custom slug business
  if (user && isClient) {
    if (isRootDomain && clientSlug) {
      const rootDomain = hostname.includes("bookoraph.com") ? "bookoraph.com" : "bookora.com"
      window.location.replace(`https://${clientSlug}.${rootDomain}/`)
      return null
    }

    const destination = clientSlug ? `/book?slug=${encodeURIComponent(clientSlug)}` : "/book"
    if (["/dashboard", "/onboarding", "/services", "/calendar", "/settings", "/appointments", "/clients", "/staff", "/payments", "/reports", "/notifications", "/integrations", "/integrations/webhooks", "/packages", "/advanced-scheduling", "/block-time", "/memberships"].includes(pathname)) {
      window.location.replace(destination)
      return null
    }
    if (["/signup", "/login", "/register", "/get-started", "/auth"].includes(pathname)) {
      return <><ToastViewport /><SignupPage /></>
    }
    return <><ToastViewport /><LandingPage clientUser={user} /></>
  }

  if (user && staffContextLoading) return <><ToastViewport /><WorkspaceLoadingSkeleton label="Loading your workspace…" /></>
  if (user && staffContext) return <><ToastViewport /><StaffWorkspacePage user={user} businessId={staffContext.business_id} role={staffContext.role} /></>
  if (user && !onboardingDone) return <><ToastViewport /><OnboardingPage user={user} onComplete={() => { setOnboardingDone(true); if (localStorage.getItem("bookora-passkey-prompted") !== "true") setShowPasskey(true) }} /></>
  if (user && onboardingDone) {
    const handleSignOut = async () => {
      await supabase?.auth.signOut()
      window.history.replaceState({}, "", "/")
    }
    if (window.location.pathname === "/reports") return <><ToastViewport /><ReportsPage user={user} onSignOut={handleSignOut} /></>
    if (window.location.pathname === "/appointments") return <><ToastViewport /><AppointmentsPage user={user} onSignOut={handleSignOut} /></>
    if (window.location.pathname === "/clients") return <><ToastViewport /><ClientsPage user={user} onSignOut={handleSignOut} /></>
    if (window.location.pathname === "/payments") return <><ToastViewport /><PaymentsPage user={user} onSignOut={handleSignOut} /></>
    if (window.location.pathname === "/notifications") return <><ToastViewport /><NotificationsPage user={user} onSignOut={handleSignOut} /></>
    if (window.location.pathname === "/integrations") return <><ToastViewport /><IntegrationsPage user={user} onSignOut={handleSignOut} /></>
    if (window.location.pathname === "/integrations/webhooks") return <><ToastViewport /><WebhookSettingsPage user={user} onSignOut={handleSignOut} /></>
    if (window.location.pathname === "/packages") return <><ToastViewport /><PackagesPage user={user} onSignOut={handleSignOut} /></>
    if (window.location.pathname === "/advanced-scheduling") return <><ToastViewport /><AdvancedSchedulingPage user={user} onSignOut={handleSignOut} /></>
    if (window.location.pathname === "/memberships") return <><ToastViewport /><MembershipsPage user={user} onSignOut={handleSignOut} /></>
    if (window.location.pathname === "/block-time") return <><ToastViewport /><BlockTimePage user={user} onSignOut={handleSignOut} /></>
    if (window.location.pathname === "/staff") return <><ToastViewport /><StaffPage user={user} onSignOut={handleSignOut} /></>
    return (
      <>
        <ToastViewport />
        {window.location.pathname === "/services" ? (
          <ServicesPage user={user} onSignOut={handleSignOut} />
        ) : window.location.pathname === "/calendar" ? (
          <CalendarPage user={user} onSignOut={handleSignOut} />
        ) : (
          <>
            <DashboardPage user={user} onSignOut={handleSignOut} />
            {showPasskey && (
              <PasskeyModal
                onClose={(dontAskAgain) => {
                  if (dontAskAgain) localStorage.setItem("bookora-passkey-prompted", "true")
                  setShowPasskey(false)
                }}
              />
            )}
          </>
        )}
      </>
    )
  }

  const isPreviewPath = isOwnerRoute(window.location.pathname) || window.location.search.includes("demo=true")
  if (isPreviewPath) {
    const previewUser: User = {
      id: "preview-user-123",
      app_metadata: { provider: "email" },
      user_metadata: {
        full_name: "Luigi Opalia",
        business_name: "Glow Hair & Beauty Studio",
        onboarding_complete: true,
      },
      aud: "authenticated",
      created_at: new Date().toISOString(),
      email: "luigi@bookora.com",
    }
    const handlePreviewSignOut = () => {
      window.history.replaceState({}, "", "/")
      window.location.href = "/"
    }
    return (
      <>
        <ToastViewport />
        {window.location.pathname === "/reports" ? (
          <ReportsPage user={previewUser} onSignOut={handlePreviewSignOut} />
        ) : window.location.pathname === "/appointments" ? (
          <AppointmentsPage user={previewUser} onSignOut={handlePreviewSignOut} />
        ) : window.location.pathname === "/clients" ? (
          <ClientsPage user={previewUser} onSignOut={handlePreviewSignOut} />
        ) : window.location.pathname === "/payments" ? (
          <PaymentsPage user={previewUser} onSignOut={handlePreviewSignOut} />
        ) : window.location.pathname === "/notifications" ? (
          <NotificationsPage user={previewUser} onSignOut={handlePreviewSignOut} />
        ) : window.location.pathname === "/integrations" ? (
          <IntegrationsPage user={previewUser} onSignOut={handlePreviewSignOut} />
        ) : window.location.pathname === "/integrations/webhooks" ? (
          <WebhookSettingsPage user={previewUser} onSignOut={handlePreviewSignOut} />
        ) : window.location.pathname === "/packages" ? (
          <PackagesPage user={previewUser} onSignOut={handlePreviewSignOut} />
        ) : window.location.pathname === "/advanced-scheduling" ? (
          <AdvancedSchedulingPage user={previewUser} onSignOut={handlePreviewSignOut} />
        ) : window.location.pathname === "/memberships" ? (
          <MembershipsPage user={previewUser} onSignOut={handlePreviewSignOut} />
        ) : window.location.pathname === "/block-time" ? (
          <BlockTimePage user={previewUser} onSignOut={handlePreviewSignOut} />
        ) : window.location.pathname === "/staff" ? (
          <StaffPage user={previewUser} onSignOut={handlePreviewSignOut} />
        ) : window.location.pathname === "/services" ? (
          <ServicesPage user={previewUser} onSignOut={handlePreviewSignOut} />
        ) : window.location.pathname === "/calendar" ? (
          <CalendarPage user={previewUser} onSignOut={handlePreviewSignOut} />
        ) : (
          <DashboardPage user={previewUser} onSignOut={handlePreviewSignOut} />
        )}
      </>
    )
  }

  if (["/signup", "/login", "/register", "/get-started", "/auth"].includes(pathname)) {
    return <><ToastViewport /><SignupPage /></>
  }

  return <><ToastViewport /><LandingPage /></>
}

export default function App() {
  return <Suspense fallback={<WorkspaceLoadingSkeleton />}><AppContent /></Suspense>
}

export { hasSupabaseConfig }
