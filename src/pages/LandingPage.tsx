import { useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { ArrowRight, BarChart3, Bell, CalendarDays, Check, CirclePlay, CreditCard, Download, ExternalLink, Globe2, Home, ListChecks, Menu, PlusSquare, Scissors, Settings2, Share, Smartphone, Users, X } from "lucide-react"
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
    const prevBodyOverflow = document.body.style.overflow
    const prevHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = "hidden"
    document.documentElement.style.overflow = "hidden"

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = prevBodyOverflow
      document.documentElement.style.overflow = prevHtmlOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose])

  return <div className="feature-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}><section className="feature-modal" role="dialog" aria-modal="true" aria-labelledby="feature-modal-title"><button className="feature-modal-close" type="button" aria-label="Close feature details" onClick={onClose}><X /></button><span className="feature-modal-icon"><Icon /></span><p className="eyebrow">Bookora feature</p><h2 id="feature-modal-title">{title}</h2><p>{copy}</p><p>Keep this part of your business organized in one calm workspace, so you can spend less time on admin and more time with clients.</p><Button asChild><a href="/signup" onClick={onClose}>Get started free <ArrowRight /></a></Button></section></div>
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
    </svg>
  )
}

function AndroidIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.523 15.341a.885.885 0 0 1-.884-.885c0-.488.396-.884.884-.884.488 0 .885.396.885.884 0 .488-.397.885-.885.885m-11.046 0a.885.885 0 0 1-.885-.885c0-.488.397-.884.885-.884.488 0 .884.396.884.884 0 .488-.396.885-.884.885m11.405-6.02 1.997-3.459a.416.416 0 0 0-.152-.567.416.416 0 0 0-.568.152L17.11 8.95c-1.466-.67-3.148-1.044-5.11-1.044-1.962 0-3.644.374-5.11 1.044L4.841 5.447a.416.416 0 0 0-.568-.152.416.416 0 0 0-.152.567l1.997 3.459C2.688 11.186.443 14.658 0 18.761h24c-.443-4.103-2.688-7.575-6.118-9.44" />
    </svg>
  )
}

function detectInitialPlatform(): "ios" | "android" {
  if (typeof navigator === "undefined") return "ios"
  const ua = navigator.userAgent || ""
  if (/android/i.test(ua)) return "android"
  return "ios"
}

function DownloadAppModal({ onClose }: { onClose: () => void }) {
  const [platform, setPlatform] = useState<"ios" | "android">(detectInitialPlatform)

  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow
    const prevHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = "hidden"
    document.documentElement.style.overflow = "hidden"

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = prevBodyOverflow
      document.documentElement.style.overflow = prevHtmlOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose])

  return (
    <div
      className="download-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose()
      }}
    >
      <section
        className="download-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="download-app-modal-title"
      >
        <div className="download-modal-header">
          <span className="download-modal-icon">
            <Smartphone />
          </span>
          <div className="download-modal-title-group">
            <p className="download-modal-eyebrow">Bookora PH Mobile App</p>
            <h2 id="download-app-modal-title" className="download-modal-title">
              Get the Bookora App
            </h2>
          </div>
          <button
            className="download-modal-close"
            type="button"
            aria-label="Close download modal"
            onClick={onClose}
          >
            <X />
          </button>
        </div>

        <p className="download-modal-subtitle">
          Manage your bookings, calendar, clients, and staff right from your phone.
        </p>

        <div className="download-modal-tabs" role="tablist" aria-label="Choose mobile platform">
          <button
            type="button"
            role="tab"
            aria-selected={platform === "ios"}
            className={`download-modal-tab${platform === "ios" ? " active" : ""}`}
            onClick={() => setPlatform("ios")}
          >
            <AppleIcon />
            <span>iOS</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={platform === "android"}
            className={`download-modal-tab${platform === "android" ? " active" : ""}`}
            onClick={() => setPlatform("android")}
          >
            <AndroidIcon />
            <span>Android (APK)</span>
          </button>
        </div>

        {platform === "ios" ? (
          <div>
            <div className="download-modal-card">
              <div className="download-modal-card-head">
                <strong>Install on iPhone &amp; iPad</strong>
                <span className="download-modal-badge">Safari PWA</span>
              </div>

              <ol className="download-steps">
                <li className="download-step">
                  <span className="download-step-num">1</span>
                  <div className="download-step-body">
                    Tap <strong>Launch iOS App</strong> below in <strong>Safari</strong>.
                  </div>
                </li>

                <li className="download-step">
                  <span className="download-step-num">2</span>
                  <div className="download-step-body">
                    Tap{" "}
                    <span className="download-inline-chip">
                      <Share /> Share
                    </span>{" "}
                    on Safari&apos;s bottom toolbar.
                  </div>
                </li>

                <li className="download-step">
                  <span className="download-step-num">3</span>
                  <div className="download-step-body">
                    Select{" "}
                    <span className="download-inline-chip">
                      <PlusSquare /> Add to Home Screen
                    </span>
                    .
                  </div>
                </li>

                <li className="download-step">
                  <span className="download-step-num">4</span>
                  <div className="download-step-body">
                    Tap <strong>Add</strong> in the top-right to pin <strong>Bookora PH</strong>.
                  </div>
                </li>
              </ol>
            </div>

            <div className="download-modal-actions">
              <Button asChild size="lg">
                <a href="/app/">
                  Launch iOS App &amp; Install <ExternalLink />
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="download-modal-card">
              <div className="download-modal-card-head">
                <strong>Bookora PH for Android</strong>
                <span className="download-modal-badge">Direct APK</span>
              </div>
              <p
                style={{
                  fontSize: "0.82rem",
                  margin: 0,
                  lineHeight: 1.5,
                  color: "var(--muted-foreground)",
                }}
              >
                Download the official Android APK package to install the native Bookora PH app directly on your Android phone or tablet.
              </p>
            </div>

            <div className="download-modal-actions">
              <Button
                size="lg"
                type="button"
                disabled
                style={{ opacity: 0.65, cursor: "not-allowed" }}
              >
                <Download /> Download Android APK (Coming Soon)
              </Button>

              <Button variant="outline" size="lg" asChild>
                <a href="/app/">
                  Open Mobile Web App Instead <ExternalLink />
                </a>
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

export function LandingPage({ clientUser }: { clientUser?: User | null } = {}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeFeature, setActiveFeature] = useState<typeof features[number] | null>(null)
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [downloadModalOpen, setDownloadModalOpen] = useState(false)

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
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              setDownloadModalOpen(true)
            }}
            style={{
              background: "none",
              border: "none",
              font: "inherit",
              fontWeight: 600,
              color: "inherit",
              cursor: "pointer",
              padding: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            <Download style={{ width: "15px", height: "15px" }} /> Download App
          </button>
          <button type="button" className="mobile-nav-login" onClick={openLogin}>
            Log in to account
          </button>
        </nav>
        <div className="header-actions">
          <button className="language"><Globe2 /> EN</button>
          <Button
            className="header-login"
            variant="outline"
            type="button"
            onClick={() => setDownloadModalOpen(true)}
          >
            <Download /> Download App
          </Button>
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
              <Button size="lg" variant="outline" type="button" onClick={() => setDownloadModalOpen(true)}>
                <Download /> Download App
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

      {downloadModalOpen && <DownloadAppModal onClose={() => setDownloadModalOpen(false)} />}

      {loginModalOpen && (
        <LoginModal
          onClose={() => setLoginModalOpen(false)}
          onSwitchToSignup={handleSwitchToSignup}
        />
      )}
    </main>
  )
}
