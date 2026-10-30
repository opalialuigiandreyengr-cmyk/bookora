import { useEffect, useMemo, useState } from "react"
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  Image as ImageIcon,
  LogIn,
  Map,
  MapPin,
  MoreVertical,
  ReceiptText,
  Tag,
  Trash2,
  UserRound,
} from "lucide-react"
import { showToast } from "@/components/ui/toast"

export type CustomerBooking = {
  id: string
  customer_name: string
  customer_email: string
  service_names: string
  appointment_date: string
  appointment_time: string
  duration_minutes?: number | null
  total_price: string
  status: string
  customer_note?: string | null
  peg_image_url?: string | null
  payment_receipt_url?: string | null
  created_at: string
}

type MyBookingsPageProps = {
  businessName: string
  businessSlug?: string | null
  businessIndustry?: string | null
  businessLocation: string
  businessCountry?: string | null
  businessAddress?: string | null
  ownerName: string
  businessLogo?: string | null
  customerEmail?: string | null
  bookings: CustomerBooking[]
  loading?: boolean
  darkMode?: boolean
  onBack: () => void
  onBookNew: () => void
  onSignIn: () => void
  onReschedule?: (booking: CustomerBooking) => void
  onCancelBooking?: (bookingId: string) => Promise<void> | void
}

