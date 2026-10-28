import { useEffect, useRef, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { DashboardPage } from "@/pages/DashboardPage"
import { ServicesPage } from "@/pages/ServicesPage"
import { LandingPage } from "@/pages/LandingPage"
import { SignupPage } from "@/pages/SignupPage"
import { OnboardingPage } from "@/pages/OnboardingPage"
import { PasskeyModal } from "@/pages/PasskeyModal"
import { hasSupabaseConfig, supabase } from "@/lib/supabase"
import { ToastViewport, showToast } from "@/components/ui/toast"
import { CustomerBookingPage } from "@/pages/CustomerBookingPage"
import { getCrossSubdomainCookie, clearCrossSubdomainCookie } from "@/lib/domain"

export default function App() {
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
  if (isCustomerBooking) return <><ToastViewport /><CustomerBookingPage /></>

  const [user, setUser] = useState<User | null>(null)
  const [onboardingDone, setOnboardingDone] = useState(false)
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
      const internalBusinessRoutes = ["/dashboard", "/onboarding", "/services", "/settings"]
      if (internalBusinessRoutes.includes(window.location.pathname)) {
        const destination = clientSlug ? `/book?slug=${encodeURIComponent(clientSlug)}` : "/book"
        window.history.replaceState({}, "", destination)
        window.location.href = destination
      }
      return
    }
    const destination = onboardingDone ? (window.location.pathname === "/services" ? "/services" : "/dashboard") : "/onboarding"
    if (window.location.pathname !== destination) window.history.replaceState({}, "", destination)
  }, [user, onboardingDone, isClient, clientSlug, hostname])

  // If user is a verified client from a custom slug business
  if (user && isClient) {
    if (isRootDomain && clientSlug) {
      const rootDomain = hostname.includes("bookoraph.com") ? "bookoraph.com" : "bookora.com"
      window.location.replace(`https://${clientSlug}.${rootDomain}/`)
      return null
    }

    const destination = clientSlug ? `/book?slug=${encodeURIComponent(clientSlug)}` : "/book"
    if (["/dashboard", "/onboarding", "/services", "/settings"].includes(pathname)) {
      window.location.replace(destination)
      return null
    }
    if (["/signup", "/register", "/get-started", "/auth"].includes(pathname)) {
      return <><ToastViewport /><SignupPage /></>
    }
    return <><ToastViewport /><LandingPage clientUser={user} /></>
  }

  if (user && !onboardingDone) return <><ToastViewport /><OnboardingPage user={user} onComplete={() => { setOnboardingDone(true); if (localStorage.getItem("bookora-passkey-prompted") !== "true") setShowPasskey(true) }} /></>
  if (user && onboardingDone) return <><ToastViewport />{window.location.pathname === "/services" ? <ServicesPage user={user} onSignOut={async () => { await supabase?.auth.signOut(); window.history.replaceState({}, "", "/") }} /> : <><DashboardPage user={user} onSignOut={async () => { await supabase?.auth.signOut(); window.history.replaceState({}, "", "/") }} />{showPasskey && <PasskeyModal onClose={(dontAskAgain) => { if (dontAskAgain) localStorage.setItem("bookora-passkey-prompted", "true"); setShowPasskey(false) }} />}</>}</>

  const isPreviewPath = window.location.pathname === "/dashboard" || window.location.pathname === "/settings" || window.location.pathname === "/services" || window.location.search.includes("demo=true")
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
    return <><ToastViewport />{window.location.pathname === "/services" ? <ServicesPage user={previewUser} onSignOut={() => { window.history.replaceState({}, "", "/"); window.location.href = "/" }} /> : <DashboardPage user={previewUser} onSignOut={() => { window.history.replaceState({}, "", "/"); window.location.href = "/" }} />}</>
  }

  if (["/signup", "/register", "/get-started", "/auth"].includes(pathname)) {
    return <><ToastViewport /><SignupPage /></>
  }

  return <><ToastViewport /><LandingPage /></>
}

export { hasSupabaseConfig }
