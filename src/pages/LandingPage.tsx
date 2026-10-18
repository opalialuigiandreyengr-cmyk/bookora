import { FormEvent, useEffect, useState } from "react"
import { ArrowRight, BarChart3, Bell, CalendarDays, Check, CirclePlay, CreditCard, Eye, EyeOff, Globe2, Home, ListChecks, LockKeyhole, Mail, Menu, Scissors, Settings2, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { hasSupabaseConfig, supabase } from "@/lib/supabase"
import { Logo } from "@/components/brand/Logo"
import { MarketingSections } from "@/components/marketing/MarketingSections"
import { LoginModal } from "@/pages/LoginModal"
import { signInWithGoogle } from "@/lib/googleAuth"

const features = [[CalendarDays, "Online Booking", "Let clients book 24/7 from any device."], [Users, "Manage Staff", "Set schedules, assign services and track availability."], [ListChecks, "Custom Services", "Add services, prices, duration and packages."], [CreditCard, "Accept Payments", "In-salon or online payments, all in one place."], [Bell, "Automated Reminders", "Reduce no-shows with email and SMS reminders."], [BarChart3, "Reports & Growth", "Track bookings, revenue and your best services."]] as const

function AuthCard({ mode, setMode }: { mode: "signup" | "login"; setMode: (m: "signup" | "login") => void }) {
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle")
  const [message, setMessage] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const isLogin = mode === "login"

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) {
      setStatus("error")
      setMessage("Connect Supabase first by adding your environment variables.")
      return
    }
    const form = new FormData(event.currentTarget)
    const email = String(form.get("email") ?? "").trim()
    const password = String(form.get("password") ?? "")

    setStatus("loading")
    setMessage("")

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        setStatus("error")
        setMessage(error.message)
      } else {
        setStatus("success")
        setMessage("Signed in successfully! Loading your workspace…")
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/onboarding` },
      })
      if (error) {
        setStatus("error")
        setMessage(error.message)
      } else {
        setStatus("success")
        setMessage(data.session ? "Your account is ready." : "Check your email to confirm your account.")
      }
    }
  }

  const oauth = async (provider: "google" | "apple") => {
    if (!supabase) {
      setStatus("error")
      setMessage("Connect Supabase first by adding your environment variables.")
      return
    }
    setStatus("loading")
    if (provider === "google") {
      try {
        await signInWithGoogle()
        setStatus("success")
        setMessage("Signed in successfully! Loading your workspace…")
      } catch (error) {
        setStatus("error")
        setMessage(error instanceof Error ? error.message : "Google sign-in failed.")
      }
      return
    }
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/dashboard` } })
    if (error) {
      setStatus("error")
      setMessage(error.message)
    }
  }

  return (
    <Card className="signup-card" id="signup">
      <div className="auth-card-pills" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={!isLogin}
          className={`auth-card-pill ${!isLogin ? "active" : ""}`}
          onClick={() => { setMode("signup"); setMessage(""); setStatus("idle") }}
        >
          Create account
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isLogin}
          className={`auth-card-pill ${isLogin ? "active" : ""}`}
          onClick={() => { setMode("login"); setMessage(""); setStatus("idle") }}
        >
          Log in
        </button>
      </div>

      <CardHeader>
        <CardTitle>{isLogin ? "Welcome back" : "Create your account"}</CardTitle>
        <CardDescription>
          {isLogin ? "Sign in to manage your appointments and salon." : "Start accepting bookings in minutes."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field className="icon-field">
              <FieldLabel htmlFor="hero-email">Email address</FieldLabel>
              <div className="input-shell">
                <Mail aria-hidden="true" />
                <Input id="hero-email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
              </div>
            </Field>
            <Field className="icon-field">
              <FieldLabel htmlFor="hero-password">Password</FieldLabel>
              <div className="input-shell">
                <LockKeyhole aria-hidden="true" />
                <Input
                  id="hero-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={isLogin ? "Enter your password" : "At least 8 characters"}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  minLength={isLogin ? 1 : 8}
                  required
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </Field>
          </FieldGroup>
          <Button className="wide-button" size="lg" type="submit" disabled={status === "loading"}>
            {status === "loading" ? (isLogin ? "Signing in…" : "Creating account…") : (isLogin ? "Sign in to account" : "Create free account")}
          </Button>
          {(status === "error" || status === "success") && (
            <p className={status === "error" ? "auth-error" : "auth-note"} role={status === "error" ? "alert" : "status"}>
              {message}
            </p>
          )}
          <div className="or-row"><Separator /><span>or continue with</span><Separator /></div>
          <div className="social-buttons">
            <Button variant="outline" type="button" onClick={() => oauth("google")} disabled={status === "loading"}>
              <img className="social-logo" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" /> Continue with Google
            </Button>
            <Button variant="outline" type="button" onClick={() => oauth("apple")} disabled={status === "loading"}>
              <img className="social-logo" src="https://cdn.simpleicons.org/apple/111827" alt="" /> Continue with Apple
            </Button>
          </div>

          <div className="auth-card-footer-switch">
            {isLogin ? (
              <p>
                Don’t have an account yet?{" "}
                <button type="button" className="auth-switch-link" onClick={() => { setMode("signup"); setMessage(""); setStatus("idle") }}>
                  Create free account
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{" "}
                <button type="button" className="auth-switch-link" onClick={() => { setMode("login"); setMessage(""); setStatus("idle") }}>
                  Log in here
                </button>
              </p>
            )}
          </div>

          {!isLogin && (
            <p className="terms">By creating an account, you agree to our <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy.</a></p>
          )}
          {!hasSupabaseConfig && <p className="auth-note">OAuth is ready once Supabase environment variables are added.</p>}
        </form>
      </CardContent>
    </Card>
  )
}

