import { useEffect, useRef, useState } from "react"
import { Bell, CalendarDays, CheckCircle2, ChevronLeft, Clock3, Copy, CreditCard, DollarSign, ExternalLink, FileText, Loader2, Mail, MapPin, MoreVertical, Pencil, Phone, Plus, Scissors, Tag, Trash2, X, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CalendarAppointment, CalendarClientOption, CalendarServiceOption, getInitials, parseDateKey } from "./types"
import { supabase } from "@/lib/supabase"
import { showToast } from "@/components/ui/toast"
import { sendAppointmentUpdateEmail } from "@/lib/appointmentNotifications"
import { AppointmentReminderModal } from "./AppointmentReminderModal"
import { AppointmentOverviewPage } from "./AppointmentOverviewPage"
import { EditAppointmentModal, type AppointmentEditDraft } from "./EditAppointmentModal"

interface AppointmentDrawerProps {
  appointment: CalendarAppointment | null
  onClose: () => void
  onUpdateStatus: (id: string, status: CalendarAppointment["status"], noShowReason?: string) => Promise<void>
  onUpdateAppointment?: (appointment: CalendarAppointment, draft: AppointmentEditDraft) => Promise<boolean>
  onUpdateFinalAmount?: (id: string, amount: number, note: string, sendEmail: boolean) => Promise<boolean>
  onCollectPayment?: (appointment: CalendarAppointment, payment: { amount: number; method: string; note: string }) => Promise<boolean>
  bookingFee?: { enabled: boolean; type: "fixed" | "percentage"; amount: number }
  onReschedule?: (appointment: CalendarAppointment) => Promise<void>
  services?: CalendarServiceOption[]
  appointments?: CalendarAppointment[]
  clients?: CalendarClientOption[]
  onDelete: (id: string) => Promise<void>
}

