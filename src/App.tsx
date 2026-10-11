import { FormEvent, useEffect, useState } from "react"
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronDown,
  CirclePlay,
  CreditCard,
  EyeOff,
  Fingerprint,
  Globe2,
  Home,
  ListChecks,
  LockKeyhole,
  Mail,
  Menu,
  Plus,
  Search,
  Store,
  ShieldCheck,
  Settings2,
  Scissors,
  Users,
  X,
  Zap,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { hasSupabaseConfig, supabase } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"

const features = [
  { icon: CalendarDays, title: "Online Booking", copy: "Let clients book 24/7 from any device." },
  { icon: Users, title: "Manage Staff", copy: "Set schedules, assign services and track availability." },
  { icon: ListChecks, title: "Custom Services", copy: "Add services, prices, duration and packages." },
  { icon: CreditCard, title: "Accept Payments", copy: "In-salon or online payments, all in one place." },
  { icon: Bell, title: "Automated Reminders", copy: "Reduce no-shows with email and SMS reminders." },
  { icon: BarChart3, title: "Reports & Growth", copy: "Track bookings, revenue and your best services." },
]

const businesses = [
  { label: "Nail Salon", image: "https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=700&q=85" },
  { label: "Hair Salon", image: "https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=700&q=85" },
  { label: "Barbershop", image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=700&q=85" },
  { label: "Facial & Spa", image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=700&q=85" },
  { label: "Makeup Studio", image: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=700&q=85" },
  { label: "Beauty Clinic", image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=700&q=85" },
]

const appointments = [
  { name: "Anna Reyes", service: "Hair Treatment", time: "9:00 – 10:00", day: 0, top: 52, tone: "lilac" },
  { name: "Liza Gomez", service: "Gel Manicure", time: "10:30 – 11:30", day: 0, top: 100, tone: "peach" },
  { name: "Maria Cruz", service: "Facial", time: "1:00 – 2:00", day: 0, top: 170, tone: "lilac" },
  { name: "John Tan", service: "Haircut", time: "3:00 – 4:00", day: 0, top: 240, tone: "blue" },
  { name: "Bea Santos", service: "Nail Art", time: "9:30 – 10:30", day: 2, top: 70, tone: "lilac" },
  { name: "Carlo Dela Cruz", service: "Massage", time: "11:00 – 12:00", day: 2, top: 120, tone: "mint" },
  { name: "Joyce Lim", service: "Hair Color", time: "2:00 – 3:00", day: 2, top: 210, tone: "rose" },
]

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <a href="#top" className="brand" aria-label="Bookora home">
      <span className="brand-mark" aria-hidden="true"><span>B</span></span>
      {!compact && <span className="brand-name">Book<span>ora</span></span>}
    </a>
  )
}

function ProductMockup() {
  return (
    <div className="product-wrap" aria-label="Bookora appointment calendar preview">
      <div className="app-window">
        <aside className="app-sidebar">
          <Logo compact />
          {["Dashboard", "Calendar", "Appointments", "Clients", "Services", "Staff", "Payments", "Reports", "Settings"].map((item) => (
            <span className={item === "Calendar" ? "active" : ""} key={item}>{item}</span>
          ))}
        </aside>
        <div className="calendar-app">
          <div className="app-topbar">
            <strong>April 2025</strong>
            <span>Day&nbsp;&nbsp; <b>Week</b>&nbsp;&nbsp; Month</span>
            <span className="new-appointment">+ New Appointment</span>
          </div>
          <div className="calendar-head">
            {["Mon 14", "Tue 15", "Wed 16", "Thu 17", "Fri 18"].map((day, index) => (
              <span className={index === 2 ? "today" : ""} key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {appointments.map((appointment) => (
              <div className={`appointment ${appointment.tone}`} style={{ left: `${appointment.day * 20 + 1}%`, top: appointment.top }} key={appointment.name}>
                <span className="avatar">{appointment.name.charAt(0)}</span>
                <span><b>{appointment.name}</b><small>{appointment.service}</small><small>{appointment.time}</small></span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="phone-preview">
        <div className="phone-header"><Logo compact /><Menu /></div>
        <strong>Book Your<br />Appointment</strong>
        <small>Choose a service, date and time in just a few taps.</small>
        <span>Select Service <ChevronDown /></span>
        <span>Select Staff <ChevronDown /></span>
        <span>Apr 16, 2025 <CalendarDays /></span>
        <button>Find Available Times</button>
      </div>
    </div>
  )
}

function SignupCard() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const business = String(form.get("business") ?? "").trim()
    const email = String(form.get("email") ?? "").trim()
    const password = String(form.get("password") ?? "")

    if (!supabase) {
      setStatus("error")
      setMessage("Connect Supabase first by adding VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.")
      return
    }

    setStatus("loading")
    setMessage("")
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { business_name: business },
        emailRedirectTo: `${window.location.origin}/onboarding`,
      },
    })

    if (error) {
      setStatus("error")
      setMessage(error.message)
      return
    }

    setStatus("success")
    setMessage(data.session ? "Your account is ready." : "Check your email to confirm your account, then come back to Bookora.")
  }

  const signInWithProvider = async (provider: "google" | "apple") => {
    if (!supabase) {
      setStatus("error")
      setMessage("Connect Supabase first by adding VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.")
      return
    }

    setStatus("loading")
    setMessage("")
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/onboarding` },
    })

    if (error) {
      setStatus("error")
      setMessage(error.message)
    }
  }

  /* if (step === 2) {
    return (
      <main className="onboarding-page">
        <div className="onboarding-brand"><Logo /></div>
        <Card className="onboarding-card">
          <div className="onboarding-progress" aria-label="Onboarding step 2 of 3">
            <span className="active">1</span><i /><span className="active">2</span><i /><span>3</span>
          </div>
          <CardHeader>
            <p className="eyebrow"><span>Step 2 of 3</span></p>
            <CardTitle>Confirm your time zone and currency</CardTitle>
            <CardDescription>We’ll use these settings for your calendar, booking times, and payment reporting.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="onboarding-form" onSubmit={submit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="time-zone">Time zone</FieldLabel>
                  <select id="time-zone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} required>
                    <option value="Asia/Manila">Philippine Time (GMT+8)</option>
                    <option value="Asia/Singapore">Singapore Time (GMT+8)</option>
                    <option value="Asia/Tokyo">Japan Time (GMT+9)</option>
                    <option value="Asia/Dubai">Gulf Standard Time (GMT+4)</option>
                    <option value="Australia/Sydney">Australian Eastern Time</option>
                    <option value="Europe/London">United Kingdom Time</option>
                    <option value="America/Los_Angeles">Pacific Time (US)</option>
                    <option value="America/New_York">Eastern Time (US)</option>
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="currency">Currency</FieldLabel>
                  <select id="currency" value={currency} onChange={(event) => setCurrency(event.target.value)} required>
                    <option value="PHP">Philippine Peso (₱ PHP)</option>
                    <option value="USD">US Dollar ($ USD)</option>
                    <option value="SGD">Singapore Dollar ($ SGD)</option>
                    <option value="AUD">Australian Dollar ($ AUD)</option>
                    <option value="GBP">British Pound (£ GBP)</option>
                    <option value="AED">UAE Dirham (د.إ AED)</option>
                  </select>
                </Field>
              </FieldGroup>
              {status === "error" && <p className="auth-error" role="alert">{error}</p>}
              <div className="onboarding-actions">
                <Button variant="outline" size="lg" type="button" onClick={() => { setStep(1); setStatus("idle"); setError("") }}>Back</Button>
                <Button className="onboarding-submit" size="lg" type="submit" disabled={status === "loading"}>
                  {status === "loading" ? "Saving…" : "Finish setup"} <ArrowRight data-icon="inline-end" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <p className="onboarding-footnote">You can update these details later in Settings.</p>
      </main>
    )
  }
  */

  return (
    <Card className="signup-card" id="signup">
      <CardHeader>
        <CardTitle>Create Your Account</CardTitle>
        <CardDescription>Start your booking app in minutes.</CardDescription>
      </CardHeader>
      <CardContent>
        {status === "success" ? (
          <div className="success-state" role="status">
            <span><Check /></span>
            <h3>Welcome to Bookora</h3>
            <p>{message}</p>
            <Button variant="outline" type="button" onClick={() => { setStatus("idle"); setMessage("") }}>Back to form</Button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <FieldGroup>
              <Field className="icon-field">
                <FieldLabel className="sr-only" htmlFor="business">Business name</FieldLabel>
                <Store aria-hidden="true" />
                <Input id="business" name="business" placeholder="Business Name" required />
              </Field>
              <Field className="icon-field">
                <FieldLabel className="sr-only" htmlFor="email">Email address</FieldLabel>
                <Mail aria-hidden="true" />
                <Input id="email" name="email" type="email" placeholder="Email Address" required />
              </Field>
              <Field className="icon-field">
                <FieldLabel className="sr-only" htmlFor="password">Password</FieldLabel>
                <LockKeyhole aria-hidden="true" />
                <Input id="password" name="password" type="password" placeholder="Password" minLength={8} required />
                <EyeOff className="end-icon" aria-hidden="true" />
              </Field>
            </FieldGroup>
            <Button className="wide-button" size="lg" type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Connecting…" : "Create Free Account"}
            </Button>
            {status === "error" && <p className="auth-error" role="alert">{message}</p>}
            <div className="or-row"><Separator /><span>or continue with</span><Separator /></div>
            <div className="social-buttons">
              <Button variant="outline" type="button" disabled={status === "loading"} onClick={() => signInWithProvider("google")}><img className="social-logo" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" /> Continue with Google</Button>
              <Button variant="outline" type="button" disabled={status === "loading"} onClick={() => signInWithProvider("apple")}><img className="social-logo" src="https://cdn.simpleicons.org/apple/111827" alt="" /> Continue with Apple</Button>
            </div>
            <p className="terms">By creating an account, you agree to our<br /><a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy.</a></p>
            {!hasSupabaseConfig && <p className="auth-note">OAuth is ready once Supabase environment variables are added.</p>}
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function OnboardingScreen({ user, onComplete }: { user: User; onComplete: () => void }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")
  const [error, setError] = useState("")
  const [brandName, setBrandName] = useState(String(user.user_metadata?.business_name ?? ""))
  const [industry, setIndustry] = useState("")
  const [phone, setPhone] = useState("")
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila")
  const [currency, setCurrency] = useState("PHP")

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return

    setStatus("loading")
    setError("")
    const { error: updateError } = await supabase.auth.updateUser({
      data: step === 1
        ? { business_name: brandName.trim(), industry, phone: phone.trim() }
        : { time_zone: timeZone, currency, onboarding_complete: true },
    })

    if (updateError) {
      setStatus("error")
      setError(updateError.message)
      return
    }

    if (step === 1) {
      setStatus("idle")
      setStep(2)
    } else {
      onComplete()
    }
  }

  if (step === 2) {
    return (
      <main className="onboarding-page">
        <div className="onboarding-brand"><Logo /></div>
        <Card className="onboarding-card">
          <CardHeader>
            <CardTitle>Confirm your time zone and currency</CardTitle>
            <CardDescription>We’ll use these settings for your calendar, booking times, and payment reporting.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="onboarding-form" onSubmit={submit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="time-zone">Time zone</FieldLabel>
                  <select id="time-zone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} required>
                    <option value="Asia/Manila">Philippine Time (GMT+8)</option>
                    <option value="Asia/Singapore">Singapore Time (GMT+8)</option>
                    <option value="Asia/Tokyo">Japan Time (GMT+9)</option>
                    <option value="Asia/Dubai">Gulf Standard Time (GMT+4)</option>
                    <option value="Australia/Sydney">Australian Eastern Time</option>
                    <option value="Europe/London">United Kingdom Time</option>
                    <option value="America/Los_Angeles">Pacific Time (US)</option>
                    <option value="America/New_York">Eastern Time (US)</option>
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="currency">Currency</FieldLabel>
                  <select id="currency" value={currency} onChange={(event) => setCurrency(event.target.value)} required>
                    <option value="PHP">Philippine Peso (₱ PHP)</option>
                    <option value="USD">US Dollar ($ USD)</option>
                    <option value="SGD">Singapore Dollar ($ SGD)</option>
                    <option value="AUD">Australian Dollar ($ AUD)</option>
                    <option value="GBP">British Pound (£ GBP)</option>
                    <option value="AED">UAE Dirham (د.إ AED)</option>
                  </select>
                </Field>
              </FieldGroup>
              {status === "error" && <p className="auth-error" role="alert">{error}</p>}
              <div className="onboarding-actions">
                <Button variant="outline" size="lg" type="button" onClick={() => { setStep(1); setStatus("idle"); setError("") }}>Back</Button>
                <Button className="onboarding-submit" size="lg" type="submit" disabled={status === "loading"}>
                  {status === "loading" ? "Saving…" : "Finish setup"} <ArrowRight data-icon="inline-end" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <p className="onboarding-footnote">You can update these details later in Settings.</p>
      </main>
    )
  }

  return (
    <main className="onboarding-page">
      <div className="onboarding-brand"><Logo /></div>
      <Card className="onboarding-card">
        <CardHeader>
          <CardTitle>Let’s start with your brand</CardTitle>
          <CardDescription>Tell us a little about your business so we can make Bookora feel like yours.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="onboarding-form" onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="brand-name">Brand name</FieldLabel>
                <Input id="brand-name" value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="e.g. Glow Studio" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="industry">Industry</FieldLabel>
                <select id="industry" value={industry} onChange={(event) => setIndustry(event.target.value)} required>
                  <option value="" disabled>Select your industry</option>
                  <option value="nail-salon">Nail salon</option>
                  <option value="hair-salon">Hair salon</option>
                  <option value="barbershop">Barbershop</option>
                  <option value="facial-spa">Facial &amp; spa</option>
                  <option value="makeup-studio">Makeup studio</option>
                  <option value="beauty-clinic">Beauty clinic</option>
                  <option value="other">Other beauty business</option>
                </select>
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">Phone number</FieldLabel>
                <Input id="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="e.g. +63 917 123 4567" autoComplete="tel" required />
              </Field>
            </FieldGroup>
            {status === "error" && <p className="auth-error" role="alert">{error}</p>}
            <Button className="onboarding-submit" size="lg" type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Saving…" : "Continue"} <ArrowRight data-icon="inline-end" />
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="onboarding-footnote">You can update these details later in Settings.</p>
    </main>
  )
}

function PasskeyModal({ onClose }: { onClose: (dontAskAgain?: boolean) => void }) {
  const [dontAskAgain, setDontAskAgain] = useState(false)

  const close = () => onClose(dontAskAgain)

  return (
    <div className="passkey-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) close() }}>
      <section className="passkey-modal" role="dialog" aria-modal="true" aria-labelledby="passkey-title">
        <button className="passkey-close" type="button" aria-label="Close passkey prompt" onClick={close}><X /></button>
        <div className="passkey-icon"><Fingerprint /></div>
        <p className="eyebrow"><span>Secure your account</span></p>
        <h2 id="passkey-title">Enable Passkey for Login</h2>
        <p className="passkey-intro">Sign in faster and more securely without remembering another password.</p>
        <div className="passkey-benefits">
          <div><span><Fingerprint /></span><p><strong>No passwords needed</strong><small>Sign in with Face ID, fingerprint, or PIN.</small></p></div>
          <div><span><ShieldCheck /></span><p><strong>More secure</strong><small>Passkeys add an extra layer of protection to your account.</small></p></div>
          <div><span><Zap /></span><p><strong>Faster access</strong><small>Enjoy quick, seamless logins every time.</small></p></div>
        </div>
        <label className="passkey-check"><input type="checkbox" checked={dontAskAgain} onChange={(event) => setDontAskAgain(event.target.checked)} /> <span>Don’t ask again</span></label>
        <div className="passkey-actions">
          <Button variant="outline" type="button" onClick={close}>Not now</Button>
          <Button type="button" onClick={close}>Enable</Button>
        </div>
      </section>
    </div>
  )
}

const dashboardNav = [
  { label: "Overview", icon: Home },
  { label: "Calendar", icon: CalendarDays },
  { label: "Appointments", icon: CalendarRange },
  { label: "Clients", icon: Users },
  { label: "Services", icon: Scissors },
  { label: "Staff", icon: Users },
  { label: "Payments", icon: CreditCard },
  { label: "Reports", icon: BarChart3 },
  { label: "Settings", icon: Settings2 },
]

const upcomingAppointments = [
  { name: "Anna Reyes", service: "Hair Treatment", time: "9:00 AM", color: "lilac", initials: "AR" },
  { name: "Liza Gomez", service: "Gel Manicure", time: "10:30 AM", color: "peach", initials: "LG" },
  { name: "Maria Cruz", service: "Facial", time: "1:00 PM", color: "mint", initials: "MC" },
  { name: "John Tan", service: "Haircut", time: "3:00 PM", color: "blue", initials: "JT" },
]

function DashboardScreen({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [activeNav, setActiveNav] = useState("Overview")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const businessName = String(user.user_metadata?.business_name ?? "Your business")
  const firstName = String(user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "there").split(" ")[0]
  const avatar = firstName.slice(0, 2).toUpperCase()

  const selectNav = (label: string) => {
    setActiveNav(label)
    setSidebarOpen(false)
  }

  return (
    <div className="dashboard-shell">
      {sidebarOpen && <button className="dashboard-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`dashboard-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="dashboard-brand"><Logo /></div>
        <div className="workspace-switcher">
          <span className="workspace-avatar"><Store /></span>
          <span><strong>{businessName}</strong><small>Business account</small></span>
          <ChevronDown />
        </div>
        <nav className="dashboard-nav" aria-label="Dashboard navigation">
          <p className="dashboard-nav-label">Workspace</p>
          {dashboardNav.map(({ label, icon: Icon }) => (
            <button key={label} className={activeNav === label ? "active" : ""} onClick={() => selectNav(label)}>
              <Icon /> <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="dashboard-sidebar-bottom">
          <div className="help-card"><strong>Need a hand?</strong><span>Our team is here to help you get set up.</span><button>Visit Help Center <ArrowRight /></button></div>
          <button className="dashboard-signout" onClick={onSignOut}><X /> Sign out</button>
        </div>
      </aside>

      <div className="dashboard-content">
        <header className="dashboard-header">
          <button className="dashboard-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu /></button>
          <div className="dashboard-search"><Search /><input aria-label="Search" placeholder="Search anything..." /></div>
          <div className="dashboard-header-actions">
            <button className="dashboard-icon-button" aria-label="Notifications"><Bell /><i /></button>
            <span className="dashboard-divider" />
            <button className="dashboard-user"><span className="user-avatar">{avatar}</span><span><strong>{firstName}</strong><small>Owner</small></span><ChevronDown /></button>
          </div>
        </header>

        <main className="dashboard-main">
          {activeNav === "Overview" ? (
            <>
              <div className="dashboard-page-heading">
                <div><p className="dashboard-kicker">{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</p><h1>Good morning, {firstName} <span>✦</span></h1><p>Here’s what’s happening with your business today.</p></div>
                <Button><Plus data-icon="inline-start" /> New appointment</Button>
              </div>

              <section className="dashboard-welcome">
                <div><span className="dashboard-welcome-label">Your day at a glance</span><h2>Keep your schedule moving.</h2><p>Three quick actions will help you make the most of Bookora.</p><div className="welcome-actions"><button onClick={() => selectNav("Services")}><Scissors /> Add your services <ArrowRight /></button><button onClick={() => selectNav("Staff")}><Users /> Invite your team <ArrowRight /></button></div></div>
                <div className="welcome-orbit"><span>Today</span><strong>12</strong><small>appointments</small></div>
              </section>

              <section className="dashboard-metrics" aria-label="Business summary">
                <article><span className="metric-icon coral"><CalendarDays /></span><div><small>Today's appointments</small><strong>12</strong><em className="positive">+20.4% <span>vs last week</span></em></div></article>
                <article><span className="metric-icon lavender"><CreditCard /></span><div><small>Revenue this week</small><strong>₱18,420</strong><em className="positive">+12.8% <span>vs last week</span></em></div></article>
                <article><span className="metric-icon mint"><Users /></span><div><small>New clients</small><strong>8</strong><em className="positive">+4.2% <span>vs last week</span></em></div></article>
                <article><span className="metric-icon peach"><BarChart3 /></span><div><small>Completion rate</small><strong>94%</strong><em>Last 30 days</em></div></article>
              </section>

              <section className="dashboard-lower-grid">
                <article className="dashboard-panel appointments-panel"><div className="panel-heading"><div><h2>Upcoming appointments</h2><p>Your schedule for today</p></div><button onClick={() => selectNav("Calendar")}>View calendar <ArrowRight /></button></div><div className="appointments-list">{upcomingAppointments.map((appointment) => <div className="appointment-row" key={appointment.name}><span className={`appointment-avatar ${appointment.color}`}>{appointment.initials}</span><div><strong>{appointment.name}</strong><small>{appointment.service}</small></div><time>{appointment.time}</time><span className="appointment-status">Confirmed</span><button aria-label={`More options for ${appointment.name}`}><span>•••</span></button></div>)}</div><button className="panel-footer-link" onClick={() => selectNav("Appointments")}>View all appointments <ArrowRight /></button></article>
                <article className="dashboard-panel setup-panel"><div className="panel-heading"><div><h2>Finish setting up</h2><p>Unlock the full Bookora experience</p></div><span className="setup-count">2/4</span></div><div className="setup-progress"><span /></div><div className="setup-task done"><span><Check /></span><div><strong>Business details</strong><small>Completed</small></div></div><div className="setup-task"><span>2</span><div><strong>Add your first service</strong><small>Help clients know what you offer</small></div><ArrowRight /></div><div className="setup-task"><span>3</span><div><strong>Set your availability</strong><small>Choose when clients can book</small></div><ArrowRight /></div></article>
              </section>
            </>
          ) : (
            <section className="dashboard-placeholder"><span className="placeholder-icon"><ListChecks /></span><p className="dashboard-kicker">Workspace feature</p><h1>{activeNav}</h1><p>This mockup is ready for your {activeNav.toLowerCase()} workflow. Connect it to Supabase when you’re ready to add live data.</p><Button onClick={() => setActiveNav("Overview")}>Back to overview</Button></section>
          )}
        </main>
      </div>
    </div>
  )
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [onboardingDone, setOnboardingDone] = useState(false)
  const [showPasskeyPrompt, setShowPasskeyPrompt] = useState(false)

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null
      setAuthUser(user)
      setOnboardingDone(Boolean(user?.user_metadata?.onboarding_complete))
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null
      setAuthUser(user)
      setOnboardingDone(Boolean(user?.user_metadata?.onboarding_complete))
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!authUser) return
    const shouldBeOnboarding = !onboardingDone
    const currentPath = window.location.pathname
    if (shouldBeOnboarding && currentPath !== "/onboarding") {
      window.history.replaceState({}, "", "/onboarding")
    } else if (!shouldBeOnboarding && (currentPath === "/onboarding" || currentPath === "/")) {
      window.history.replaceState({}, "", "/dashboard")
    }
  }, [authUser, onboardingDone])

  if (authUser && !onboardingDone) {
    return <OnboardingScreen user={authUser} onComplete={() => {
      setOnboardingDone(true)
      if (localStorage.getItem("bookora-passkey-prompted") !== "true") setShowPasskeyPrompt(true)
    }} />
  }

  if (authUser && onboardingDone) {
    return <>
      <DashboardScreen user={authUser} onSignOut={async () => { await supabase?.auth.signOut(); window.history.replaceState({}, "", "/") }} />
      {showPasskeyPrompt && <PasskeyModal onClose={(dontAskAgain) => {
        if (dontAskAgain) localStorage.setItem("bookora-passkey-prompted", "true")
        setShowPasskeyPrompt(false)
      }} />}
    </>
  }

  return (
    <>
      <main id="top">
      <header className="site-header">
        <Logo />
        <nav className={menuOpen ? "open" : ""} aria-label="Main navigation">
          <a href="#features">Features <ChevronDown /></a>
          <a href="#pricing">Pricing</a>
          <a href="#solutions">Solutions <ChevronDown /></a>
          <a href="#resources">Resources <ChevronDown /></a>
        </nav>
        <div className="header-actions">
          <button className="language" aria-label="Change language"><Globe2 /> EN <ChevronDown /></button>
          <Button variant="outline">Log In</Button>
          <Button asChild><a href="#signup">Get Started Free</a></Button>
        </div>
        <Button className="menu-button" size="icon" variant="ghost" aria-label="Toggle navigation" onClick={() => setMenuOpen((value) => !value)}>
          {menuOpen ? <X /> : <Menu />}
        </Button>
      </header>

      <section className="hero-shell">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">All-in-one booking platform <span>for salons</span></p>
            <h1>Appointments<br />made <span>simple</span>.</h1>
            <p className="hero-lede">Let your clients book online anytime. Manage your schedule, services, staff and payments — all in one place.</p>
            <div className="hero-actions">
              <Button size="lg" asChild><a href="#signup">Get Started Free <ArrowRight data-icon="inline-end" /></a></Button>
              <Button size="lg" variant="outline" onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}><CirclePlay data-icon="inline-start" /> Watch Demo</Button>
            </div>
            <div className="trust-row">
              {["No credit card required", "Setup in minutes", "Cancel anytime"].map((item) => <span key={item}><Check /> {item}</span>)}
            </div>
          </div>
          <ProductMockup />
          <SignupCard />
        </div>
      </section>

      <section className="feature-strip" id="features">
        {features.map(({ icon: Icon, title, copy }) => (
          <article key={title}>
            <span className="feature-icon"><Icon /></span>
            <h3>{title}</h3>
            <p>{copy}</p>
          </article>
        ))}
      </section>

      <section className="businesses" id="solutions">
        <div className="business-intro">
          <p className="eyebrow"><span>For all types of salon businesses</span></p>
          <h2>Built for beauty<br />professionals like you.</h2>
          <p>Whether you run a nail salon, hair salon, barbershop, facial and spa, or a full-service salon — Bookora adapts to your business.</p>
          <Button asChild><a href="#features">See All Features <ArrowRight data-icon="inline-end" /></a></Button>
        </div>
        <div className="business-grid">
          {businesses.map((business) => (
            <article className="business-card" key={business.label}>
              <img src={business.image} alt={`${business.label} interior and beauty service`} />
              <span>{business.label}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="proof-bar">
        <div className="trusted-label">Trusted by salon professionals</div>
        <div className="payment-logos"><b>VISA</b><b>●●</b><b>GCash</b><b>maya</b><b>stripe</b></div>
        <div className="metric"><strong>10K+</strong><span>Businesses</span></div>
        <div className="metric"><strong>500K+</strong><span>Appointments Booked</span></div>
        <div className="metric"><strong>4.9/5</strong><span>Customer Rating</span></div>
      </section>
      </main>
      {showPasskeyPrompt && <PasskeyModal onClose={(dontAskAgain) => {
        if (dontAskAgain) localStorage.setItem("bookora-passkey-prompted", "true")
        setShowPasskeyPrompt(false)
      }} />}
    </>
  )
}
