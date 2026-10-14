import { useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Clock3,
  Globe2,
  Heart,
  Menu,
  Mail,
  MapPin,
  Moon,
  Phone,
  Sparkles,
  Scissors,
  Star,
  UserRound,
  X,
  Sun,
} from "lucide-react"
import { supabase } from "@/lib/supabase"

type Service = {
  id: string
  name: string
  description: string
  duration: string
  price: string
  image?: string
  color?: string
  categoryId?: string
  category?: string
}

type ServiceCategory = { id: string; name: string }

type BusinessProfile = {
  id: string
  business_name: string
  slug: string | null
  industry: string | null
  about: string | null
  city: string | null
  country: string | null
  country_code: string | null
  phone: string | null
  address: string | null
  logo_url: string | null
  banner_url: string | null
  business_hours: Array<{ day: string; open: boolean; start: string; end?: string }> | null
}

const fallbackServices: Service[] = [
  { id: "gel", name: "Gel manicure", description: "Long-lasting shine with cuticle care", duration: "45 min", price: "₱650" },
  { id: "classic", name: "Classic manicure", description: "Shape, tidy, buff and polish", duration: "35 min", price: "₱450" },
  { id: "extensions", name: "Gel extensions", description: "A little extra length, made to last", duration: "1 hr 30 min", price: "₱1,250" },
  { id: "removal", name: "Gel removal", description: "Safe, gentle removal and nail tidy", duration: "25 min", price: "₱250" },
]

const timeSlots = ["9:00 AM", "10:30 AM", "12:00 PM", "1:30 PM", "3:00 PM", "4:30 PM"]

const philippinesDateParts = () => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])) as Record<string, string>
const philippinesTodayKey = () => { const parts = philippinesDateParts(); return `${parts.year}-${parts.month}-${parts.day}` }
const calendarKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
const calendarLabel = (key: string) => { const [year, month, day] = key.split("-").map(Number); const date = new Date(Date.UTC(year, month - 1, day)); return { day: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(date), date: String(day), month: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date) } }