export function MyBookingsSkeleton({ darkMode = false }: { darkMode?: boolean }) {
  return (
    <main
      className={`customer-booking-page my-bookings-page is-list-view my-bookings-skeleton ${darkMode ? "booking-dark" : ""}`}
      aria-busy="true"
      aria-label="Loading your bookings"
    >
      <div className="my-bookings-shell">
        <header className="my-bookings-topbar">
          <div className="my-bookings-brand-btn" aria-hidden="true">
            <span className="booking-skeleton-block my-bookings-skel-logo" />
            <span className="booking-skeleton-block my-bookings-skel-brand" />
          </div>
          <span className="booking-skeleton-circle my-bookings-skel-avatar" aria-hidden="true" />
        </header>

        <section className="my-bookings-list-section" aria-hidden="true">
          <div className="my-bookings-heading-stack">
            <span className="booking-skeleton-block my-bookings-skel-kicker" />
            <span className="booking-skeleton-block my-bookings-skel-title" />
            <span className="booking-skeleton-block my-bookings-skel-subtitle" />
          </div>

          <div className="my-bookings-tabs my-bookings-skel-tabs">
            <span className="booking-skeleton-block my-bookings-skel-tab" />
            <span className="booking-skeleton-block my-bookings-skel-tab" />
            <span className="booking-skeleton-block my-bookings-skel-tab" />
          </div>

          <div className="my-bookings-cards">
            {[1, 2, 3].map((item) => (
              <div className="my-booking-list-card my-booking-skel-card" key={item}>
                <span className="booking-skeleton-block my-booking-skel-date" />
                <div className="my-booking-list-card-main">
                  <div className="my-booking-list-card-head">
                    <span className="booking-skeleton-block my-booking-skel-service" />
                    <span className="booking-skeleton-block my-booking-skel-pill" />
                  </div>
                  <div className="my-booking-list-meta">
                    <span className="booking-skeleton-block my-booking-skel-line" />
                    <span className="booking-skeleton-block my-booking-skel-line is-short" />
                    <span className="booking-skeleton-block my-booking-skel-line is-medium" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

type BookingTab = "upcoming" | "past" | "cancelled"

const cleanCustomerNote = (note?: string | null) => {
  if (!note) return ""
  return note
    .replace(/\s*\[(?:Peg|Payment Receipt|Receipt) (?:Reference|Storage) Path:[^\]]+\]/gi, "")
    .split(/\r?\n/)
    .filter((line) => !/^\[(?:Peg|Payment Receipt|Receipt) (?:Reference|Storage) Path:/i.test(line.trim()))
    .filter((line) => !/^\[(?:Peg|Payment Receipt|Receipt) Attached:/i.test(line.trim()))
    .join(" ")
    .trim()
}

const getTodayKeyManila = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>
  return `${parts.year}-${parts.month}-${parts.day}`
}

const parseDateBadge = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number)
  if (!year || !month || !day) {
    return { month: "OCT", day: "28", weekday: "WED", fullDate: dateKey }
  }
  const utcDate = new Date(Date.UTC(year, month - 1, day))
  const monthShort = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
    .format(utcDate)
    .toUpperCase()
  const weekdayShort = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" })
    .format(utcDate)
    .toUpperCase()
  const fullDate = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcDate)

  return {
    month: monthShort,
    day: String(day).padStart(2, "0"),
    weekday: weekdayShort,
    fullDate,
  }
}

const timeToMinutes = (value: string) => {
  const match = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!match) return -1
  let hour = Number(match[1]) % 12
  if (match[3].toUpperCase() === "PM") hour += 12
  return hour * 60 + Number(match[2])
}

const formatTime = (minutes: number) => {
  const hour = Math.floor(minutes / 60) % 24
  const suffix = hour >= 12 ? "PM" : "AM"
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${suffix}`
}

const formatTimeRange = (value: string, durationMinutes?: number | null) => {
  if (/\s[–-]\s/.test(value)) return value.trim()
  const start = timeToMinutes(value)
  if (start < 0) return value
  return `${formatTime(start)} – ${formatTime(start + Math.max(5, Number(durationMinutes || 30)))}`
}

const getNormalizedStatus = (status?: string | null): "approved" | "cancelled" => {
  const raw = String(status || "approved").trim().toLowerCase()
  if (["cancelled", "canceled", "declined", "rejected"].includes(raw)) return "cancelled"
  return "approved"
}

export function MyBookingsPage({
  businessName,
  businessSlug,
  businessIndustry,
  businessLocation,
  businessCountry,
  businessAddress,
  ownerName,
  businessLogo,
  customerEmail,
  bookings,
  loading = false,
  darkMode = false,
  onBack,
  onBookNew,
  onSignIn,
  onReschedule,
  onCancelBooking,
}: MyBookingsPageProps) {
  const [activeTab, setActiveTab] = useState<BookingTab>("upcoming")
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [entryLoading, setEntryLoading] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => setEntryLoading(false), 420)
    return () => window.clearTimeout(timer)
  }, [])

  const todayKey = useMemo(() => getTodayKeyManila(), [])
  const brandLabel = businessSlug || businessName
  const studioLocationTitle = businessLocation ? `${brandLabel} – ${businessLocation}` : brandLabel
  const studioLocationSub = useMemo(() => {
    if (businessLocation && businessCountry) return `${businessLocation}, ${businessCountry}`
    if (businessLocation) return `${businessLocation}, Philippines`
    if (businessAddress) return businessAddress
    return "Studio Location"
  }, [businessAddress, businessCountry, businessLocation])

  const serviceCategoryLabel = useMemo(() => {
    const raw = businessIndustry?.trim() || ""
    if (/nail|gel|manicure|pedicure/i.test(raw) || /nail|gel|manicure|pedicure/i.test(businessName)) {
      return "Nail Service"
    }
    if (raw) {
      return raw
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase())
    }
    return "Nail Service"
  }, [businessIndustry, businessName])

  // Categorize bookings into Upcoming, Past, and Cancelled
  const { upcomingBookings, pastBookings, cancelledBookings } = useMemo(() => {
    const upcoming: CustomerBooking[] = []
    const past: CustomerBooking[] = []
    const cancelled: CustomerBooking[] = []

    const sorted = [...bookings].sort((a, b) => {
      if (a.appointment_date !== b.appointment_date) {
        return a.appointment_date.localeCompare(b.appointment_date)
      }
      return timeToMinutes(a.appointment_time) - timeToMinutes(b.appointment_time)
    })

    for (const item of sorted) {
      const normStatus = getNormalizedStatus(item.status)
      const isCompleted = String(item.status || "").toLowerCase() === "completed"
      if (normStatus === "cancelled") {
        cancelled.push(item)
      } else if (isCompleted || (item.appointment_date && item.appointment_date < todayKey)) {
        past.push(item)
      } else {
        upcoming.push(item)
      }
    }

    // Show most recent past bookings first
    past.reverse()
    cancelled.reverse()

    return {
      upcomingBookings: upcoming,
      pastBookings: past,
      cancelledBookings: cancelled,
    }
  }, [bookings, todayKey])

  const visibleBookings =
    activeTab === "upcoming"
      ? upcomingBookings
      : activeTab === "past"
        ? pastBookings
        : cancelledBookings

  const selectedBooking = useMemo(
    () => bookings.find((b) => b.id === selectedBookingId) || null,
    [bookings, selectedBookingId],
  )

  useEffect(() => {
    setConfirmingCancelId(null)
    setMoreMenuOpen(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [selectedBookingId])

  const handleCopyBookingId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id)
      showToast("Booking ID copied to clipboard")
    } catch {
      showToast("Booking ID: " + id)
    }
  }

  const handleCancelAppointment = async (booking: CustomerBooking) => {
    if (confirmingCancelId !== booking.id) {
      setConfirmingCancelId(booking.id)
      return
    }
    setCancellingId(booking.id)
    try {
      await onCancelBooking?.(booking.id)
      setConfirmingCancelId(null)
    } finally {
      setCancellingId(null)
    }
  }

  const mapQuery = encodeURIComponent(
    [businessAddress, businessLocation, businessCountry || "Philippines"].filter(Boolean).join(", ") || businessName,
  )
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`

  if (loading || entryLoading) {
    return <MyBookingsSkeleton darkMode={darkMode} />
  }

  // ============================================================================
  // VIEW 2: BOOKING DETAILS VIEW (Image 2)
  // ============================================================================
  if (selectedBooking) {
    const badge = parseDateBadge(selectedBooking.appointment_date)
    const statusKind = getNormalizedStatus(selectedBooking.status)
    const statusLabel =
      statusKind === "approved" ? "CONFIRMED" : statusKind === "cancelled" ? "CANCELLED" : "PENDING"
    const note = cleanCustomerNote(selectedBooking.customer_note)

    return (
      <main className={`customer-booking-page my-bookings-page is-detail-view ${darkMode ? "booking-dark" : ""}`}>
        <div className="my-bookings-shell">
          {/* Detail Top Navigation */}
          <header className="my-booking-detail-topbar">
            <button
              type="button"
              className="my-booking-detail-back"
              onClick={() => setSelectedBookingId(null)}
            >
              <ChevronLeft size={20} />
              <span>My Bookings</span>
            </button>

            <div className="my-booking-detail-menu-wrap">
              <button
                type="button"
                className="my-booking-detail-more"
                aria-label="More booking options"
                aria-expanded={moreMenuOpen}
                onClick={() => setMoreMenuOpen((prev) => !prev)}
              >
                <MoreVertical size={18} />
              </button>
              {moreMenuOpen && (
                <div className="my-booking-more-dropdown" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreMenuOpen(false)
                      handleCopyBookingId(selectedBooking.id)
                    }}
                  >
                    <Copy size={14} /> Copy Booking ID
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreMenuOpen(false)
                      onBookNew()
                    }}
                  >
                    <CalendarDays size={14} /> Book New Appointment
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreMenuOpen(false)
                      onBack()
                    }}
                  >
                    <ChevronLeft size={14} /> Back to {brandLabel}
                  </button>
                </div>
              )}
            </div>
          </header>

          {/* Soft Blush Hero Banner */}
          <section className="my-booking-detail-hero" aria-label="Appointment summary">
            <div className="my-booking-detail-hero-row">
              <div className="my-booking-date-badge is-large" aria-hidden="true">
                <span className="my-booking-date-month">{badge.month}</span>
                <strong className="my-booking-date-day">{badge.day}</strong>
                <small className="my-booking-date-weekday">{badge.weekday}</small>
              </div>

              <div className="my-booking-detail-hero-copy">
                <span className={`my-booking-status-pill is-${statusKind} has-check`}>
                  {statusKind === "approved" && <Check size={10} strokeWidth={2.8} />}
                  {statusLabel}
                </span>
                <h1 className="my-booking-detail-title">{selectedBooking.service_names}</h1>
                <div className="my-booking-detail-subrow">
                  <p className="my-booking-detail-subtitle">{serviceCategoryLabel}</p>
                  <strong className="my-booking-detail-price">{selectedBooking.total_price}</strong>
                </div>
              </div>
            </div>
          </section>

          {/* Main Details Body */}
          <div className="my-booking-detail-body">
            <section className="my-booking-info-card" aria-label="Booking details">
              {/* Row 1: Date & Time */}
              <div className="my-booking-info-row">
                <div className="my-booking-info-icon">
                  <CalendarDays size={16} />
                </div>
                <div className="my-booking-info-text">
                  <span className="my-booking-info-label">Date &amp; Time</span>
                  <strong className="my-booking-info-primary">{badge.fullDate}</strong>
                  <span className="my-booking-info-secondary">
                    {formatTimeRange(selectedBooking.appointment_time, selectedBooking.duration_minutes)}
                  </span>
                </div>
              </div>

              {/* Row 2: With */}
              <div className="my-booking-info-row">
                <div className="my-booking-info-icon">
                  <UserRound size={16} />
                </div>
                <div className="my-booking-info-text">
                  <span className="my-booking-info-label">With</span>
                  <strong className="my-booking-info-primary">{ownerName || "Studio Artist"}</strong>
                </div>
              </div>

              {/* Row 3: Estimated Total */}
              <div className="my-booking-info-row">
                <div className="my-booking-info-icon">
                  <Tag size={16} />
                </div>
                <div className="my-booking-info-text">
                  <span className="my-booking-info-label">Estimated Total</span>
                  <strong className="my-booking-info-primary">{selectedBooking.total_price}</strong>
                </div>
              </div>

              {/* Row 4: Location + View Map */}
              <div className="my-booking-info-row is-location-row">
                <div className="my-booking-info-icon">
                  <MapPin size={16} />
                </div>
                <div className="my-booking-info-text">
                  <span className="my-booking-info-label">Location</span>
                  <strong className="my-booking-info-primary">{studioLocationTitle}</strong>
                  <span className="my-booking-info-secondary">{studioLocationSub}</span>
                </div>
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="my-booking-view-map-btn"
                >
                  <Map size={12} />
                  <span>View Map</span>
                </a>
              </div>

              {/* Optional Customer Note or Attachments */}
              {note && (
                <div className="my-booking-info-extra">
                  <span className="my-booking-info-label">Client Note</span>
                  <p className="my-booking-note-box">{note}</p>
                </div>
              )}

              {(selectedBooking.peg_image_url || selectedBooking.payment_receipt_url) && (
                <div className="my-booking-info-extra">
                  <span className="my-booking-info-label">Attachments</span>
                  <div className="my-bookings-attachments">
                    {selectedBooking.peg_image_url && (
                      <a href={selectedBooking.peg_image_url} target="_blank" rel="noreferrer">
                        <img src={selectedBooking.peg_image_url} alt="Attached design peg" />
                        <span>
                          <ImageIcon size={12} /> Design peg
                        </span>
                      </a>
                    )}
                    {selectedBooking.payment_receipt_url && (
                      <a href={selectedBooking.payment_receipt_url} target="_blank" rel="noreferrer">
                        <img src={selectedBooking.payment_receipt_url} alt="Attached payment receipt" />
                        <span>
                          <ReceiptText size={12} /> Payment receipt
                        </span>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Booking ID Bar */}
            <div className="my-booking-id-bar">
              <div className="my-booking-id-file-icon">
                <FileText size={18} />
              </div>
              <div className="my-booking-id-copy-text">
                <span>Booking ID</span>
                <strong>{selectedBooking.id}</strong>
              </div>
              <button
                type="button"
                className="my-booking-id-copy-btn"
                onClick={() => handleCopyBookingId(selectedBooking.id)}
                aria-label="Copy Booking ID"
                title="Copy Booking ID"
              >
                <Copy size={16} />
              </button>
            </div>

            {/* Action Buttons */}
            <div className="my-booking-detail-actions">
              <button
                type="button"
                className="my-booking-reschedule-btn"
                onClick={() => {
                  if (onReschedule) {
                    onReschedule(selectedBooking)
                  } else {
                    onBookNew()
                  }
                }}
              >
                <CalendarDays size={17} />
                <span>Reschedule</span>
              </button>

              {statusKind !== "cancelled" && (
                <button
                  type="button"
                  className={`my-booking-cancel-btn ${confirmingCancelId === selectedBooking.id ? "is-confirming" : ""}`}
                  disabled={cancellingId === selectedBooking.id}
                  onClick={() => handleCancelAppointment(selectedBooking)}
                >
                  <Trash2 size={17} />
                  <span>
                    {cancellingId === selectedBooking.id
                      ? "Cancelling..."
                      : confirmingCancelId === selectedBooking.id
                        ? "Tap again to confirm cancel"
                        : "Cancel Booking"}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    )
  }

  // ============================================================================
  // VIEW 1: BOOKINGS LIST VIEW (Image 1)
  // ============================================================================
  return (
    <main className={`customer-booking-page my-bookings-page is-list-view ${darkMode ? "booking-dark" : ""}`}>
      <div className="my-bookings-shell">
        {/* Top Studio Header */}
        <header className="my-bookings-topbar">
          <button
            type="button"
            className="my-bookings-brand-btn"
            onClick={onBack}
            aria-label={`Back to ${businessName} booking page`}
          >
            {businessLogo ? (
              <img className="my-bookings-brand-logo" src={businessLogo} alt="" />
            ) : (
              <span className="my-bookings-brand-mark">
                {businessName.trim().charAt(0).toUpperCase() || "B"}
              </span>
            )}
            <span className="my-bookings-brand-name">{brandLabel}</span>
          </button>

          <button
            type="button"
            className="my-bookings-profile-btn"
            onClick={customerEmail ? onBack : onSignIn}
            aria-label={customerEmail ? "Back to booking page" : "Sign in"}
            title={customerEmail ? `Signed in as ${customerEmail}` : "Sign in"}
          >
            <UserRound size={18} />
          </button>
        </header>

        {/* Main Content */}
        <section className="my-bookings-list-section" aria-labelledby="my-bookings-title">
          <div className="my-bookings-heading-stack">
            <p className="my-bookings-kicker">YOUR APPOINTMENTS</p>
            <h1 id="my-bookings-title">My Bookings</h1>
            <p className="my-bookings-subtitle">Manage and view all your appointments</p>
          </div>

          {/* Segmented Filter Tabs */}
          <div className="my-bookings-tabs" role="tablist" aria-label="Filter appointments">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "upcoming"}
              className={`my-bookings-tab ${activeTab === "upcoming" ? "is-active" : ""}`}
              onClick={() => setActiveTab("upcoming")}
            >
              Upcoming ({upcomingBookings.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "past"}
              className={`my-bookings-tab ${activeTab === "past" ? "is-active" : ""}`}
              onClick={() => setActiveTab("past")}
            >
              Past ({pastBookings.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "cancelled"}
              className={`my-bookings-tab ${activeTab === "cancelled" ? "is-active" : ""}`}
              onClick={() => setActiveTab("cancelled")}
            >
              Cancelled ({cancelledBookings.length})
            </button>
          </div>

          {!customerEmail && bookings.length === 0 ? (
            <div className="my-bookings-empty">
              <LogIn size={24} />
              <h2>Sign in to view your bookings</h2>
              <p>Your appointments will be available here on any device when you sign in.</p>
              <button type="button" className="booking-primary" onClick={onSignIn}>
                Sign in to continue
              </button>
            </div>
          ) : visibleBookings.length > 0 ? (
            <div className="my-bookings-cards" aria-label={`${activeTab} appointments`}>
              {visibleBookings.map((booking, index) => {
                const badge = parseDateBadge(booking.appointment_date)
                const statusKind = getNormalizedStatus(booking.status)
                const statusLabel =
                  statusKind === "approved"
                    ? "CONFIRMED"
                    : statusKind === "cancelled"
                      ? "CANCELLED"
                      : "PENDING"

                return (
                  <button
                    type="button"
                    key={booking.id}
                    className={`my-booking-list-card ${index === 0 && activeTab === "upcoming" ? "is-featured" : ""}`}
                    onClick={() => setSelectedBookingId(booking.id)}
                  >
                    {/* Left Calendar Date Badge */}
                    <div className="my-booking-date-badge" aria-hidden="true">
                      <span className="my-booking-date-month">{badge.month}</span>
                      <strong className="my-booking-date-day">{badge.day}</strong>
                      <small className="my-booking-date-weekday">{badge.weekday}</small>
                    </div>

                    {/* Center Service & Meta Info */}
                    <div className="my-booking-list-card-main">
                      <div className="my-booking-list-card-head">
                        <strong className="my-booking-list-service">{booking.service_names}</strong>
                        <span className={`my-booking-status-pill is-${statusKind}`}>
                          {statusLabel}
                        </span>
                      </div>

                      <div className="my-booking-list-card-bottom">
                        <div className="my-booking-list-meta">
                          <span>
                            <Clock3 size={13} />
                            {formatTimeRange(booking.appointment_time, booking.duration_minutes)}
                          </span>
                          <span>
                            <UserRound size={13} />
                            {ownerName || "Studio Artist"}
                          </span>
                          <span>
                            <MapPin size={13} />
                            {studioLocationTitle}
                          </span>
                        </div>
                        <ChevronRight size={17} className="my-booking-list-arrow" />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="my-bookings-empty">
              <CalendarDays size={24} />
              <h2>No {activeTab} appointments</h2>
              <p>
                {activeTab === "upcoming"
                  ? "You don’t have any upcoming appointments scheduled right now."
                  : activeTab === "past"
                    ? "Your completed past appointments will appear here."
                    : "You don’t have any cancelled appointments."}
              </p>
              {activeTab === "upcoming" && (
                <button type="button" className="booking-primary" onClick={onBookNew}>
                  Book an appointment
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
