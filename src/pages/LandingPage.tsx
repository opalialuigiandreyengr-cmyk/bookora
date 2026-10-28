import { useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { ArrowRight, BarChart3, Bell, CalendarDays, Check, CirclePlay, CreditCard, Globe2, Home, ListChecks, Menu, Scissors, Settings2, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { Logo } from "@/components/brand/Logo"
import { MarketingSections } from "@/components/marketing/MarketingSections"
import { LoginModal } from "@/pages/LoginModal"

const features = [[CalendarDays, "Online Booking", "Let clients book 24/7 from any device."], [Users, "Manage Staff", "Set schedules, assign services and track availability."], [ListChecks, "Custom Services", "Add services, prices, duration and packages."], [CreditCard, "Accept Payments", "In-salon or online payments, all in one place."], [Bell, "Automated Reminders", "Reduce no-shows with email and SMS reminders."], [BarChart3, "Reports & Growth", "Track bookings, revenue and your best services."]] as const

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

  return <div className="feature-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}><section className="feature-modal" role="dialog" aria-modal="true" aria-labelledby="feature-modal-title"><button className="feature-modal-close" type="button" aria-label="Close feature details" onClick={onClose}><X /></button><span className="feature-modal-icon"><Icon /></span><p className="eyebrow">Bookora feature</p><h2 id="feature-modal-title">{title}</h2><p>{copy}</p><p>Keep this part of your business organized in one calm workspace, so you can spend less time on admin and more time with clients.</p><Button asChild><a href="/signup" onClick={onClose}>Get started free <ArrowRight /></a></Button></section></div>
}

export function LandingPage({ clientUser }: { clientUser?: User | null } = {}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeFeature, setActiveFeature] = useState<typeof features[number] | null>(null)
  const [loginModalOpen, setLoginModalOpen] = useState(false)

  const openLogin = () => {
    setMenuOpen(false)
    window.location.href = "/login"
  }

  const handleSwitchToSignup = () => {
    window.location.href = "/signup"
  }

  return (
    <main id="top">
      {clientUser && (
        <div className="client-banner">
          <div className="client-banner-inner">
            <span className="client-banner-badge">
              <span className="client-banner-dot" />
              Client Account
            </span>
            <span className="client-banner-text">
              Signed in as <strong>{String(clientUser.user_metadata?.full_name ?? clientUser.email?.split("@")[0])}</strong> for <strong>{String(clientUser.user_metadata?.client_business_name ?? clientUser.user_metadata?.client_slug ?? "your salon")}</strong>
            </span>
            <div className="client-banner-actions">
              <a
                href={clientUser.user_metadata?.client_slug ? `/book?slug=${encodeURIComponent(clientUser.user_metadata.client_slug)}` : "/book"}
                className="client-banner-cta"
              >
                Go to Booking Page →
              </a>
              <button
                type="button"
                className="client-banner-signout"
                onClick={async () => {
                  if (supabase) await supabase.auth.signOut()
                  window.location.reload()
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
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
          <Button className="header-login" variant="outline" asChild>
            <a href="/login">Log in</a>
          </Button>
          <Button className="header-start-button" asChild>
            <a href="/signup">
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
                <a href="/signup">Get started free <ArrowRight /></a>
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