export function AppointmentDrawer({
  appointment,
  onClose,
  onUpdateStatus,
  onUpdateAppointment,
  onUpdateFinalAmount,
  onCollectPayment,
  bookingFee = { enabled: false, type: "fixed", amount: 0 },
  onReschedule,
  services = [],
  appointments = [],
  clients = [],
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
  const [reminderSentAt, setReminderSentAt] = useState<string | null>(null)
  const [reminderConfirmOpen, setReminderConfirmOpen] = useState(false)
  const [reminderSending, setReminderSending] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [finalAmount, setFinalAmount] = useState("")
  const [finalAmountNote, setFinalAmountNote] = useState("")
  const [finalAmountSaving, setFinalAmountSaving] = useState(false)
  const [finalAmountConfirmOpen, setFinalAmountConfirmOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [discountType, setDiscountType] = useState<"fixed" | "percent">("fixed")
  const [discountValue, setDiscountValue] = useState("")
  const [addOns, setAddOns] = useState<Array<{ id: number; name: string; amount: string }>>([])
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    setConfirmAction(null)
    setCancelConfirmation("")
    setStatusUpdating(false)
    setMenuOpen(false)
    setReminderConfirmOpen(false)
    setReminderSending(false)
    setReminderSentAt(null)
    setEditOpen(false)
    setEditSaving(false)
    setFinalAmount(appointment?.final_total_amount == null ? "" : String(appointment.final_total_amount))
    setFinalAmountNote(appointment?.final_amount_note || "")
    setFinalAmountConfirmOpen(false)
    setPaymentOpen(false)
    setPaymentSaving(false)
    setPaymentAmount("")
    setDiscountType("fixed")
    setDiscountValue("")
    setAddOns([])
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
    let active = true
    const loadReminderStatus = async () => {
      if (!appointment) return
      const localKey = `bookora-reminder-sent-${appointment.id}`
      const localTimestamp = window.localStorage.getItem(localKey)
      if (localTimestamp && active) setReminderSentAt(localTimestamp)
      if (!supabase || !appointment.business_id) return
      const result = await supabase.from("notification_events").select("created_at, status").eq("appointment_id", appointment.id).eq("business_id", appointment.business_id).eq("event_type", "reminder").eq("channel", "email").eq("status", "sent").order("created_at", { ascending: false }).limit(1)
      const timestamp = result.data?.[0]?.created_at ? String(result.data[0].created_at) : ""
      if (active && timestamp) setReminderSentAt(timestamp)
    }
    void loadReminderStatus()
    return () => { active = false }
  }, [appointment?.id, appointment?.business_id])

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

  const sendReminder = async () => {
    if (!appointment || reminderSending || reminderSentAt) return
    if (!appointment.customer_email.trim()) { showToast("This appointment has no client email.", "error"); return }
    setReminderSending(true)
    const result = await sendAppointmentUpdateEmail({ businessId: appointment.business_id, appointmentId: appointment.id, eventType: "reminder" })
    if (!result.ok) {
      showToast(`Reminder was not sent: ${result.error}`, "error")
    } else {
      const timestamp = new Date().toISOString()
      window.localStorage.setItem(`bookora-reminder-sent-${appointment.id}`, timestamp)
      setReminderSentAt(timestamp)
      setReminderConfirmOpen(false)
      showToast("Reminder sent")
    }
    setReminderSending(false)
  }

  const saveFinalAmount = async (sendEmail: boolean) => {
    if (!onUpdateFinalAmount || finalAmountSaving) return false
    const amount = Number(finalAmount.replace(/[^0-9.-]+/g, ""))
    if (!Number.isFinite(amount) || amount < 0) { showToast("Enter a valid final amount.", "error"); return false }
    if (sendEmail && !appointment.customer_email.trim()) { showToast("This appointment has no client email.", "error"); return false }
    setFinalAmountSaving(true)
    try {
      const saved = await onUpdateFinalAmount(appointment.id, amount, finalAmountNote, sendEmail)
      if (saved && sendEmail) setFinalAmountConfirmOpen(false)
      return saved
    } finally { setFinalAmountSaving(false) }
  }

  const estimatedAmount = Number(String(appointment.total_price || "").replace(/[^0-9.-]+/g, "")) || 0
  const baseAmount = appointment.final_total_amount ?? estimatedAmount
  const bookingFeePaid = bookingFee.enabled
    ? Math.min(baseAmount, bookingFee.type === "percentage" ? baseAmount * Math.min(100, Math.max(0, bookingFee.amount)) / 100 : Math.max(0, bookingFee.amount))
    : 0
  const addOnTotal = addOns.reduce((sum, item) => sum + (Number(item.amount.replace(/[^0-9.-]+/g, "")) || 0), 0)
  const subtotal = Math.max(0, baseAmount - bookingFeePaid + addOnTotal)
  const rawDiscount = Number(discountValue.replace(/[^0-9.-]+/g, "")) || 0
  const discountAmount = discountType === "percent" ? Math.min(subtotal, subtotal * Math.min(100, Math.max(0, rawDiscount)) / 100) : Math.min(subtotal, Math.max(0, rawDiscount))
  const paymentTotal = Math.max(0, subtotal - discountAmount)
  const alreadyPaid = Math.max(0, Number(appointment.payment_paid || 0))
  const balanceDue = Math.max(0, paymentTotal - alreadyPaid)

  const openPaymentModal = () => {
    setPaymentAmount(balanceDue.toFixed(2))
    setPaymentOpen(true)
  }

  const collectPayment = async () => {
    if (!onCollectPayment || paymentSaving) return
    const amount = Number(paymentAmount.replace(/[^0-9.-]+/g, "")) || 0
    if (amount < 0 || amount > balanceDue) { showToast(`Enter an amount between ₱0.00 and ₱${balanceDue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}.`, "error"); return }
    const note = [`Final total: ₱${paymentTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`, ...(addOns.length ? [`Add-ons: ${addOns.filter((item) => item.name.trim()).map((item) => `${item.name.trim()} ₱${(Number(item.amount) || 0).toFixed(2)}`).join(", ")}`] : []), ...(discountAmount ? [`Discount: -₱${discountAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`] : [])].join(" · ")
    setPaymentSaving(true)
    try {
      const saved = await onCollectPayment(appointment, { amount, method: paymentMethod, note })
      if (saved) setPaymentOpen(false)
    } finally { setPaymentSaving(false) }
  }

  return (
    <div
      className="cal-drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose()
      }}
    >
      <AppointmentOverviewPage ref={drawerRef} titleId="appointment-drawer-title">
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
              onClick={() => onUpdateAppointment ? setEditOpen(true) : void onReschedule?.(appointment)}
              aria-label="Edit appointment"
              title="Edit appointment"
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

          <div className="cal-overview-card cal-overview-pricing">
            <div className="cal-overview-card-header">
              <span className="cal-overview-icon"><DollarSign size={16} /></span>
              <span className="cal-overview-card-label">Pricing &amp; payment</span>
            </div>
            <div className="cal-pricing-grid">
              <div><span>Estimated total</span><strong>{appointment.total_price}</strong></div>
              <label><span>Final total</span><input inputMode="decimal" value={finalAmount} onChange={(event) => setFinalAmount(event.target.value)} placeholder="₱0.00" aria-label="Final total amount" /></label>
            </div>
            <label className="cal-pricing-note"><span>Note for client (optional)</span><textarea rows={2} value={finalAmountNote} onChange={(event) => setFinalAmountNote(event.target.value)} placeholder="Add a note..." /></label>
            {appointment.final_amount_sent_at && <small className="cal-pricing-sent">Sent {new Date(appointment.final_amount_sent_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</small>}
            <div className="cal-pricing-actions"><Button type="button" variant="outline" disabled={finalAmountSaving || !onUpdateFinalAmount} onClick={() => void saveFinalAmount(false)}>{finalAmountSaving ? "Saving…" : "Save amount"}</Button><Button type="button" className="cal-action-approve" disabled={finalAmountSaving || !onUpdateFinalAmount} onClick={() => setFinalAmountConfirmOpen(true)}><Mail size={14} /> Send final amount</Button></div>
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

          <div className="cal-reminder-row">
            <div className="cal-reminder-copy">
              <Bell size={15} />
              <div>
                <strong>{reminderSentAt ? "Reminder sent" : "Client reminder"}</strong>
                <small>{reminderSentAt ? new Date(reminderSentAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : appointment.customer_email || "No client email"}</small>
              </div>
            </div>
            {reminderSentAt ? <span className="cal-reminder-sent">Sent</span> : <button type="button" className="cal-reminder-button" disabled={!appointment.customer_email} onClick={() => setReminderConfirmOpen(true)}><Mail size={14} /> Send reminder</button>}
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
                onClick={openPaymentModal}
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
        {finalAmountConfirmOpen && <div className="appointment-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !finalAmountSaving) setFinalAmountConfirmOpen(false) }}><section className="appointment-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="final-amount-confirm-title"><h3 id="final-amount-confirm-title">Send final amount?</h3><p>Send the confirmed final amount of <strong>₱{(Number(finalAmount) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</strong> to {appointment.customer_name} at {appointment.customer_email}.</p><div className="appointment-confirm-actions"><Button type="button" variant="outline" disabled={finalAmountSaving} onClick={() => setFinalAmountConfirmOpen(false)}>Cancel</Button><Button type="button" className="cal-action-approve" disabled={finalAmountSaving} onClick={() => void saveFinalAmount(true)}>{finalAmountSaving ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : <><Mail size={15} /> Send amount</>}</Button></div></section></div>}
        {paymentOpen && (
          <div className="appointment-confirm-backdrop appointment-payment-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !paymentSaving) setPaymentOpen(false) }}>
            <section className="appointment-payment-modal" role="dialog" aria-modal="true" aria-labelledby="appointment-payment-title">
              <header><div><h3 id="appointment-payment-title">Complete appointment</h3><p>Review the final bill and record the payment received.</p></div><button type="button" onClick={() => setPaymentOpen(false)} aria-label="Close payment modal"><X size={18} /></button></header>
              <div className="appointment-payment-breakdown">
                <div><span>Base total</span><strong>₱{baseAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</strong></div>
                {bookingFeePaid > 0 && <div className="appointment-payment-fee"><span>Booking fee paid</span><strong>-₱{bookingFeePaid.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</strong></div>}
                {addOns.map((item, index) => <div className="appointment-payment-addon" key={item.id}><input value={item.name} onChange={(event) => setAddOns((current) => current.map((entry) => entry.id === item.id ? { ...entry, name: event.target.value } : entry))} placeholder="Add-on name" /><input inputMode="decimal" value={item.amount} onChange={(event) => setAddOns((current) => current.map((entry) => entry.id === item.id ? { ...entry, amount: event.target.value } : entry))} placeholder="₱0.00" aria-label={`Add-on ${index + 1} amount`} /></div>)}
                <button type="button" className="appointment-payment-add" onClick={() => setAddOns((current) => [...current, { id: Date.now(), name: "", amount: "" }])}><Plus size={14} /> Add purchase add-on</button>
                <div className="appointment-payment-discount">
                  <div className="appointment-payment-discount-type"><span>Discount type</span><div className="appointment-payment-toggle" role="group" aria-label="Discount type"><button type="button" className={discountType === "fixed" ? "active" : ""} aria-pressed={discountType === "fixed"} onClick={() => setDiscountType("fixed")}>Fixed</button><button type="button" className={discountType === "percent" ? "active" : ""} aria-pressed={discountType === "percent"} onClick={() => setDiscountType("percent")}>%</button></div></div>
                  <label><span>Discount</span><input inputMode="decimal" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} placeholder={discountType === "percent" ? "0%" : "₱0.00"} /></label>
                </div>
                <div className="appointment-payment-summary"><span>Subtotal</span><strong>₱{subtotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</strong><span>Discount</span><strong>-₱{discountAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</strong><span>Final total</span><strong>₱{paymentTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</strong></div>
                <div className="appointment-payment-fields"><label><span>Amount received</span><input inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label><label><span>Payment method</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="e_wallet">E-wallet</option><option value="other">Other</option></select></label></div>
              </div>
              <footer className="appointment-confirm-actions"><div className="appointment-payment-sticky-total"><span>Balance due</span><strong>₱{balanceDue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</strong></div><Button type="button" className="cal-action-complete" disabled={paymentSaving} onClick={() => void collectPayment()}>{paymentSaving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><CreditCard size={15} /> Record &amp; complete</>}</Button></footer>
            </section>
          </div>
        )}
        {reminderConfirmOpen && <AppointmentReminderModal customerName={appointment.customer_name} customerEmail={appointment.customer_email} sending={reminderSending} onCancel={() => setReminderConfirmOpen(false)} onConfirm={() => void sendReminder()} />}
        {editOpen && onUpdateAppointment && <EditAppointmentModal appointment={appointment} appointments={appointments} clients={clients} services={services} saving={editSaving} onClose={() => setEditOpen(false)} onSave={(draft) => { setEditSaving(true); void onUpdateAppointment(appointment, draft).then((saved) => { if (saved) setEditOpen(false) }).finally(() => setEditSaving(false)) }} />}
        {selectedAttachment && <div className="cal-attachment-viewer" role="dialog" aria-modal="true" aria-label={`${selectedAttachment.label} preview`} onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedAttachment(null) }}><div className="cal-attachment-viewer-toolbar"><span>{selectedAttachment.label}</span><button type="button" onClick={() => setSelectedAttachment(null)} aria-label="Close image preview"><X size={20} /></button></div><img src={selectedAttachment.url} alt={selectedAttachment.label} /></div>}
      </AppointmentOverviewPage>
    </div>
  )
}
