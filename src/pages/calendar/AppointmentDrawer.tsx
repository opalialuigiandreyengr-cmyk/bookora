import { useEffect, useRef, useState } from "react"
import { CalendarDays, CheckCircle2, Clock3, ExternalLink, FileText, Mail, MapPin, Phone, Scissors, Tag, Trash2, X, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CalendarAppointment, getInitials, parseDateKey } from "./types"
import { supabase } from "@/lib/supabase"

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
  const [attachmentUrls, setAttachmentUrls] = useState<{ peg: string; receipt: string }>({ peg: "", receipt: "" })
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

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
      : "Approved"
  const cleanCustomerNote = (appointment.customer_note || "")
    .replace(/\s*\[(?:Peg|Payment )?Storage Path:\s*[^\]]+\]/gi, "")
    .replace(/\s*\[(?:Paid in Full|Deposit):\s*[^\]]+\]/gi, "")
    .trim()

  return (
    <div
      className="cal-drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose()
      }}
    >
      <aside ref={drawerRef} className="cal-drawer" role="dialog" aria-modal="true" aria-labelledby="appointment-drawer-title">
        <header className="cal-drawer-header">
          <div>
            <span className={`cal-status-pill is-${appointment.status}`}>{statusLabel}</span>
            <h2 id="appointment-drawer-title">Appointment Details</h2>
          </div>
          <button type="button" className="cal-drawer-close" onClick={onClose} aria-label="Close details">
            <X size={18} />
          </button>
        </header>

        <div className="cal-drawer-body">
          {/* Client Card */}
          <div className="cal-drawer-client">
            <span className={`cal-client-avatar ${appointment.color}`}>
              {getInitials(appointment.customer_name)}
            </span>
            <div>
              <strong>{appointment.customer_name}</strong>
              <span>Client</span>
            </div>
          </div>

          <div className="cal-drawer-section">
            <h3>Service &amp; Schedule</h3>
            <div className="cal-drawer-info-list">
              <div className="cal-drawer-info-row">
                <span className="cal-drawer-info-icon">
                  <Scissors size={16} />
                </span>
                <div>
                  <small>Service</small>
                  <strong>{appointment.service_names}</strong>
                </div>
              </div>
              {appointment.status === "no_show" && appointment.no_show_reason && <div className="cal-drawer-info-row"><span className="cal-drawer-info-icon"><FileText size={16} /></span><div><small>Internal no-show reason</small><strong>{appointment.no_show_reason}</strong></div></div>}

              <div className="cal-drawer-info-row">
                <span className="cal-drawer-info-icon">
                  <CalendarDays size={16} />
                </span>
                <div>
                  <small>Date</small>
                  <strong>{formattedDate}</strong>
                </div>
              </div>

              <div className="cal-drawer-info-row">
                <span className="cal-drawer-info-icon">
                  <Clock3 size={16} />
                </span>
                <div>
                  <small>Time</small>
                  <strong>{appointment.appointment_time}</strong>
                </div>
              </div>

              <div className="cal-drawer-info-row">
                <span className="cal-drawer-info-icon">
                  <Clock3 size={16} />
                </span>
                <div>
                  <small>Duration</small>
                  <strong>{appointment.duration_minutes} mins</strong>
                </div>
              </div>

              <div className="cal-drawer-info-row">
                <span className="cal-drawer-info-icon">
                  <Tag size={16} />
                </span>
                <div>
                  <small>Total Price</small>
                  <strong className="cal-drawer-price">{appointment.total_price}</strong>
                </div>
              </div>
              {appointment.meeting_url && <div className="cal-drawer-info-row"><span className="cal-drawer-info-icon"><ExternalLink size={16} /></span><div><small>Meeting link</small><a href={appointment.meeting_url} target="_blank" rel="noreferrer">Open video appointment</a></div></div>}
            </div>
          </div>

          <div className="cal-drawer-section">
            <h3>Client Contact</h3>
            <div className="cal-drawer-info-list">
              <div className="cal-drawer-info-row">
                <span className="cal-drawer-info-icon">
                  <Mail size={16} />
                </span>
                <div>
                  <small>Email</small>
                  <strong>{appointment.customer_email || "Not provided"}</strong>
                </div>
              </div>

              <div className="cal-drawer-info-row">
                <span className="cal-drawer-info-icon">
                  <Phone size={16} />
                </span>
                <div>
                  <small>Phone</small>
                  <strong>{appointment.customer_phone || "Not provided"}</strong>
                </div>
              </div>

              {appointment.customer_address && (
                <div className="cal-drawer-info-row">
                  <span className="cal-drawer-info-icon">
                    <MapPin size={16} />
                  </span>
                  <div>
                    <small>Address</small>
                    <strong>{appointment.customer_address}</strong>
                  </div>
                </div>
              )}

              {cleanCustomerNote && (
                <div className="cal-drawer-info-row">
                  <span className="cal-drawer-info-icon">
                    <FileText size={16} />
                  </span>
                  <div>
                    <small>Client Note</small>
                    <strong>{cleanCustomerNote}</strong>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="cal-drawer-section cal-drawer-attachments">
            <h3>Client Attachments</h3>
            <div className="cal-drawer-attachment-grid">
              {attachmentUrls.peg ? <a href={attachmentUrls.peg} target="_blank" rel="noreferrer" className="cal-drawer-attachment"><img src={attachmentUrls.peg} alt="Client design reference" /><span>Design peg</span></a> : <div className="cal-drawer-attachment cal-drawer-attachment-empty"><span>Design peg</span><small>No attachment</small></div>}
              {attachmentUrls.receipt ? <a href={attachmentUrls.receipt} target="_blank" rel="noreferrer" className="cal-drawer-attachment"><img src={attachmentUrls.receipt} alt="Client payment receipt" /><span>Payment receipt</span></a> : <div className="cal-drawer-attachment cal-drawer-attachment-empty"><span>Payment receipt</span><small>No attachment</small></div>}
            </div>
          </div>
        </div>

        <footer className="cal-drawer-footer">
          <div className="cal-drawer-status-actions">
            {appointment.status !== "completed" && appointment.status !== "no_show" && <Button type="button" variant="outline" onClick={() => void onReschedule(appointment)}><CalendarDays size={16} /> Reschedule</Button>}
            {appointment.status !== "completed" && (
              <Button
                type="button"
                className="cal-action-complete"
                onClick={() => onUpdateStatus(appointment.id, "completed")}
              >
                <CheckCircle2 size={16} />
                Mark Completed
              </Button>
            )}
            {appointment.status !== "completed" && appointment.status !== "cancelled" && appointment.status !== "no_show" && <Button type="button" variant="outline" onClick={() => { const reason = window.prompt("Internal no-show reason (optional)") || ""; void onUpdateStatus(appointment.id, "no_show", reason) }}><XCircle size={16} /> Mark No-show</Button>}
            {appointment.status === "cancelled" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onUpdateStatus(appointment.id, "approved")}
              >
                Restore to Approved
              </Button>
            )}
            {appointment.status !== "cancelled" && (
              <Button
                type="button"
                variant="outline"
                className="cal-action-cancel"
                onClick={() => onUpdateStatus(appointment.id, "cancelled")}
              >
                <XCircle size={16} />
                Cancel
              </Button>
            )}
          </div>
          <button
            type="button"
            className="cal-action-delete"
            onClick={() => onDelete(appointment.id)}
            title="Delete appointment"
          >
            <Trash2 size={15} />
            <span>Remove from calendar</span>
          </button>
        </footer>
      </aside>
    </div>
  )
}