const previewAppointments = [
  { className: "lilac", name: "Mia Santos", service: "Hair color", time: "9:00", style: { left: "1%", top: "14px" } },
  { className: "peach", name: "Ava Lim", service: "Gel manicure", time: "10:30", style: { left: "21%", top: "65px" } },
  { className: "blue", name: "Sofia Cruz", service: "Haircut", time: "11:00", style: { left: "41%", top: "88px" } },
  { className: "mint", name: "Nina Reyes", service: "Facial", time: "1:30", style: { left: "61%", top: "145px" } },
  { className: "rose", name: "Ella Tan", service: "Brow styling", time: "2:00", style: { left: "81%", top: "169px" } },
]

function ProductPreview() {
  const days = [["Mon", "14"], ["Tue", "15"], ["Wed", "16"], ["Thu", "17"], ["Fri", "18"]]
  return (
    <div className="product-wrap" aria-hidden="true">
      <div className="app-window">
        <aside className="app-sidebar" aria-hidden="true">
          <Logo compact />
          <span><Home /> Overview</span>
          <span className="active"><CalendarDays /> Calendar</span>
          <span><Users /> Clients</span>
          <span><Scissors /> Services</span>
          <span><Settings2 /> Settings</span>
        </aside>
        <div className="calendar-app">
          <div className="app-topbar">
            <div><small>This week</small><strong>April 14–18, 2025</strong></div>
            <div className="calendar-controls"><span>Week</span><span className="new-appointment">+ New appointment</span></div>
          </div>
          <div className="calendar-head">{days.map(([day, date]) => <span className={date === "16" ? "today" : ""} key={date}><small>{day}</small><strong>{date}</strong></span>)}</div>
          <div className="calendar-grid">{previewAppointments.map((appointment) => <div className={`appointment ${appointment.className}`} style={appointment.style} key={appointment.name}><span className="avatar">{appointment.name.split(" ").map((part) => part[0]).join("")}</span><span><b>{appointment.name}</b><small>{appointment.time} · {appointment.service}</small></span></div>)}</div>
        </div>
      </div>
    </div>
  )
}