export function CustomerBookingPage() {
  const [step, setStep] = useState(1)
  const [darkMode, setDarkMode] = useState(() => window.localStorage.getItem("bookora-booking-theme") === "dark")
  const [profile, setProfile] = useState<BusinessProfile | null>(null)
  const [liveServices, setLiveServices] = useState<Service[]>([])
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [serviceId, setServiceId] = useState("")
  const [selectedDateKey, setSelectedDateKey] = useState(() => philippinesTodayKey())
  const [calendarMonth, setCalendarMonth] = useState(() => { const [year, month] = philippinesTodayKey().split("-").map(Number); return new Date(Date.UTC(year, month - 1, 1)) })
  const [time, setTime] = useState("")
  const [details, setDetails] = useState({ name: "", email: "", phone: "", note: "" })
  const visibleServices = liveServices
  const selectedService = useMemo(() => visibleServices.find((service) => service.id === serviceId), [serviceId, visibleServices])
  const serviceGroups = useMemo(() => {
    const groups = serviceCategories.map((category) => ({ name: category.name, services: visibleServices.filter((service) => service.categoryId === category.id) })).filter((group) => group.services.length)
    const uncategorized = visibleServices.filter((service) => !service.categoryId || !serviceCategories.some((category) => category.id === service.categoryId))
    if (uncategorized.length) groups.push({ name: "", services: uncategorized })
    return groups
  }, [serviceCategories, visibleServices])
  const todayKey = philippinesTodayKey()
  const selectedDate = calendarLabel(selectedDateKey)
  const calendarDays = useMemo(() => { const firstDay = new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth(), 1)); const start = new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth(), 1 - firstDay.getUTCDay())); return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setUTCDate(start.getUTCDate() + index); return { key: calendarKey(date), date, currentMonth: date.getUTCMonth() === calendarMonth.getUTCMonth() } }) }, [calendarMonth])
  const calendarMonthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(calendarMonth)
  const businessName = profile?.business_name || ""
  const businessAbout = profile?.about || ""
  const businessLocation = [profile?.city, profile?.country].filter(Boolean).join(", ")
  const businessAddress = profile?.address || businessLocation
  const businessPhone = [profile?.country_code, profile?.phone].filter(Boolean).join(" ")
  const businessInitial = businessName.trim().charAt(0).toUpperCase()
  const bookingBrandName = profile?.slug || businessName
  const bookingPolicies = [
    "A 50% deposit is required to secure your appointment.",
    "Please arrive 5–10 minutes early for your appointment.",
    "Cancellations or reschedules should be made at least 24 hours ahead.",
  ]
  const schedule = profile?.business_hours ?? []
  const philippinesTimeZone = "Asia/Manila"
  const formatScheduleTime = (value?: string) => value ? new Intl.DateTimeFormat("en-US", { timeZone: philippinesTimeZone, hour: "numeric", minute: "2-digit" }).format(new Date(`1970-01-01T${value}:00+08:00`)) : "Closed"
  const timeToMinutes = (value?: string) => value ? Number(value.split(":")[0]) * 60 + Number(value.split(":")[1] || 0) : -1
  const philippinesNow = new Intl.DateTimeFormat("en-US", { timeZone: philippinesTimeZone, weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date())
  const todayName = philippinesNow.find((part) => part.type === "weekday")?.value || ""
  const todaySchedule = schedule.find((item) => item.day.toLowerCase() === todayName.toLowerCase())
  const currentMinutes = Number(philippinesNow.find((part) => part.type === "hour")?.value || 0) * 60 + Number(philippinesNow.find((part) => part.type === "minute")?.value || 0)
  const isOpenNow = Boolean(todaySchedule?.open && currentMinutes >= timeToMinutes(todaySchedule.start) && currentMinutes < timeToMinutes(todaySchedule.end))
  const weekdayOrder = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  const todayIndex = weekdayOrder.findIndex((day) => day.toLowerCase() === todayName.toLowerCase())
  const nextOpenSchedule = Array.from({ length: 7 }, (_, offset) => {
    const dayName = weekdayOrder[(todayIndex + offset + 7) % 7]
    const item = schedule.find((entry) => entry.day.toLowerCase() === dayName.toLowerCase())
    if (!item?.open || !item.start) return null
    if (offset === 0 && currentMinutes >= timeToMinutes(item.start)) return null
    return item
  }).find(Boolean)
  const todaySummary = isOpenNow ? `Open now · Closes ${formatScheduleTime(todaySchedule?.end)}` : nextOpenSchedule ? `Closed · Opens ${formatScheduleTime(nextOpenSchedule.start)} ${nextOpenSchedule.day.slice(0, 3)}` : todaySchedule?.open ? `Closed · Opens ${formatScheduleTime(todaySchedule.start)} ${todaySchedule.day.slice(0, 3)}` : "Hours unavailable"

  useEffect(() => {
    window.localStorage.setItem("bookora-booking-theme", darkMode ? "dark" : "light")
  }, [darkMode])

  useEffect(() => {
    if (!scheduleOpen) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest(".schedule-control")) setScheduleOpen(false)
    }
    document.addEventListener("mousedown", closeOnOutsideClick)
    return () => document.removeEventListener("mousedown", closeOnOutsideClick)
  }, [scheduleOpen])

  useEffect(() => {
    let active = true
    const hostParts = window.location.hostname.split(".")
    const hostSlug = hostParts.length >= 3 && hostParts.slice(-2).join(".") === "bookora.com" ? hostParts[0] : ""
    const bookingSlug = new URLSearchParams(window.location.search).get("slug")?.trim() || hostSlug
    const loadPublicBookingData = async () => {
      if (!supabase) return
      const profileQuery = supabase.from("business_profiles").select("id, business_name, slug, industry, about, city, country, country_code, phone, address, logo_url, banner_url, business_hours").order("created_at", { ascending: true }).limit(1)
      const { data: businesses, error: profileError } = bookingSlug ? await profileQuery.eq("slug", bookingSlug) : await profileQuery
      const business = businesses?.[0]
      if (!active || profileError || !business) return
      setProfile(business as BusinessProfile)
      const [{ data: categoryRows }, { data: serviceRows }] = await Promise.all([
        supabase.from("service_categories").select("id, name").eq("business_id", business.id).order("created_at"),
        supabase.from("services").select("id, name, duration_minutes, price, category_id, image_url, show_on_booking_page").eq("business_id", business.id).eq("show_on_booking_page", true).order("created_at"),
      ])
      if (!active) return
      setServiceCategories((categoryRows ?? []) as ServiceCategory[])
      setLiveServices((serviceRows ?? []).map((row: any, index: number) => ({ id: row.id, name: row.name, description: business.industry ? `${business.industry} service` : "Made with thoughtful detail", duration: row.duration_minutes ? `${row.duration_minutes} min` : "Duration varies", price: row.price || "Price on request", categoryId: row.category_id || undefined, category: (categoryRows ?? []).find((category: any) => category.id === row.category_id)?.name, image: row.image_url || "", color: ["coral", "lavender", "mint", "peach"][index % 4] })))
    }
    loadPublicBookingData().catch(() => undefined)
    return () => { active = false }
  }, [])

  const canContinue = step === 1 ? Boolean(serviceId) : step === 2 ? Boolean(time) : Boolean(details.name && details.email && details.phone)

  const updateDetail = (key: keyof typeof details, value: string) => setDetails((current) => ({ ...current, [key]: value }))

  return (
    <main className={`customer-booking-page ${darkMode ? "booking-dark" : ""} ${step === 2 ? "date-time-page" : ""}`}>
      <header className="booking-header">
        <a className="booking-brand" href="/" aria-label={`${bookingBrandName} booking page`}>
          {profile?.logo_url ? <img className="booking-brand-logo" src={profile.logo_url} alt="" /> : <span className="booking-brand-mark">b</span>}
          <span>{bookingBrandName}</span>
        </a>
        <nav className="booking-nav" aria-label="Main navigation">
          <a href="#services" onClick={() => setMenuOpen(false)}>Services</a><a href="#team" onClick={() => setMenuOpen(false)}>Team</a><a href="#reviews" onClick={() => setMenuOpen(false)}>Reviews</a><a href="#about" onClick={() => setMenuOpen(false)}>About</a>
        </nav>
        <div className="booking-header-actions"><button className="booking-host" type="button">List your studio</button><button className="booking-language" type="button"><Globe2 size={16} /> EN <ChevronDown size={13} /></button><button className="booking-theme-toggle" type="button" aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setDarkMode((enabled) => !enabled)}>{darkMode ? <Sun size={16} /> : <Moon size={16} />}</button><div className="booking-menu-wrap"><button className={`booking-account ${accountOpen ? "is-open" : ""}`} type="button" aria-label="Open account menu" aria-expanded={accountOpen} onClick={() => { setAccountOpen((open) => !open); setMenuOpen(false) }}><UserRound size={17} /></button>{accountOpen && <div className="account-dropdown" role="menu"><button type="button" role="menuitem" onClick={() => setAccountOpen(false)}><UserRound size={15} /> Sign in</button><button type="button" role="menuitem" onClick={() => setAccountOpen(false)}><Heart size={15} /> Saved studios</button><button type="button" role="menuitem" onClick={() => setAccountOpen(false)}><CalendarDays size={15} /> My bookings</button><div className="account-dropdown-divider" /><button type="button" role="menuitem" onClick={() => setAccountOpen(false)}>List your studio</button></div>}</div><button className={`booking-mobile-toggle ${menuOpen ? "is-open" : ""}`} type="button" aria-label="Open navigation menu" aria-expanded={menuOpen} onClick={() => { setMenuOpen((open) => !open); setAccountOpen(false) }}>{menuOpen ? <ChevronDown size={17} /> : <Menu size={17} />}</button></div>
      </header>

      {menuOpen && <div className="booking-mobile-menu" role="dialog" aria-label="Navigation menu"><div className="mobile-menu-heading"><strong>Explore Bookora</strong><button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X size={16} /></button></div><a href="#services" onClick={() => setMenuOpen(false)}>Services <ArrowRight size={16} /></a><a href="#team" onClick={() => setMenuOpen(false)}>Meet the team <ArrowRight size={16} /></a><a href="#reviews" onClick={() => setMenuOpen(false)}>Guest reviews <ArrowRight size={16} /></a><a href="#about" onClick={() => setMenuOpen(false)}>About the studio <ArrowRight size={16} /></a><button type="button" onClick={() => setMenuOpen(false)}>List your studio <ArrowRight size={16} /></button></div>}

      {profile?.banner_url && <section className="booking-banner" aria-label={`${businessName} studio banner`}><img src={profile.banner_url} alt="" /><div className="booking-banner-overlay"><div><p>{profile.industry || ""}</p><h2>{businessName}</h2><span>{businessAddress}{businessLocation && businessAddress !== businessLocation ? ` · ${businessLocation}` : ""}</span>{businessPhone && <small><Phone size={13} /> {businessPhone}</small>}</div><a href="#choose-service">Book now <ArrowRight size={15} /></a></div></section>}

      <div className={`booking-layout ${step === 2 ? "date-time-layout" : ""}`}>
        <aside className="booking-business-panel">
          <div className="business-identity"><div className="business-avatar">{profile?.logo_url ? <img src={profile.logo_url} alt="" /> : businessInitial}</div><div>
          <p className="booking-eyebrow">You’re booking with</p>
          <h1>{businessName}</h1></div></div>
          <p className="business-description">{businessAbout}</p>
          <div className="business-meta"><Clock3 size={16} /> <span>Mon–Sat · 9:00 AM–6:00 PM</span></div>
          <div className="business-rating"><span className="rating-stars">★★★★★</span><strong>5.0</strong><span>Guest rating</span></div>
          <div className="schedule-control"><button type="button" className="schedule-trigger" aria-expanded={scheduleOpen} onClick={() => setScheduleOpen((open) => !open)}><span><Clock3 size={16} /> <strong>{todaySummary}</strong></span><ChevronDown size={16} className={scheduleOpen ? "rotated" : ""} /></button>{scheduleOpen && <div className="schedule-dropdown">{schedule.length ? schedule.map((item) => <div className={`schedule-row ${item.day.toLowerCase() === todayName.toLowerCase() ? "today" : ""}`} key={item.day}><span>{item.day}{item.day.toLowerCase() === todayName.toLowerCase() ? " · Today" : ""}</span><strong>{item.open ? `${formatScheduleTime(item.start)} – ${formatScheduleTime(item.end)}` : "Closed"}</strong></div>) : <p className="schedule-empty">Hours haven’t been added yet.</p>}</div>}</div>
          <div className="business-divider" />
          <section className="booking-policy-card" aria-labelledby="booking-policy-title"><div className="policy-heading"><Sparkles size={15} /><h2 id="booking-policy-title">Booking policy</h2></div><ul>{bookingPolicies.map((policy) => <li key={policy}>{policy}</li>)}</ul></section>
          <p className="business-note"><Sparkles size={16} /> Appointments are held for 10 minutes.</p>
        </aside>

        <section className={`booking-card ${step === 1 ? "service-selection-card" : ""}`} aria-labelledby="choose-service">

          {step === 1 && (
            <div className="booking-step">
              <div className="step-heading"><div className="step-icon"><Scissors size={19} /></div><div><p className="booking-kicker">{businessName}</p><h2 id="choose-service">Choose a service</h2><p>Select what you’d like to book.</p></div></div>
              <div className="service-list" role="radiogroup" aria-label="Available services">
                {serviceGroups.length ? serviceGroups.map((group) => <section className="service-category-group" key={group.name || "uncategorized"} aria-label={group.name || "Available services"}>
                  {group.name && <h3>{group.name}</h3>}
                  {group.services.map((service) => <button key={service.id} className={`service-option ${serviceId === service.id ? "selected" : ""}`} type="button" role="radio" aria-checked={serviceId === service.id} onClick={() => setServiceId(service.id)}>
                    {service.image ? <img className="service-image" src={service.image} alt="" /> : <span className="service-image service-image-placeholder"><Sparkles size={16} /></span>}
                    <span className="service-copy"><strong>{service.name}</strong><small><Clock3 size={13} /> {service.duration}</small></span>
                    <span className="service-price">{service.price}<span className="radio-indicator">{serviceId === service.id && <Check size={14} />}</span></span>
                  </button>)}
                </section>) : <p className="services-empty">No services are available for online booking yet.</p>}
              </div>
              <div className="booking-actions"><span className="secure-note">No payment required</span><button className="booking-primary" type="button" disabled={!canContinue} onClick={() => setStep(2)}>Continue <ArrowRight size={17} /></button></div>
            </div>
          )}

          {step === 2 && (
            <div className="booking-step">
              <button className="booking-back" type="button" onClick={() => setStep(1)}><ChevronLeft size={16} /> Back to services</button>
              <div className="step-heading"><div className="step-icon"><CalendarDays size={19} /></div><div><p className="booking-kicker">{selectedService?.name}</p><h2>Pick a date & time</h2><p>All times are shown in Philippine time.</p></div></div>
              <div className="calendar-picker" aria-label="Choose an appointment date">
                <div className="calendar-toolbar"><strong>{calendarMonthLabel}</strong><div><button type="button" aria-label="Previous month" disabled={calendarMonth.getTime() <= new Date(`${todayKey}T00:00:00Z`).setUTCDate(1)} onClick={() => setCalendarMonth((month) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))}><ChevronLeft size={15} /></button><button type="button" aria-label="Next month" onClick={() => setCalendarMonth((month) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))}><ChevronRight size={15} /></button></div></div>
                <div className="calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
                <div className="calendar-grid">{calendarDays.map((day) => { const disabled = day.key < todayKey; return <button key={day.key} type="button" className={`calendar-day ${day.currentMonth ? "" : "outside-month"} ${selectedDateKey === day.key ? "selected" : ""} ${day.key === todayKey ? "today" : ""}`} disabled={disabled} onClick={() => { setSelectedDateKey(day.key); setTime("") }}><span>{day.date.getUTCDate()}</span></button> })}</div>
              </div>
              <div className="time-section"><div className="subsection-heading"><span>Available times</span><small>{selectedDate.day}, {selectedDate.month} {selectedDate.date}</small></div><div className="time-grid">{timeSlots.map((slot) => <button key={slot} className={`time-option ${time === slot ? "selected" : ""}`} type="button" onClick={() => setTime(slot)}>{slot}</button>)}</div></div>
              <div className="booking-actions"><span className="secure-note"><CalendarDays size={14} /> Free cancellation up to 24 hours before</span><button className="booking-primary" type="button" disabled={!canContinue} onClick={() => setStep(3)}>Continue <ArrowRight size={17} /></button></div>
            </div>
          )}

          {step === 3 && (
            <div className="booking-step">
              <button className="booking-back" type="button" onClick={() => setStep(2)}><ChevronLeft size={16} /> Back to date & time</button>
              <div className="step-heading"><div className="step-icon"><UserRound size={19} /></div><div><p className="booking-kicker">Almost there</p><h2>Your details</h2><p>We’ll use these to confirm your appointment.</p></div></div>
              <form className="details-form" onSubmit={(event) => { event.preventDefault(); if (canContinue) setStep(4) }}>
                <label>Full name<input autoComplete="name" value={details.name} onChange={(event) => updateDetail("name", event.target.value)} placeholder="e.g. Maria Santos" /></label>
                <div className="field-row"><label>Email address<input type="email" autoComplete="email" value={details.email} onChange={(event) => updateDetail("email", event.target.value)} placeholder="you@example.com" /></label><label>Mobile number<input type="tel" autoComplete="tel" value={details.phone} onChange={(event) => updateDetail("phone", event.target.value)} placeholder="09XX XXX XXXX" /></label></div>
                <label>Anything we should know? <span className="optional">Optional</span><textarea value={details.note} onChange={(event) => updateDetail("note", event.target.value)} placeholder="Allergies, preferences, or a special request" rows={3} /></label>
                <div className="booking-summary"><div><span>Appointment</span><strong>{selectedService?.name}</strong></div><div><span>When</span><strong>{selectedDate.day}, {selectedDate.month} {selectedDate.date} · {time}</strong></div><div><span>Price</span><strong>{selectedService?.price}</strong></div></div>
                <div className="booking-actions"><span className="secure-note">Your information is kept private</span><button className="booking-primary" type="submit" disabled={!canContinue}>Review booking <ArrowRight size={17} /></button></div>
              </form>
            </div>
          )}

          {step === 4 && <div className="booking-success"><div className="success-check"><Check size={28} /></div><p className="booking-kicker">You’re all set</p><h2>Appointment requested</h2><p className="success-copy">We’ve sent a confirmation to <strong>{details.email}</strong>. {businessName} will see you soon.</p><div className="confirmed-card"><div className="confirmed-date"><span>{selectedDate.month}</span><strong>{selectedDate.date}</strong></div><div><strong>{selectedService?.name}</strong><span>{selectedDate.day}, {selectedDate.month} {selectedDate.date} · {time}</span><span>{businessName} · {businessLocation}</span></div></div><button className="booking-secondary" type="button" onClick={() => { setStep(1); setServiceId(""); setTime("") }}>Book another appointment</button><p className="success-footer"><Mail size={15} /> Need to make a change? Reply to your confirmation email.</p></div>}
        </section>
      </div>

      <section className="booking-discovery" id="services" aria-labelledby="services-title">
        <div className="section-intro"><div><p className="booking-eyebrow">A little time for you</p><h2 id="services-title">Treatments people love</h2></div><a href="#choose-service">Explore all services <ArrowRight size={15} /></a></div>
        <div className="service-gallery">
          <article className="gallery-card gallery-card-featured"><div className="gallery-visual visual-gloss"><span className="visual-label">Most booked</span><button aria-label="Save gel manicure" type="button"><Heart size={17} /></button><div className="visual-nail-art"><i /><i /><i /><i /></div></div><div className="gallery-card-copy"><div><strong>Gel manicure</strong><span>45 min · ₱650</span></div><span className="rating"><Star size={13} fill="currentColor" /> 4.98</span></div></article>
          <article className="gallery-card"><div className="gallery-visual visual-peach"><button aria-label="Save classic manicure" type="button"><Heart size={17} /></button><div className="visual-bottle"><b>n</b><span>NICΛ</span></div></div><div className="gallery-card-copy"><div><strong>Classic manicure</strong><span>35 min · ₱450</span></div><span className="rating"><Star size={13} fill="currentColor" /> 4.96</span></div></article>
          <article className="gallery-card"><div className="gallery-visual visual-sage"><button aria-label="Save gel extensions" type="button"><Heart size={17} /></button><div className="visual-hand"><span /><span /><span /></div></div><div className="gallery-card-copy"><div><strong>Gel extensions</strong><span>1 hr 30 min · ₱1,250</span></div><span className="rating"><Star size={13} fill="currentColor" /> 5.0</span></div></article>
          <article className="gallery-card"><div className="gallery-visual visual-lilac"><button aria-label="Save nail art" type="button"><Heart size={17} /></button><div className="visual-sparkle"><Sparkles size={43} /></div></div><div className="gallery-card-copy"><div><strong>Signature nail art</strong><span>1 hr · from ₱850</span></div><span className="rating"><Star size={13} fill="currentColor" /> 4.94</span></div></article>
        </div>
      </section>

      <section className="studio-story" id="about" aria-labelledby="about-title"><div className="story-collage"><div className="story-tile story-main"><span>slow beauty<br />for busy days</span></div><div className="story-tile story-small one"><Scissors size={23} /></div><div className="story-tile story-small two"><Sparkles size={23} /></div></div><div className="story-copy"><p className="booking-eyebrow">The studio</p><h2 id="about-title">A softer way to get ready.</h2><p>Nails by Nica is a tiny neighborhood studio built around thoughtful details, unrushed appointments, and leaving with hands you can’t stop looking at.</p><div className="story-stats"><span><strong>5.0</strong><small>guest rating</small></span><span><strong>2k+</strong><small>appointments</small></span><span><strong>4 yrs</strong><small>in Quezon City</small></span></div></div></section>

      <section className="team-section" id="team" aria-labelledby="team-title"><div className="section-intro"><div><p className="booking-eyebrow">Meet your artist</p><h2 id="team-title">Good hands, good energy</h2></div><a href="#choose-service">Choose your artist <ArrowRight size={15} /></a></div><div className="team-grid"><article className="team-card"><div className="team-avatar team-nica">N</div><strong>Nica Santos</strong><span>Founder · nail artist</span><small><Star size={12} fill="currentColor" /> 5.0 · 412 reviews</small></article><article className="team-card"><div className="team-avatar team-zoe">Z</div><strong>Zoe Ramirez</strong><span>Gel specialist</span><small><Star size={12} fill="currentColor" /> 4.98 · 286 reviews</small></article><article className="team-card"><div className="team-avatar team-mika">M</div><strong>Mika Dela Cruz</strong><span>Nail art specialist</span><small><Star size={12} fill="currentColor" /> 4.96 · 198 reviews</small></article></div></section>

      <section className="reviews-section" id="reviews" aria-labelledby="reviews-title"><div className="review-heading"><p className="booking-eyebrow">Loved by the neighborhood</p><h2 id="reviews-title">Small details.<br />Big feeling.</h2><div className="review-score"><strong>4.98</strong><span><span className="review-stars">★★★★★</span> <small>896 reviews</small></span></div></div><div className="review-quotes"><blockquote>“The calmest nail appointment I’ve ever had. Nica understood exactly what I wanted.”<footer>— Andrea M.</footer></blockquote><blockquote>“Beautiful work, kind people, and the studio smells amazing. Already booked my next visit.”<footer>— Camille R.</footer></blockquote></div></section>

      <footer className="booking-footer"><span>Powered by <strong>bookora</strong></span><a href="#services">Services</a><a href="#team">Team</a><a href="#reviews">Reviews</a><a href="#privacy">Privacy</a><a href="#terms">Terms</a></footer>
    </main>
  )
}
