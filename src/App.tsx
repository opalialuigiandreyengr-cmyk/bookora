import { useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { DashboardPage } from "@/pages/DashboardPage"
import { LandingPage } from "@/pages/LandingPage"
import { OnboardingPage } from "@/pages/OnboardingPage"
import { PasskeyModal } from "@/pages/PasskeyModal"
import { hasSupabaseConfig, supabase } from "@/lib/supabase"

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [onboardingDone, setOnboardingDone] = useState(false)
  const [showPasskey, setShowPasskey] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { const nextUser = data.session?.user ?? null; setUser(nextUser); setOnboardingDone(Boolean(nextUser?.user_metadata?.onboarding_complete)) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { const nextUser = session?.user ?? null; setUser(nextUser); setOnboardingDone(Boolean(nextUser?.user_metadata?.onboarding_complete)) })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    const destination = onboardingDone ? "/dashboard" : "/onboarding"
    if (window.location.pathname !== destination) window.history.replaceState({}, "", destination)
  }, [user, onboardingDone])

  if (user && !onboardingDone) return <OnboardingPage user={user} onComplete={() => { setOnboardingDone(true); if (localStorage.getItem("bookora-passkey-prompted") !== "true") setShowPasskey(true) }} />
  if (user && onboardingDone) return <><DashboardPage user={user} onSignOut={async () => { await supabase?.auth.signOut(); window.history.replaceState({}, "", "/") }} />{showPasskey && <PasskeyModal onClose={(dontAskAgain) => { if (dontAskAgain) localStorage.setItem("bookora-passkey-prompted", "true"); setShowPasskey(false) }} />}</>
  return <LandingPage />
}

export { hasSupabaseConfig }