function FeatureModal({ feature, onClose }: { feature: typeof features[number]; onClose: () => void }) {
  const [Icon, title, copy] = feature

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  return <div className="feature-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}><section className="feature-modal" role="dialog" aria-modal="true" aria-labelledby="feature-modal-title"><button className="feature-modal-close" type="button" aria-label="Close feature details" onClick={onClose}><X /></button><span className="feature-modal-icon"><Icon /></span><p className="eyebrow">Bookora feature</p><h2 id="feature-modal-title">{title}</h2><p>{copy}</p><p>Keep this part of your business organized in one calm workspace, so you can spend less time on admin and more time with clients.</p><Button asChild><a href="#signup" onClick={onClose}>Get started free <ArrowRight /></a></Button></section></div>
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeFeature, setActiveFeature] = useState<typeof features[number] | null>(null)
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup")

  const openLogin = () => {
    setLoginModalOpen(true)
    setMenuOpen(false)
  }

  const handleSwitchToSignup = () => {
    setAuthMode("signup")
    const cardEl = document.getElementById("signup")
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: "smooth" })
    }
  }

  return (
    <main id="top">
      <header className="site-header">
        <Logo />
        <nav className={menuOpen ? "open" : ""}>
          <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
          <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
          <a href="#solutions" onClick={() => setMenuOpen(false)}>Solutions</a>
          <a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
          <button type="button" className="mobile-nav-login" onClick={openLogin}>
            Log in to account
          </button>
        </nav>
        <div className="header-actions">
          <button className="language"><Globe2 /> EN</button>
          <Button className="header-login" variant="outline" onClick={openLogin}>
            Log in
          </Button>
          <Button className="header-start-button" asChild>
            <a href="#signup" onClick={() => setAuthMode("signup")}>
              <span className="desktop-cta-label">Get started free</span>
              <span className="mobile-cta-label">Start free</span>
            </a>
          </Button>
        </div>
        <Button
          className="menu-button"
          size="icon"
          variant="ghost"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          {menuOpen ? <X /> : <Menu />}
        </Button>
      </header>

      <section className="hero-shell">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">All-in-one booking platform <span>for salons</span></p>
            <h1>Appointments<br />made <span>simple</span>.</h1>
            <p className="hero-lede">
              Let your clients book online anytime. Manage your schedule, services, staff and payments — all in one place.
            </p>
            <div className="hero-actions">
              <Button size="lg" asChild>
                <a href="#signup" onClick={() => setAuthMode("signup")}>Get started free <ArrowRight /></a>
              </Button>
              <Button size="lg" variant="outline"><CirclePlay /> Watch demo</Button>
            </div>
            <div className="trust-row">
              {["No credit card required", "Set up in minutes", "Cancel anytime"].map((item) => (
                <span key={item}><Check /> {item}</span>
              ))}
            </div>
          </div>
          <ProductPreview />
          <AuthCard mode={authMode} setMode={setAuthMode} />
        </div>
      </section>

      <section className="feature-strip" id="features">
        {features.map((feature) => {
          const [Icon, title, copy] = feature
          return (
            <article key={title as string}>
              <button
                type="button"
                className="feature-icon"
                aria-label={`Learn more about ${title}`}
                onClick={() => setActiveFeature(feature)}
              >
                <Icon />
              </button>
              <h3>{title as string}</h3>
              <p>{copy as string}</p>
            </article>
          )
        })}
      </section>

      <MarketingSections />

      {activeFeature && <FeatureModal feature={activeFeature} onClose={() => setActiveFeature(null)} />}

      {loginModalOpen && (
        <LoginModal
          onClose={() => setLoginModalOpen(false)}
          onSwitchToSignup={handleSwitchToSignup}
        />
      )}
    </main>
  )
}
