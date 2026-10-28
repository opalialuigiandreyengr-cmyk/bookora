import { CalendarDays, CheckCircle2, Clock3, FileText, Mail, MapPin, Phone, Scissors, Tag, Trash2, X, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CalendarAppointment, formatTimeRange, getInitials, parseDateKey } from "./types"

interface AppointmentDrawerProps {
  appointment: CalendarAppointment | null
  onClose: () => void
  onUpdateStatus: (id: string, status: CalendarAppointment["status"]) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function AppointmentDrawer({
  appointment,
  onClose,
  onUpdateStatus,
  onDelete,
}: AppointmentDrawerProps) {
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
      : "Approved"

  return (
    <div
      className="cal-drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose()
      }}
    >
      <aside className="cal-drawer" role="dialog" aria-modal="true" aria-label="Appointment details">
        <header className="cal-drawer-header">
          <div>
            <span className={`cal-status-pill is-${appointment.status}`}>{statusLabel}</span>
            <h2>Appointment Details</h2>
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
                  <small>Time &amp; Duration</small>
                  <strong>
                    {formatTimeRange(appointment.appointment_time, appointment.duration_minutes)} (
                    {appointment.duration_minutes} mins)
                  </strong>
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

              {appointment.customer_note && (
                <div className="cal-drawer-info-row">
                  <span className="cal-drawer-info-icon">
                    <FileText size={16} />
                  </span>
                  <div>
                    <small>Client Note</small>
                    <strong>{appointment.customer_note}</strong>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="cal-drawer-footer">
          <div className="cal-drawer-status-actions">
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

