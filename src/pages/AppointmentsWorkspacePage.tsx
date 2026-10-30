import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  ArrowRight,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Eye,
  Search,
  X,
} from "lucide-react";
import {
  OwnerMobileMenuButton,
  OwnerSidebar,
} from "@/components/owner/OwnerSidebar";
import {
  OwnerPagination,
  OwnerStatusBadge,
} from "@/components/owner/OwnerDataPrimitives";
import { showToast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";
import { sendAppointmentUpdateEmail } from "@/lib/appointmentNotifications";
import { AppointmentDrawer } from "@/pages/calendar/AppointmentDrawer";
import {
  buildDemoAppointments,
  type CalendarAppointment,
  parseDateKey,
  pickAppointmentColor,
} from "@/pages/calendar/types";

type Status = CalendarAppointment["status"];
type PaymentFilter = "all" | "unpaid" | "partial" | "paid";
type PaymentState = Exclude<PaymentFilter, "all">;
type StaffOption = { id: string; full_name: string };
type PaymentRow = {
  appointment_id: string | null;
  amount: number;
  status: string;
  transaction_type: string;
};
const statusLabels: Record<Status, string> = {
  approved: "Confirmed",
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};
const statusTones: Record<Status, "info" | "warning" | "success" | "danger"> = {
  approved: "info",
  pending: "warning",
  completed: "success",
  cancelled: "danger",
  no_show: "danger",
};

const mapRow = (row: Record<string, unknown>): CalendarAppointment => {
  const rawStatus = String(row.status || "approved").toLowerCase();
  const status: Status =
    rawStatus === "completed"
      ? "completed"
      : rawStatus === "no_show"
        ? "no_show"
        : rawStatus === "cancelled" || rawStatus === "canceled"
          ? "cancelled"
          : rawStatus === "pending"
            ? "pending"
            : "approved";
  return {
    id: String(row.id),
    business_id: String(row.business_id),
    customer_name: String(row.customer_name || "Client"),
    customer_email: String(row.customer_email || ""),
    customer_phone: String(row.customer_phone || ""),
    customer_address: String(row.customer_address || ""),
    customer_note: String(row.customer_note || ""),
    service_names: String(row.service_names || "Appointment"),
    total_price: String(row.total_price || "₱0"),
    appointment_date: String(row.appointment_date || "").slice(0, 10),
    appointment_time: String(row.appointment_time || "10:00 AM"),
    duration_minutes: Number(row.duration_minutes) || 60,
    buffer_minutes: Number(row.buffer_minutes) || 0,
    staff_member_id: (row.staff_member_id as string | null) ?? null,
    location_name: String(row.location_name || ""),
    meeting_url: String(row.meeting_url || ""),
    no_show_reason: String(row.no_show_reason || ""),
    peg_image_path: (row.peg_image_path as string | null) ?? null,
    payment_receipt_path: (row.payment_receipt_path as string | null) ?? null,
    status,
    payment_status: "unpaid",
    color: pickAppointmentColor(String(row.customer_name || row.id)),
  };
};

export function AppointmentsWorkspacePage({
  user,
}: {
  user: User;
  onSignOut: () => void;
}) {
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | Status>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [staffId, setStaffId] = useState("all");
  const [payment, setPayment] = useState<PaymentFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CalendarAppointment | null>(null);
  const [rescheduleTarget, setRescheduleTarget] =
    useState<CalendarAppointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const isLive = Boolean(supabase && user.id !== "preview-user-123");
  const storageKey = `bookora-calendar-appointments-${user.id}`;

  const load = async () => {
    setLoading(true);
    setError("");
    if (isLive && supabase) {
      const [appointmentResult, staffResult, paymentResult] = await Promise.all(
        [
          supabase
            .from("appointments")
            .select("*")
            .eq("business_id", user.id)
            .order("appointment_date", { ascending: true })
            .order("appointment_time", { ascending: true }),
          supabase
            .from("staff_members")
            .select("id, full_name")
            .eq("business_id", user.id)
            .eq("status", "active")
            .order("full_name"),
          supabase
            .from("payment_transactions")
            .select("appointment_id, amount, status, transaction_type")
            .eq("business_id", user.id),
        ],
      );
      if (appointmentResult.error) setError(appointmentResult.error.message);
      const paymentMap = new Map<string, PaymentState>();
      for (const row of (paymentResult.data || []) as PaymentRow[]) {
        if (
          !row.appointment_id ||
          row.status === "failed" ||
          row.transaction_type === "refund"
        )
          continue;
        const next: PaymentState = row.status === "paid" ? "paid" : "partial";
        const current = paymentMap.get(row.appointment_id);
        paymentMap.set(
          row.appointment_id,
          current === "paid" || next === "paid" ? "paid" : "partial",
        );
      }
      setAppointments(
        (appointmentResult.data || []).map((row) => {
          const item = mapRow(row as Record<string, unknown>);
          return {
            ...item,
            payment_status: paymentMap.get(item.id) || "unpaid",
          };
        }),
      );
      setStaff((staffResult.data || []) as StaffOption[]);
    } else {
      try {
        const raw = window.localStorage.getItem(storageKey);
        setAppointments(
          raw
            ? (JSON.parse(raw) as CalendarAppointment[])
            : buildDemoAppointments(new Date(), user.id),
        );
      } catch {
        setAppointments(buildDemoAppointments(new Date(), user.id));
      }
      setStaff([]);
    }
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, [isLive, user.id]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return appointments.filter(
      (item) =>
        (status === "all" || item.status === status) &&
        (!dateFrom || item.appointment_date >= dateFrom) &&
        (!dateTo || item.appointment_date <= dateTo) &&
        (staffId === "all" || item.staff_member_id === staffId) &&
        (payment === "all" || (item.payment_status || "unpaid") === payment) &&
        (!query ||
          [
            item.customer_name,
            item.customer_email,
            item.customer_phone,
            item.service_names,
          ].some((value) => value.toLowerCase().includes(query))),
    );
  }, [appointments, dateFrom, dateTo, payment, search, staffId, status]);
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageRows = visible.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, payment, search, staffId, status]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  useEffect(() => {
    const rows = document.querySelectorAll<HTMLTableRowElement>(
      ".appointments-table tbody tr",
    );
    rows.forEach((row, index) => {
      const duration = pageRows[index]?.duration_minutes || 60;
      row
        .querySelector<HTMLElement>("td:nth-child(5) small")
        ?.setAttribute("data-duration", String(duration));
    });
  }, [pageRows]);

  const updateStatus = async (
    id: string,
    nextStatus: Status,
    noShowReason = "",
  ) => {
    if (isLive && supabase) {
      const result = await supabase
        .from("appointments")
        .update({
          status: nextStatus,
          no_show_reason: nextStatus === "no_show" ? noShowReason : "",
        })
        .eq("id", id)
        .eq("business_id", user.id);
      if (result.error) {
        showToast(result.error.message, "error");
        return;
      }
    }
    if (nextStatus === "cancelled") {
      const emailResult = await sendAppointmentUpdateEmail({
        businessId: user.id,
        appointmentId: id,
        eventType: "cancellation",
      });
      if (!emailResult.ok)
        showToast(
          `Appointment cancelled, but email was not sent: ${emailResult.error}`,
          "error",
        );
    }
    const next = appointments.map((item) =>
      item.id === id
        ? { ...item, status: nextStatus, no_show_reason: noShowReason }
        : item,
    );
    setAppointments(next);
    if (!isLive) window.localStorage.setItem(storageKey, JSON.stringify(next));
    setSelected((current) =>
      current?.id === id
        ? { ...current, status: nextStatus, no_show_reason: noShowReason }
        : current,
    );
    showToast(
      `Appointment marked as ${statusLabels[nextStatus].toLowerCase()}`,
    );
  };
  const toTimeInput = (value: string) => {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return "09:00";
    let hour = Number(match[1]) % 12;
    if (match[3].toUpperCase() === "PM") hour += 12;
    return `${String(hour).padStart(2, "0")}:${match[2]}`;
  };
  const toAppointmentTime = (value: string) => {
    const [rawHour, minutes] = value.split(":");
    const hour = Number(rawHour);
    return `${String(hour % 12 || 12).padStart(2, "0")}:${minutes} ${hour >= 12 ? "PM" : "AM"}`;
  };
  const openReschedule = async (appointment: CalendarAppointment) => {
    setRescheduleTarget(appointment);
    setRescheduleDate(appointment.appointment_date);
    setRescheduleTime(toTimeInput(appointment.appointment_time));
  };
  const saveReschedule = async () => {
    const appointment = rescheduleTarget;
    const nextDate = rescheduleDate.trim();
    const nextTime = toAppointmentTime(rescheduleTime);
    if (!appointment || !nextDate || !rescheduleTime) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
      showToast("Enter a valid date.", "error");
      return;
    }
    if (isLive && supabase) {
      const result = await supabase
        .from("appointments")
        .update({ appointment_date: nextDate, appointment_time: nextTime })
        .eq("id", appointment.id)
        .eq("business_id", user.id);
      if (result.error) {
        showToast(result.error.message, "error");
        return;
      }
    }
    const emailResult = await sendAppointmentUpdateEmail({
      businessId: user.id,
      appointmentId: appointment.id,
      eventType: "reschedule",
      appointmentDate: nextDate,
      appointmentTime: nextTime,
    });
    if (!emailResult.ok)
      showToast(
        `Appointment rescheduled, but email was not sent: ${emailResult.error}`,
        "error",
      );
    const next = appointments.map((item) =>
      item.id === appointment.id
        ? { ...item, appointment_date: nextDate, appointment_time: nextTime }
        : item,
    );
    setAppointments(next);
    setSelected((current) =>
      current?.id === appointment.id
        ? { ...current, appointment_date: nextDate, appointment_time: nextTime }
        : current,
    );
    if (!isLive) window.localStorage.setItem(storageKey, JSON.stringify(next));
    setRescheduleTarget(null);
    showToast("Appointment rescheduled");
  };
  const remove = async (id: string) => {
    if (!window.confirm("Remove this appointment from the calendar?")) return;
    if (isLive && supabase) {
      const result = await supabase
        .from("appointments")
        .delete()
        .eq("id", id)
        .eq("business_id", user.id);
      if (result.error) {
        showToast(result.error.message, "error");
        return;
      }
    }
    const next = appointments.filter((item) => item.id !== id);
    setAppointments(next);
    setSelected(null);
    if (!isLive) window.localStorage.setItem(storageKey, JSON.stringify(next));
    showToast("Appointment removed");
  };
  const bulkStatus = async (nextStatus: Status) => {
    if (!selectedIds.length) return;
    if (isLive && supabase) {
      const result = await supabase
        .from("appointments")
        .update({ status: nextStatus, no_show_reason: "" })
        .in("id", selectedIds)
        .eq("business_id", user.id);
      if (result.error) {
        showToast(result.error.message, "error");
        return;
      }
    }
    const next = appointments.map((item) =>
      selectedIds.includes(item.id)
        ? { ...item, status: nextStatus, no_show_reason: "" }
        : item,
    );
    setAppointments(next);
    setSelectedIds([]);
    setSelected((current) =>
      current && selectedIds.includes(current.id)
        ? { ...current, status: nextStatus, no_show_reason: "" }
        : current,
    );
    if (!isLive) window.localStorage.setItem(storageKey, JSON.stringify(next));
    showToast(
      `${selectedIds.length} appointment${selectedIds.length === 1 ? "" : "s"} marked as ${statusLabels[nextStatus].toLowerCase()}`,
    );
  };
  const clearFilters = () => {
    setSearch("");
    setStatus("all");
    setDateFrom("");
    setDateTo("");
    setStaffId("all");
    setPayment("all");
  };
  const toggleSelected = (id: string) =>
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  return (
    <div className="dashboard-shell appointments-page-shell">
      <OwnerSidebar
        user={user}
        active="Appointments"
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNavigate={(path) => window.location.assign(path)}
      />
      <div className="dashboard-content">
        <header className="dashboard-header">
          <OwnerMobileMenuButton onOpen={() => setSidebarOpen(true)} />
          <div className="dashboard-header-context">
            <span>Appointments</span>
            <small>Owner workspace</small>
          </div>
        </header>
        <main className="dashboard-main appointments-main">
          {error && (
            <div className="appointments-error" role="alert">
              {error}
              <button type="button" onClick={() => void load()}>
                Retry
              </button>
            </div>
          )}
          <section className="appointments-summary">
            <div>
              <strong>{appointments.length}</strong>
              <span>Total</span>
            </div>
            <div>
              <strong>
                {
                  appointments.filter((item) => item.status === "pending")
                    .length
                }
              </strong>
              <span>Pending</span>
            </div>
            <div>
              <strong>
                {
                  appointments.filter((item) => item.status === "completed")
                    .length
                }
              </strong>
              <span>Completed</span>
            </div>
            <div>
              <strong>
                {
                  appointments.filter((item) => item.status === "no_show")
                    .length
                }
              </strong>
              <span>No-shows</span>
            </div>
          </section>
          <div className="appointments-toolbar">
            <label className="appointments-search">
              <Search size={16} />
              <input
                aria-label="Search appointments"
                placeholder="Search clients or services"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className="appointments-filter">
              <span>Status</span>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as "all" | Status)
                }
              >
                <option value="all">All statuses</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="appointments-filter">
              <span>Staff</span>
              <select
                value={staffId}
                onChange={(event) => setStaffId(event.target.value)}
              >
                <option value="all">All staff</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="appointments-filter">
              <span>Payment</span>
              <select
                value={payment}
                onChange={(event) =>
                  setPayment(event.target.value as PaymentFilter)
                }
              >
                <option value="all">All payment states</option>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
              </select>
            </label>
            <label className="appointments-filter appointments-date-filter">
              <CalendarDays size={15} />
              <span>From</span>
              <input
                type="date"
                aria-label="Filter appointments from date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </label>
            <label className="appointments-filter appointments-date-filter">
              <CalendarDays size={15} />
              <span>To</span>
              <input
                type="date"
                aria-label="Filter appointments to date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </label>
            {(search ||
              dateFrom ||
              dateTo ||
              status !== "all" ||
              staffId !== "all" ||
              payment !== "all") && (
              <button
                className="appointments-clear"
                type="button"
                onClick={clearFilters}
              >
                <X size={14} /> Clear filters
              </button>
            )}
          </div>
          {loading ? (
            <div className="appointments-empty">Loading appointments…</div>
          ) : visible.length === 0 ? (
            <div className="appointments-empty">
              <CalendarDays size={26} />
              <strong>No appointments found</strong>
              <span>
                Try changing the filters or add a booking from the calendar.
              </span>
              {(search ||
                dateFrom ||
                dateTo ||
                status !== "all" ||
                staffId !== "all" ||
                payment !== "all") && (
                <button type="button" onClick={clearFilters}>
                  Clear filters <ArrowRight size={14} />
                </button>
              )}
            </div>
          ) : (
            <section
              className="appointments-table-wrap"
              aria-label="Appointments list"
            >
              {selectedIds.length > 0 && <div className="appointments-bulk-toolbar">
                {selectedIds.length > 0 && (
                  <>
                    <span>{selectedIds.length} selected</span>
                    <button
                      type="button"
                      onClick={() => void bulkStatus("approved")}
                    >
                      <CheckCircle2 size={14} /> Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => void bulkStatus("cancelled")}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>}
              <table className="appointments-table">
                <thead>
                  <tr>
                    <th aria-label="Select" />
                    <th>Client</th>
                    <th>Service</th>
                    <th>Staff</th>
                    <th>Date &amp; time</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((appointment) => (
                    <tr key={appointment.id}>
                      <td>
                        <input
                          aria-label={`Select ${appointment.customer_name}`}
                          type="checkbox"
                          checked={selectedIds.includes(appointment.id)}
                          onChange={() => toggleSelected(appointment.id)}
                        />
                      </td>
                      <td>
                        <button
                          className="appointment-client-button"
                          type="button"
                          onClick={() => setSelected(appointment)}
                        >
                          <span
                            className={`cal-client-avatar ${appointment.color}`}
                          >
                            {appointment.customer_name
                              .split(/\s+/)
                              .map((part) => part[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                          <span>
                            <strong>{appointment.customer_name}</strong>
                            <small>
                              {appointment.customer_email ||
                                "No email provided"}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>
                        {appointment.service_names}
                        <small>{appointment.total_price}</small>
                      </td>
                      <td>
                        {staff.find(
                          (member) => member.id === appointment.staff_member_id,
                        )?.full_name || "Unassigned"}
                      </td>
                      <td>
                        <span className="appointment-time">
                          <Clock3 size={14} />
                          {parseDateKey(
                            appointment.appointment_date,
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        <small>{appointment.appointment_time}</small>
                      </td>
                      <td>{appointment.payment_status || "unpaid"}</td>
                      <td>
                        <OwnerStatusBadge
                          label={statusLabels[appointment.status]}
                          tone={statusTones[appointment.status]}
                        />
                      </td>
                      <td>
                        <div className="appointment-row-actions">
                          <button
                            className="appointment-row-action"
                            type="button"
                            onClick={() => setSelected(appointment)}
                          >
                            <Eye size={14} />
                            View details
                          </button>
                          <button
                            className="appointment-row-action appointment-row-action-secondary"
                            type="button"
                            onClick={() => openReschedule(appointment)}
                          >
                            <CalendarClock size={14} />
                            Reschedule
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <OwnerPagination
                page={page}
                pageCount={pageCount}
                onPageChange={setPage}
              />
            </section>
          )}
        </main>
      </div>
      {rescheduleTarget && (
        <div
          className="reschedule-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setRescheduleTarget(null);
          }}
        >
          <section
            className="reschedule-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reschedule-modal-title"
          >
            <div className="reschedule-modal-header">
              <div>
                <span className="dashboard-kicker">Appointment update</span>
                <h2 id="reschedule-modal-title">Reschedule appointment</h2>
                <p>{rescheduleTarget.customer_name}</p>
              </div>
              <button
                type="button"
                className="reschedule-modal-close"
                onClick={() => setRescheduleTarget(null)}
                aria-label="Close reschedule dialog"
              >
                <X size={18} />
              </button>
            </div>
            <div className="reschedule-modal-fields">
              <label>
                <span>Date</span>
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(event) => setRescheduleDate(event.target.value)}
                />
              </label>
              <label>
                <span>Time</span>
                <input
                  type="time"
                  value={rescheduleTime}
                  onChange={(event) => setRescheduleTime(event.target.value)}
                />
              </label>
            </div>
            <div className="reschedule-modal-actions">
              <button
                type="button"
                className="reschedule-modal-cancel"
                onClick={() => setRescheduleTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="reschedule-modal-save"
                onClick={() => void saveReschedule()}
              >
                Save changes
              </button>
            </div>
          </section>
        </div>
      )}
      <AppointmentDrawer
        appointment={selected}
        onClose={() => setSelected(null)}
        onUpdateStatus={updateStatus}
        onReschedule={openReschedule}
        onDelete={remove}
      />
    </div>
  );
}
