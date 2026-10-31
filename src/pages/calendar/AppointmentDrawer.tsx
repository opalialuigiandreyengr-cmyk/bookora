import { useEffect, useRef, useState } from "react"
import { CalendarDays, CheckCircle2, ChevronLeft, Clock3, Copy, ExternalLink, FileText, Loader2, Mail, MapPin, MoreVertical, Pencil, Phone, Scissors, Tag, Trash2, X, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CalendarAppointment, getInitials, parseDateKey } from "./types"
import { supabase } from "@/lib/supabase"
import { showToast } from "@/components/ui/toast"

interface AppointmentDrawerProps {
  appointment: CalendarAppointment | null
  onClose: () => void
  onUpdateStatus: (id: string, status: CalendarAppointment["status"], noShowReason?: string) => Promise<void>
  onReschedule: (appointment: CalendarAppointment) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function AppointmentDrawer({
  appointment,
  onClose,
  onUpdateStatus,
  onReschedule,
  onDelete,
}: AppointmentDrawerProps) {
  const drawerRef = useRef<HTMLElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [attachmentUrls, setAttachmentUrls] = useState<{ peg: string; receipt: string }>({ peg: "", receipt: "" })
  const [selectedAttachment, setSelectedAttachment] = useState<{ url: string; label: string } | null>(null)
  const [confirmAction, setConfirmAction] = useState<"approve" | "cancel" | null>(null)
  const [cancelConfirmation, setCancelConfirmation] = useState("")
  const [statusUpdating, setStatusUpdating] = useState(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    setConfirmAction(null)
    setCancelConfirmation("")
    setStatusUpdating(false)
    setMenuOpen(false)
  }, [appointment?.id])

  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [menuOpen])

  useEffect(() => {
    if (!appointment) return
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const drawer = drawerRef.current
    const focusable = () => Array.from(drawer?.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])") || []).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true")
    const firstFocusable = focusable()[0]
    firstFocusable?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return }
      if (event.key !== "Tab") return
      const elements = focusable()
      if (!elements.length) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      returnFocusRef.current?.focus()
      returnFocusRef.current = null
    }
  }, [appointment])

  useEffect(() => {
    if (!selectedAttachment) return
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedAttachment(null) }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [selectedAttachment])

  useEffect(() => {
    let active = true
    const loadAttachments = async () => {
      if (!appointment) { setAttachmentUrls({ peg: "", receipt: "" }); return }
      const note = appointment.customer_note || ""
      const pegPath = appointment.peg_image_path || note.match(/\[Peg Storage Path:\s*([^\]]+)\]/i)?.[1]?.trim() || ""
      const receiptPath = appointment.payment_receipt_path || note.match(/\[(?:Payment )?Receipt Storage Path:\s*([^\]]+)\]/i)?.[1]?.trim() || ""
      const resolve = async (path: string) => {
        if (!path) return ""
        if (/^(https?:\/\/|data:image\/)/i.test(path)) return path
        if (!supabase) return ""
        const result = await supabase.storage.from("booking-attachments").createSignedUrl(path, 3600)
        return result.data?.signedUrl || ""
      }
      const [peg, receipt] = await Promise.all([resolve(pegPath), resolve(receiptPath)])
      if (active) setAttachmentUrls({ peg, receipt })
    }
    void loadAttachments()
    return () => { active = false }
  }, [appointment])

  if (!appointment) return null

  const dateObj = parseDateKey(appointment.appointment_date)
  const formattedDate = dateObj.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  })

  const statusLabel =
    appointment.status === "completed"
      ? "Completed"
      : appointment.status === "cancelled"
      ? "Cancelled"
      : appointment.status === "no_show"
      ? "No-show"
      : appointment.status === "pending"
      ? "Pending"
      : "Approved"
  const cleanCustomerNote = (appointment.customer_note || "")
    .replace(/\s*\[(?:Peg|Payment )?Storage Path:\s*[^\]]+\]/gi, "")
    .replace(/\s*\[(?:Paid in Full|Deposit):\s*[^\]]+\]/gi, "")
    .trim()

  const requestStatusChange = (action: "approve" | "cancel") => {
    if (statusUpdating) return
    setCancelConfirmation("")
    setConfirmAction(action)
  }

  const confirmStatusChange = async () => {
    if (!confirmAction || statusUpdating) return
    if (confirmAction === "cancel" && cancelConfirmation.trim().toUpperCase() !== "YES") return
    setStatusUpdating(true)
    try {
      await onUpdateStatus(appointment.id, confirmAction === "approve" ? "approved" : "cancelled")
      setConfirmAction(null)
      setCancelConfirmation("")
    } finally {
      setStatusUpdating(false)
    }
  }

  return (
    <div
      className="cal-drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose()
      }}
    >
      <aside ref={drawerRef} className="cal-drawer" role="dialog" aria-modal="true" aria-labelledby="appointment-drawer-title">
        <header className="cal-drawer-nav">
          <div className="cal-drawer-nav-left">
            <button type="button" className="cal-drawer-nav-back" onClick={onClose} aria-label="Back to calendar">
              <ChevronLeft size={22} />
            </button>
            <div className="cal-drawer-title-wrap">
              <h2 id="appointment-drawer-title">Overview</h2>
              <span className={`cal-status-pill is-${appointment.status}`}>{statusLabel}</span>
            </div>
          </div>
          <div className="cal-drawer-nav-actions">
            <button
              type="button"
              className="cal-drawer-nav-btn"
              onClick={() => onReschedule(appointment)}
              aria-label="Edit appointment"
              title="Reschedule / Edit"
            >
              <Pencil size={18} />
            </button>
            <div className="cal-drawer-menu-container" ref={menuRef}>
              <button
                type="button"
                className="cal-drawer-nav-btn"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="More options"
                aria-expanded={menuOpen}
              >
                <MoreVertical size={18} />
              </button>
              {menuOpen && (
                <div className="cal-drawer-dropdown-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      void onReschedule(appointment)
                    }}
                  >
                    <Pencil size={14} /> Reschedule
                  </button>
                  {appointment.status === "approved" && (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false)
                          void onUpdateStatus(appointment.id, "completed")
                        }}
                      >
                        <CheckCircle2 size={14} /> Mark Completed
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false)
                          const reason = window.prompt("Internal no-show reason (optional)") || ""
                          void onUpdateStatus(appointment.id, "no_show", reason)
                        }}
                      >
                        <XCircle size={14} /> Mark No-show
                      </button>
                    </>
                  )}
                  {appointment.status === "cancelled" && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        void onUpdateStatus(appointment.id, "approved")
                      }}
                    >
                      <CheckCircle2 size={14} /> Restore to Approved
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      void navigator.clipboard?.writeText(appointment.id)
                      showToast("Booking ID copied")
                      setMenuOpen(false)
                    }}
                  >
                    <Copy size={14} /> Copy Booking ID
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="is-danger"
                    onClick={() => {
                      setMenuOpen(false)
                      if (window.confirm("Are you sure you want to delete this appointment?")) {
                        void onDelete(appointment.id)
                        onClose()
                      }
                    }}
                  >
                    <Trash2 size={14} /> Delete Appointment
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="cal-drawer-body">
          {/* 1. Service and with duration */}
          <div className="cal-overview-card cal-overview-service">
            <div className="cal-overview-card-header">
              <span className="cal-overview-icon"><Scissors size={16} /></span>
              <span className="cal-overview-card-label">Service &amp; Duration</span>
            </div>
            <div className="cal-service-content">
              <h3 className="cal-service-name">{appointment.service_names}</h3>
              <div className="cal-service-meta-badges">
                <span className="cal-meta-badge duration">
                  <Clock3 size={13} /> {appointment.duration_minutes} mins
                </span>
                <span className="cal-meta-badge price">
                  <Tag size={13} /> {appointment.total_price}
                </span>
              </div>
            </div>
            {appointment.meeting_url && (
              <a className="cal-service-meeting-link" href={appointment.meeting_url} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> Join video appointment
              </a>
            )}
            {appointment.status === "no_show" && appointment.no_show_reason && (
              <div className="cal-service-no-show">
                <FileText size={13} />
                <span>No-show reason: {appointment.no_show_reason}</span>
              </div>
            )}
          </div>

          {/* 2. Date and Time */}
          <div className="cal-overview-card cal-overview-schedule">
            <div className="cal-overview-card-header">
              <span className="cal-overview-icon"><CalendarDays size={16} /></span>
              <span className="cal-overview-card-label">Date &amp; Time</span>
            </div>
            <div className="cal-schedule-content">
              <strong className="cal-schedule-date">{formattedDate}</strong>
              <span className="cal-schedule-time">{appointment.appointment_time}</span>
            </div>
          </div>

          {/* 3. Compact Guest Info: Avatar with Name, Email, and Phone */}
          <div className="cal-overview-card cal-overview-guest">
            <div className="cal-overview-card-header">
              <span className="cal-overview-card-label">Guest</span>
            </div>
            <div className="cal-guest-compact-body">
              <span className={`cal-client-avatar ${appointment.color}`}>
                {getInitials(appointment.customer_name)}
              </span>
              <div className="cal-guest-details">
                <strong className="cal-guest-name">{appointment.customer_name}</strong>
                <div className="cal-guest-contact-inline">
                  {appointment.customer_email ? (
                    <a href={`mailto:${appointment.customer_email}`} className="cal-guest-inline-item">
                      <Mail size={13} />
                      <span>{appointment.customer_email}</span>
                    </a>
                  ) : (
                    <span className="cal-guest-inline-item is-empty">
                      <Mail size={13} /> No email
                    </span>
                  )}
                  {appointment.customer_phone ? (
                    <a href={`tel:${appointment.customer_phone}`} className="cal-guest-inline-item">
                      <Phone size={13} />
                      <span>{appointment.customer_phone}</span>
                    </a>
                  ) : (
                    <span className="cal-guest-inline-item is-empty">
                      <Phone size={13} /> No phone provided
                    </span>
                  )}
                </div>
              </div>
            </div>
            {appointment.customer_address && (
              <div className="cal-guest-extra-row">
                <MapPin size={13} />
                <span>{appointment.customer_address}</span>
              </div>
            )}
            {cleanCustomerNote && (
              <div className="cal-guest-note-box">
                <span className="cal-guest-note-label">Client Note:</span>
                <p className="cal-guest-note-text">{cleanCustomerNote}</p>
              </div>
            )}
          </div>

          {/* 4. Booking ID */}
          <div className="cal-overview-card cal-overview-booking-id">
            <div className="cal-booking-id-row">
              <span className="cal-booking-id-label">Booking ID</span>
              <div className="cal-booking-id-val">
                <code>#{appointment.id.length > 12 ? appointment.id.slice(0, 8).toUpperCase() : appointment.id.toUpperCase()}</code>
                <button
                  type="button"
                  className="cal-booking-id-copy"
                  onClick={() => {
                    void navigator.clipboard?.writeText(appointment.id)
                    showToast("Booking ID copied")
                  }}
                  title="Copy full booking ID"
                  aria-label="Copy booking ID"
                >
                  <Copy size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* 5. Client Attachments */}
          <div className="cal-drawer-section cal-drawer-attachments">
            <h3>Client Attachments</h3>
            <div className="cal-drawer-attachment-grid">
              {attachmentUrls.peg ? (
                <button type="button" className="cal-drawer-attachment" onClick={() => setSelectedAttachment({ url: attachmentUrls.peg, label: "Design peg" })}>
                  <img src={attachmentUrls.peg} alt="Client design reference" />
                  <span>Design peg</span>
                </button>
              ) : (
                <div className="cal-drawer-attachment cal-drawer-attachment-empty">
                  <span>Design peg</span>
                  <small>No attachment</small>
                </div>
              )}
              {attachmentUrls.receipt ? (
                <button type="button" className="cal-drawer-attachment" onClick={() => setSelectedAttachment({ url: attachmentUrls.receipt, label: "Payment receipt" })}>
                  <img src={attachmentUrls.receipt} alt="Client payment receipt" />
                  <span>Payment receipt</span>
                </button>
              ) : (
                <div className="cal-drawer-attachment cal-drawer-attachment-empty">
                  <span>Payment receipt</span>
                  <small>No attachment</small>
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="cal-drawer-footer">
          <div className="cal-drawer-status-actions">
            {appointment.status === "pending" && <Button type="button" className="cal-action-approve" disabled={statusUpdating} onClick={() => requestStatusChange("approve")}><CheckCircle2 size={16} /> Approve</Button>}
            {appointment.status === "pending" && (
              <Button
                type="button"
                variant="outline"
                className="cal-action-cancel"
                disabled={statusUpdating}
                onClick={() => requestStatusChange("cancel")}
              >
                <XCircle size={16} />
                Cancel
              </Button>
            )}
            {appointment.status === "approved" && (
              <Button
                type="button"
                className="cal-action-complete"
                onClick={() => onUpdateStatus(appointment.id, "completed")}
              >
                <CheckCircle2 size={16} />
                Mark Completed
              </Button>
            )}
            {appointment.status === "approved" && <Button type="button" variant="outline" onClick={() => { const reason = window.prompt("Internal no-show reason (optional)") || ""; void onUpdateStatus(appointment.id, "no_show", reason) }}><XCircle size={16} /> Mark No-show</Button>}
            {appointment.status === "cancelled" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onUpdateStatus(appointment.id, "approved")}
              >
                Restore to Approved
              </Button>
            )}
          </div>
        </footer>
        {confirmAction && (
          <div className="appointment-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !statusUpdating) setConfirmAction(null) }}>
            <section className="appointment-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="appointment-confirm-title">
              <h3 id="appointment-confirm-title">{confirmAction === "approve" ? "Approve appointment?" : "Cancel appointment?"}</h3>
              <p>{confirmAction === "approve" ? "The client will be notified that this appointment is confirmed." : "This will cancel the appointment and send a cancellation email."}</p>
              {confirmAction === "cancel" && <label className="appointment-confirm-input"><span>Type YES to confirm</span><input autoFocus value={cancelConfirmation} onChange={(event) => setCancelConfirmation(event.target.value)} placeholder="YES" autoComplete="off" /></label>}
              <div className="appointment-confirm-actions">
                <Button type="button" variant="outline" disabled={statusUpdating} onClick={() => setConfirmAction(null)}>No</Button>
                <Button type="button" className={confirmAction === "cancel" ? "cal-action-cancel" : "cal-action-approve"} disabled={statusUpdating || (confirmAction === "cancel" && cancelConfirmation.trim().toUpperCase() !== "YES")} onClick={() => void confirmStatusChange()}>
                  {statusUpdating ? <><Loader2 size={15} className="animate-spin" /> {confirmAction === "approve" ? "Approving…" : "Cancelling…"}</> : "Yes"}
                </Button>
              </div>
            </section>
          </div>
        )}
        {selectedAttachment && <div className="cal-attachment-viewer" role="dialog" aria-modal="true" aria-label={`${selectedAttachment.label} preview`} onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedAttachment(null) }}><div className="cal-attachment-viewer-toolbar"><span>{selectedAttachment.label}</span><button type="button" onClick={() => setSelectedAttachment(null)} aria-label="Close image preview"><X size={20} /></button></div><img src={selectedAttachment.url} alt={selectedAttachment.label} /></div>}
      </aside>
    </div>
  )
}
