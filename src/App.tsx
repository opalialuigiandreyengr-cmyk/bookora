import { FormEvent, useState } from "react"
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CirclePlay,
  CreditCard,
  EyeOff,
  Globe2,
  ListChecks,
  LockKeyhole,
  Mail,
  Menu,
  Store,
  Users,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { hasSupabaseConfig, supabase } from "@/lib/supabase"

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
        emailRedirectTo: window.location.origin,
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
      options: { redirectTo: window.location.origin },
    })

    if (error) {
      setStatus("error")
      setMessage(error.message)
    }
  }

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

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
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
  )
}
