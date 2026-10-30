import { useEffect, useMemo, useState } from "react"
import type { User } from "@supabase/supabase-js"
import {
  ArrowRight,
  BarChart3,
  Calendar as CalendarIcon,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Home,
  ListFilter,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Scissors,
  Settings2,
  Store,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { showToast } from "@/components/ui/toast"
import { sendAppointmentUpdateEmail } from "@/lib/appointmentNotifications"
import { OwnerSidebar } from "@/components/owner/OwnerSidebar"
import { getOwnerRouteByKey } from "@/lib/ownerNavigation"
import {
  addDays,
  buildDemoAppointments,
  CalendarAppointment,
  CalendarServiceOption,
  CalendarStaffOption,
  CalendarViewMode,
  formatMinutesToTime,
  formatTimeRange,
  getInitials,
  parseDateKey,
  parseTimeToMinutes,
  pickAppointmentColor,
  startOfWeek,
  toDateKey,
} from "./calendar/types"
import { AppointmentDrawer } from "./calendar/AppointmentDrawer"
import { NewAppointmentModal } from "./calendar/NewAppointmentModal"

const GRID_START_HOUR = 8 // default 8:00 AM (expands to fit earlier bookings)
const GRID_END_HOUR = 19 // default 7:00 PM (expands to fit later bookings)
const HOUR_HEIGHT_PX = 64

export function CalendarPage({ user, staffMode = false }: { user: User; onSignOut: () => void; staffMode?: boolean }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidePanelOpen, setSidePanelOpen] = useState(() => {
    const stored = window.localStorage.getItem("bookora-calendar-panel")
    if (stored) return stored !== "hidden"
    // Default: open on desktop, collapsed on phones so the calendar gets the screen
    return window.innerWidth > 680
  })
  const toggleSidePanel = () => {
    setSidePanelOpen((prev) => {
      const next = !prev
      window.localStorage.setItem("bookora-calendar-panel", next ? "open" : "hidden")
      return next
    })
  }
  const [viewMode, setViewMode] = useState<CalendarViewMode>(() => (window.innerWidth <= 680 ? "day" : "week"))
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [miniMonthDate, setMiniMonthDate] = useState<Date>(() => new Date())
  const searchQuery = ""
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "completed" | "cancelled" | "no_show">("all")
  const [staffFilter, setStaffFilter] = useState("all")

  const [appointments, setAppointments] = useState<CalendarAppointment[]>([])
  const [services, setServices] = useState<CalendarServiceOption[]>(() =>
    user.id === "preview-user-123" || !supabase
      ? [
          { name: "Gel Manicure", duration_minutes: 60, price: "₱650" },
          { name: "Softgel Extension", duration_minutes: 60, price: "₱750" },
          { name: "Hair Treatment", duration_minutes: 90, price: "₱1,200" },
          { name: "Classic Facial", duration_minutes: 60, price: "₱900" },
        ]
      : []
  )
  const [staff, setStaff] = useState<CalendarStaffOption[]>([])
  const [loading, setLoading] = useState(true)

  const [activeAppointment, setActiveAppointment] = useState<CalendarAppointment | null>(null)
  const [newModalOpen, setNewModalOpen] = useState(false)
  const [draftSlot, setDraftSlot] = useState<{ date?: string; time?: string }>({})

  const businessName = String(user.user_metadata?.business_name ?? "Your business")
  const storageKey = `bookora-calendar-appointments-${user.id}`

  const handleSidebarNavigate = (item: string) => {
    setSidebarOpen(false)
    const route = getOwnerRouteByKey(item)
    if (route.key !== "Calendar") window.location.assign(route.path)
  }

  // Load appointments and services.
  // - Signed-in businesses: always read real rows from Supabase (never demo data).
  // - Preview / no Supabase config: use local sample appointments.
  const isLive = Boolean(supabase && user.id !== "preview-user-123")
  const [loadError, setLoadError] = useState("")

  const mapAppointmentRow = (row: Record<string, unknown>): CalendarAppointment => {
    const rawStatus = String(row.status || "approved").toLowerCase()
    const normalizedStatus: CalendarAppointment["status"] =
      rawStatus === "completed"
        ? "completed"
        : rawStatus === "no_show"
        ? "no_show"
        : ["cancelled", "canceled", "declined", "rejected"].includes(rawStatus)
        ? "cancelled"
        : "approved"

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
      status: normalizedStatus,
      peg_image_path: (row.peg_image_path as string | null) ?? null,
      payment_receipt_path: (row.payment_receipt_path as string | null) ?? null,
      payment_status: (row.payment_status as CalendarAppointment["payment_status"]) || "unpaid",
      payment_paid: Number(row.payment_paid || 0),
      payment_balance: Number(row.payment_balance || 0),
      no_show_reason: String(row.no_show_reason || ""),
      meeting_url: String(row.meeting_url || ""),
      color: pickAppointmentColor(String(row.customer_name || row.id)),
    }
  }

  const fetchLiveAppointments = async (silent = false) => {
    if (!supabase || !isLive) return
    if (!silent) setLoading(true)
    const [appointmentResult, paymentResult] = await Promise.all([
      supabase.from("appointments").select("*").eq("business_id", user.id).order("appointment_date", { ascending: true }),
      supabase.from("payment_transactions").select("appointment_id, amount, status, transaction_type").eq("business_id", user.id),
    ])
    const { data, error } = appointmentResult

    if (error) {
      setLoadError(error.message || "Could not load your appointments.")
      if (!silent) showToast("Could not load your appointments. Please refresh.", "error")
    } else {
      setLoadError("")
      const paymentTotals = new Map<string, { paid: number; hasPending: boolean }>()
      for (const row of paymentResult.data || []) {
        const appointmentId = String(row.appointment_id || "")
        if (!appointmentId) continue
        const current = paymentTotals.get(appointmentId) || { paid: 0, hasPending: false }
        if (String(row.status) === "paid") current.paid += String(row.transaction_type) === "refund" ? -Number(row.amount || 0) : Number(row.amount || 0)
        if (String(row.status) === "pending") current.hasPending = true
        paymentTotals.set(appointmentId, current)
      }
      const mapped = (data ?? []).map((row) => { const raw = row as Record<string, unknown>; const total = Number(String(raw.total_price || "").replace(/[^0-9.-]+/g, "")) || 0; const payment = paymentTotals.get(String(raw.id)); const paid = payment?.paid || 0; return mapAppointmentRow({ ...raw, payment_paid: paid, payment_balance: Math.max(0, total - paid), payment_status: total > 0 && paid >= total ? "paid" : paid > 0 ? "partial" : payment?.hasPending ? "partial" : "unpaid" }) })
      setAppointments(mapped)
      // Keep an open drawer in sync with the latest server copy
      setActiveAppointment((prev) => (prev ? mapped.find((item) => item.id === prev.id) ?? null : prev))
    }
    if (!silent) setLoading(false)
  }

  useEffect(() => {
    let active = true

    const loadCalendarData = async () => {
      setLoading(true)

      if (isLive && supabase) {
        const servicesRes = await supabase
          .from("services")
          .select("id, name, duration_minutes, price")
          .eq("business_id", user.id)
          .order("created_at", { ascending: true })

        if (active && !servicesRes.error) {
          setServices(
            (servicesRes.data ?? []).map((row) => ({
              id: String(row.id),
              name: String(row.name),
              duration_minutes: Number(row.duration_minutes) || 60,
              price: String(row.price || "Free"),
            }))
          )
        }
        const staffRes = await supabase.from("staff_members").select("id, full_name").eq("business_id", user.id).eq("status", "active").order("full_name", { ascending: true })
        if (active && !staffRes.error) setStaff((staffRes.data || []) as CalendarStaffOption[])

        if (active) await fetchLiveAppointments()
        return
      }

      // Preview / offline mode: local sample data
      try {
        const savedRaw = window.localStorage.getItem(storageKey)
        const parsed = savedRaw ? (JSON.parse(savedRaw) as CalendarAppointment[]) : []
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (active) setAppointments(parsed)
        } else {
          const seeded = buildDemoAppointments(new Date(), user.id)
          window.localStorage.setItem(storageKey, JSON.stringify(seeded))
          if (active) setAppointments(seeded)
        }
      } catch {
        if (active) setAppointments(buildDemoAppointments(new Date(), user.id))
      } finally {
        if (active) setLoading(false)
      }
    }

    loadCalendarData()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, storageKey, isLive])

  // Live updates: new customer bookings / changes appear without a page reload
  useEffect(() => {
    if (!isLive || !supabase) return
    const client = supabase

    const channel = client
      .channel(`calendar-appointments-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `business_id=eq.${user.id}` },
        () => {
          fetchLiveAppointments(true)
        }
      )
      .subscribe()

    // Fallback for projects without realtime enabled: refresh when the tab regains focus
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchLiveAppointments(true)
    }
    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("focus", handleVisibility)

    return () => {
      client.removeChannel(channel)
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("focus", handleVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, user.id])

  const persistLocal = (next: CalendarAppointment[]) => {
    setAppointments(next)
    if (isLive) return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      /* ignore quota errors */
    }
  }

  const handleCreateAppointment = async (payload: {
    customer_name: string
    customer_email: string
    customer_phone: string
    customer_note: string
    service_names: string
    total_price: string
    appointment_date: string
    appointment_time: string
    duration_minutes: number
    buffer_minutes?: number
    staff_member_id: string | null
    location_name: string
    meeting_url: string
    recurrence_rule: "none" | "weekly" | "biweekly"
    recurrence_count: number
  }) => {
    if (payload.meeting_url && !/^https:\/\//i.test(payload.meeting_url)) {
      showToast("Meeting links must start with https://", "error")
      throw new Error("Meeting link must use HTTPS")
    }
    const incomingStart = parseTimeToMinutes(payload.appointment_time)
    const incomingEnd = incomingStart + Math.max(payload.duration_minutes + (payload.buffer_minutes || 0), 1)
    const conflict = appointments.find((appointment) => {
      if (appointment.appointment_date !== payload.appointment_date || ["cancelled", "canceled", "declined", "rejected"].includes(appointment.status)) return false
      const existingStart = parseTimeToMinutes(appointment.appointment_time)
      const existingEnd = existingStart + Math.max((appointment.duration_minutes || 60) + (appointment.buffer_minutes || 0), 1)
      return incomingStart < existingEnd && incomingEnd > existingStart
    })
    if (conflict) {
      showToast(`That time overlaps ${conflict.customer_name}'s appointment. Choose another time.`, "error")
      throw new Error("Appointment overlaps an existing booking")
    }

    const recurrenceStep = payload.recurrence_rule === "weekly" ? 7 : payload.recurrence_rule === "biweekly" ? 14 : 0
    const occurrences = Array.from({ length: Math.max(1, Math.min(8, payload.recurrence_count || 1)) }, (_, index) => {
      const occurrenceDate = addDays(parseDateKey(payload.appointment_date), recurrenceStep * index)
      return { ...payload, appointment_date: toDateKey(occurrenceDate) }
    })
    for (const occurrence of occurrences.slice(1)) {
      const hasConflict = appointments.some((appointment) => {
        if (appointment.appointment_date !== occurrence.appointment_date || ["cancelled", "canceled", "declined", "rejected"].includes(appointment.status)) return false
        const occurrenceStart = parseTimeToMinutes(occurrence.appointment_time)
        const existingStart = parseTimeToMinutes(appointment.appointment_time)
        const occurrenceEnd = occurrenceStart + Math.max(occurrence.duration_minutes + (occurrence.buffer_minutes || 0), 1)
        const existingEnd = existingStart + Math.max((appointment.duration_minutes || 60) + (appointment.buffer_minutes || 0), 1)
        return occurrenceStart < existingEnd && occurrenceEnd > existingStart
      })
      if (hasConflict) { showToast(`A recurring occurrence on ${occurrence.appointment_date} overlaps an existing booking.`, "error"); throw new Error("Recurring appointment overlaps an existing booking") }
    }
    const recurrenceGroupId = occurrences.length > 1 ? (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `series-${Date.now()}`) : null
    let createdAppointments: CalendarAppointment[] = occurrences.map((occurrence) => ({ id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `appt-${Date.now()}-${occurrence.appointment_date}`, business_id: user.id, ...occurrence, status: "approved", color: pickAppointmentColor(occurrence.customer_name), recurrence_group_id: recurrenceGroupId }))

    if (isLive && supabase) {
      const { data, error } = await supabase
        .from("appointments")
        .insert(occurrences.map((occurrence) => ({
          business_id: user.id,
          customer_name: occurrence.customer_name, customer_email: occurrence.customer_email, customer_phone: occurrence.customer_phone, customer_note: occurrence.customer_note, service_names: occurrence.service_names, total_price: occurrence.total_price, appointment_date: occurrence.appointment_date, appointment_time: occurrence.appointment_time, duration_minutes: occurrence.duration_minutes, buffer_minutes: occurrence.buffer_minutes || 0, staff_member_id: occurrence.staff_member_id, location_name: occurrence.location_name, meeting_url: occurrence.meeting_url, recurrence_rule: occurrence.recurrence_rule, recurrence_group_id: recurrenceGroupId,
          status: "approved",
        })))
        .select("*")

      if (error || !data) {
        showToast(error?.message ? `Could not save appointment: ${error.message}` : "Could not save appointment.", "error")
        throw error ?? new Error("Insert failed")
      }
      createdAppointments = (data || []).map((row) => mapAppointmentRow(row as Record<string, unknown>))
    }

    persistLocal([...appointments, ...createdAppointments])
    setSelectedDate(parseDateKey(payload.appointment_date))
    showToast(`Appointment scheduled for ${payload.customer_name}`)
  }

  const handleUpdateStatus = async (id: string, status: CalendarAppointment["status"], noShowReason = "") => {
    if (isLive && supabase) {
      const { data, error } = await supabase
        .from("appointments")
        .update({ status, no_show_reason: status === "no_show" ? noShowReason : "" })
        .eq("id", id)
        .eq("business_id", user.id)
        .select("id")
      if (error || !data?.length) {
        showToast(error?.message ? `Could not update: ${error.message}` : "Could not update this appointment.", "error")
        return
      }
      if (status === "cancelled") {
        const emailResult = await sendAppointmentUpdateEmail({ businessId: user.id, appointmentId: id, eventType: "cancellation" })
        if (!emailResult.ok) showToast(`Appointment cancelled, but email was not sent: ${emailResult.error}`, "error")
      }
    }
    const next = appointments.map((item) => (item.id === id ? { ...item, status } : item))
    persistLocal(next)
    setActiveAppointment((prev) => (prev && prev.id === id ? { ...prev, status } : prev))
    showToast(`Appointment marked as ${status}`)
  }

  const handleReschedule = async (appointment: CalendarAppointment) => {
    const nextDate = window.prompt("New date (YYYY-MM-DD)", appointment.appointment_date)?.trim()
    if (!nextDate) return
    const nextTime = window.prompt("New time (for example, 2:30 PM)", appointment.appointment_time)?.trim()
    if (!nextTime) return
    const incomingStart = parseTimeToMinutes(nextTime)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || toDateKey(parseDateKey(nextDate)) !== nextDate || !/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(nextTime)) { showToast("Enter a valid date and time.", "error"); return }
    const incomingEnd = incomingStart + Math.max(appointment.duration_minutes || 60, 1) + Math.max(appointment.buffer_minutes || 0, 0)
    const conflict = appointments.find((other) => other.id !== appointment.id && other.appointment_date === nextDate && other.status !== "cancelled" && other.status !== "no_show" && incomingStart < parseTimeToMinutes(other.appointment_time) + Math.max(other.duration_minutes || 60, 1) + Math.max(other.buffer_minutes || 0, 0) && incomingEnd > parseTimeToMinutes(other.appointment_time))
    if (conflict) { showToast(`That time overlaps ${conflict.customer_name}'s appointment. Choose another time.`, "error"); return }
    if (isLive && supabase) {
      const { data, error } = await supabase.from("appointments").update({ appointment_date: nextDate, appointment_time: nextTime }).eq("id", appointment.id).eq("business_id", user.id).select("*")
      if (error || !data?.length) { showToast(error?.message ? `Could not reschedule: ${error.message}` : "Could not reschedule this appointment.", "error"); return }
      const emailResult = await sendAppointmentUpdateEmail({ businessId: user.id, appointmentId: appointment.id, eventType: "reschedule", appointmentDate: nextDate, appointmentTime: nextTime })
      if (!emailResult.ok) showToast(`Appointment rescheduled, but email was not sent: ${emailResult.error}`, "error")
    }
    const next = appointments.map((item) => item.id === appointment.id ? { ...item, appointment_date: nextDate, appointment_time: nextTime } : item)
    persistLocal(next)
    setActiveAppointment((current) => current?.id === appointment.id ? { ...current, appointment_date: nextDate, appointment_time: nextTime } : current)
    setSelectedDate(parseDateKey(nextDate))
    showToast("Appointment rescheduled")
  }

  const handleDeleteAppointment = async (id: string) => {
    if (isLive && supabase) {
      const { data, error } = await supabase
        .from("appointments")
        .delete()
        .eq("id", id)
        .eq("business_id", user.id)
        .select("id")
      if (error || !data?.length) {
        showToast(error?.message ? `Could not remove: ${error.message}` : "Could not remove this appointment.", "error")
        return
      }
    }
    const next = appointments.filter((item) => item.id !== id)
    persistLocal(next)
    setActiveAppointment(null)
    showToast("Appointment removed from calendar")
  }

  // Filtered appointments
  const filteredAppointments = useMemo(() => {
    return appointments.filter((appt) => {
      if (statusFilter !== "all" && appt.status !== statusFilter) return false
      if (staffFilter !== "all" && (appt.staff_member_id || "unassigned") !== staffFilter) return false
      const q = searchQuery.trim().toLowerCase()
      if (!q) return true
      return (
        appt.customer_name.toLowerCase().includes(q) ||
        appt.service_names.toLowerCase().includes(q) ||
        appt.customer_email.toLowerCase().includes(q) ||
        appt.customer_phone.toLowerCase().includes(q)
      )
    })
  }, [appointments, staffFilter, statusFilter, searchQuery])

  // Week days for Week View
  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate])
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, idx) => addDays(weekStart, idx)),
    [weekStart]
  )

  const todayKey = toDateKey(new Date())
  const selectedDateKey = toDateKey(selectedDate)

  // Navigation handlers
  const navigatePeriod = (direction: -1 | 1) => {
    if (viewMode === "day") {
      const next = addDays(selectedDate, direction)
      setSelectedDate(next)
      setMiniMonthDate(next)
    } else if (viewMode === "week" || viewMode === "agenda") {
      const next = addDays(selectedDate, direction * 7)
      setSelectedDate(next)
      setMiniMonthDate(next)
    } else {
      const next = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + direction, 1)
      setSelectedDate(next)
      setMiniMonthDate(next)
    }
  }

  const jumpToToday = () => {
    const now = new Date()
    setSelectedDate(now)
    setMiniMonthDate(now)
  }

  // Header date range label
  const periodLabel = useMemo(() => {
    if (viewMode === "day") {
      return selectedDate.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    }
    if (viewMode === "month") {
      return selectedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    }
    const end = weekDays[6]
    const sameMonth = weekStart.getMonth() === end.getMonth()
    if (sameMonth) {
      return `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.getDate()}, ${end.getFullYear()}`
    }
    return `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
  }, [viewMode, selectedDate, weekStart, weekDays])

  // Mini calendar cells
  const miniCalendarDays = useMemo(() => {
    const year = miniMonthDate.getFullYear()
    const month = miniMonthDate.getMonth()
    const firstDayOfMonth = new Date(year, month, 1)
    const startOffset = (firstDayOfMonth.getDay() + 6) % 7 // Monday = 0
    const startDate = addDays(firstDayOfMonth, -startOffset)
    return Array.from({ length: 42 }, (_, idx) => addDays(startDate, idx))
  }, [miniMonthDate])

  // Month view cells (35 or 42 days)
  const monthViewDays = useMemo(() => {
    const year = selectedDate.getFullYear()
    const month = selectedDate.getMonth()
    const firstDayOfMonth = new Date(year, month, 1)
    const startOffset = (firstDayOfMonth.getDay() + 6) % 7
    const startDate = addDays(firstDayOfMonth, -startOffset)
    return Array.from({ length: 35 }, (_, idx) => addDays(startDate, idx))
  }, [selectedDate])

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, CalendarAppointment[]>()
    filteredAppointments.forEach((appt) => {
      const list = map.get(appt.appointment_date) ?? []
      list.push(appt)
      map.set(appt.appointment_date, list)
    })
    map.forEach((list) =>
      list.sort((a, b) => parseTimeToMinutes(a.appointment_time) - parseTimeToMinutes(b.appointment_time))
    )
    return map
  }, [filteredAppointments])

  const todayAppointmentsCount = (appointmentsByDate.get(todayKey) ?? []).filter(
    (a) => a.status !== "cancelled"
  ).length

  // Time grid range: default 8 AM – 7 PM, widened to fit any real booking outside it
  const { gridStartHour, HOURS } = useMemo(() => {
    let start = GRID_START_HOUR
    let end = GRID_END_HOUR
    filteredAppointments.forEach((appt) => {
      const startMins = parseTimeToMinutes(appt.appointment_time)
      const endMins = startMins + (appt.duration_minutes || 60)
      start = Math.min(start, Math.floor(startMins / 60))
      end = Math.max(end, Math.min(23, Math.ceil(endMins / 60) - 1))
    })
    return {
      gridStartHour: start,
      HOURS: Array.from({ length: end - start + 1 }, (_, idx) => start + idx),
    }
  }, [filteredAppointments])

  const openSlotModal = (dateKey: string, hour: number) => {
    setDraftSlot({ date: dateKey, time: formatMinutesToTime(hour * 60) })
    setNewModalOpen(true)
  }

  const columnsToRender = viewMode === "day" ? [selectedDate] : weekDays

  return (
    <div className="dashboard-shell cal-page-shell">
      <OwnerSidebar user={user} active="Calendar" open={sidebarOpen} onClose={() => setSidebarOpen(false)} onNavigate={(path) => window.location.assign(path)} />

      {/* Main Content */}
      <div className="dashboard-content cal-dashboard-content">
        {/* Calendar Top Toolbar (replaces the workspace sticky header) */}
        <section className="cal-toolbar">
          <div className="cal-toolbar-left">
            <div className="cal-title-group">
              <button
                type="button"
                className="dashboard-menu cal-menu-btn"
                aria-label="Open navigation"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu />
              </button>
              <button
                type="button"
                className={`cal-panel-toggle ${sidePanelOpen ? "is-open" : ""}`}
                onClick={toggleSidePanel}
                aria-pressed={sidePanelOpen}
                aria-label={sidePanelOpen ? "Hide calendar panel" : "Show calendar panel"}
                title={sidePanelOpen ? "Hide panel" : "Show panel"}
              >
                {sidePanelOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
              </button>
              <h1>Calendar</h1>
              <span className="cal-today-badge">{todayAppointmentsCount} today</span>
            </div>

            <div className="cal-date-nav">
              <button type="button" className="cal-today-btn" onClick={jumpToToday}>
                Today
              </button>
              <div className="cal-arrow-group">
                <button
                  type="button"
                  onClick={() => navigatePeriod(-1)}
                  aria-label="Previous period"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => navigatePeriod(1)}
                  aria-label="Next period"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <strong className="cal-period-label">{periodLabel}</strong>
            </div>
          </div>

          <div className="cal-toolbar-right">
            <div className="cal-view-switcher" role="tablist" aria-label="Calendar view mode">
              {(["day", "week", "month", "agenda"] as CalendarViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === mode}
                  className={viewMode === mode ? "active" : ""}
                  onClick={() => setViewMode(mode)}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>

            <Button
              className="cal-new-btn"
              disabled={staffMode}
              aria-label="New appointment"
              onClick={() => {
                setDraftSlot({ date: selectedDateKey, time: "10:00 AM" })
                setNewModalOpen(true)
              }}
            >
              <Plus data-icon="inline-start" /> <span className="cal-new-btn-label">New appointment</span>
            </Button>
          </div>
        </section>

        {/* Calendar Workspace Body */}
        <div className={`cal-workspace ${sidePanelOpen ? "" : "panel-hidden"}`}>
          {/* Left Mini Calendar & Filters Panel (always mounted so it can animate open/closed) */}
          <div className="cal-side-panel-slot" aria-hidden={!sidePanelOpen}>
          <aside className="cal-side-panel">
            <div className="cal-mini-card">
              <div className="cal-mini-header">
                <strong>
                  {miniMonthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </strong>
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      setMiniMonthDate(
                        new Date(miniMonthDate.getFullYear(), miniMonthDate.getMonth() - 1, 1)
                      )
                    }
                    aria-label="Previous month"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setMiniMonthDate(
                        new Date(miniMonthDate.getFullYear(), miniMonthDate.getMonth() + 1, 1)
                      )
                    }
                    aria-label="Next month"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              <div className="cal-mini-weekdays">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <span key={`${d}-${i}`}>{d}</span>
                ))}
              </div>

              <div className="cal-mini-grid">
                {miniCalendarDays.map((day) => {
                  const key = toDateKey(day)
                  const isCurrentMonth = day.getMonth() === miniMonthDate.getMonth()
                  const isToday = key === todayKey
                  const isSelected = key === selectedDateKey
                  const hasAppts = (appointmentsByDate.get(key)?.length ?? 0) > 0

                  return (
                    <button
                      key={key}
                      type="button"
                      className={`cal-mini-day ${!isCurrentMonth ? "outside" : ""} ${
                        isToday ? "today" : ""
                      } ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedDate(day)}
                    >
                      <span>{day.getDate()}</span>
                      {hasAppts && <i className="cal-mini-dot" />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Status Filter */}
            <div className="cal-filter-card">
              <div className="cal-filter-heading">
                <ListFilter size={14} />
                <span>Filter by status</span>
              </div>
              <div className="cal-filter-pills">
                {(
                  [
                    ["all", "All bookings", appointments.length],
                    [
                      "approved",
                      "Approved",
                      appointments.filter((a) => a.status === "approved").length,
                    ],
                    [
                      "completed",
                      "Completed",
                      appointments.filter((a) => a.status === "completed").length,
                    ],
                    [
                      "cancelled",
                      "Cancelled",
                      appointments.filter((a) => a.status === "cancelled").length,
                    ],
                  ] as const
                ).map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    className={`cal-filter-btn ${statusFilter === key ? "active" : ""}`}
                    onClick={() => setStatusFilter(key)}
                  >
                    <span className={`cal-filter-dot is-${key}`} />
                    <span>{label}</span>
                    <strong>{count}</strong>
                  </button>
                ))}
              </div>
            </div>

            <div className="cal-filter-card cal-staff-filter-card">
              <div className="cal-filter-heading"><Users size={14} /><span>View staff calendar</span></div>
              <select aria-label="Filter calendar by staff" value={staffFilter} onChange={(event) => setStaffFilter(event.target.value)}>
                <option value="all">All staff calendars</option>
                <option value="unassigned">Unassigned appointments</option>
                {staff.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
              </select>
            </div>

            {/* Selected Day Quick Agenda */}
            <div className="cal-day-agenda-card">
              <div className="cal-day-agenda-head">
                <strong>
                  {selectedDateKey === todayKey
                    ? "Today’s Schedule"
                    : selectedDate.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                </strong>
                <span>{(appointmentsByDate.get(selectedDateKey) ?? []).length} bookings</span>
              </div>
              <div className="cal-day-agenda-list">
                {(appointmentsByDate.get(selectedDateKey) ?? []).length === 0 ? (
                  <p className="cal-day-agenda-empty">No appointments on this day.</p>
                ) : (
                  (appointmentsByDate.get(selectedDateKey) ?? []).map((appt) => (
                    <button
                      key={appt.id}
                      type="button"
                      className={`cal-mini-appt-item ${appt.color}`}
                      onClick={() => setActiveAppointment(appt)}
                    >
                      <time>{appt.appointment_time}</time>
                      <div>
                        <strong>{appt.customer_name}</strong>
                        <small>{appt.service_names}</small>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </aside>
          </div>

          {/* Main Calendar Canvas */}
          <section className="cal-canvas" aria-label="Appointments calendar">
            {loading ? (
              <div className="cal-loading-state">Loading your schedule…</div>
            ) : viewMode === "day" || viewMode === "week" ? (
              <div className="cal-timegrid-wrapper">
                {/* Day Column Headers */}
                <div
                  className={`cal-timegrid-header ${
                    viewMode === "day" ? "is-day-view" : "is-week-view"
                  }`}
                >
                  <div className="cal-time-gutter-head">GMT+8</div>
                  {columnsToRender.map((day) => {
                    const key = toDateKey(day)
                    const isToday = key === todayKey
                    const isSelected = key === selectedDateKey
                    const dayApptsCount = (appointmentsByDate.get(key) ?? []).filter(
                      (a) => a.status !== "cancelled"
                    ).length

                    return (
                      <button
                        key={key}
                        type="button"
                        className={`cal-col-header ${isToday ? "is-today" : ""} ${
                          isSelected ? "is-selected" : ""
                        }`}
                        onClick={() => setSelectedDate(day)}
                      >
                        <strong>{day.getDate()}</strong>
                        <small>{day.toLocaleDateString("en-US", { weekday: "short" })}</small>
                        {dayApptsCount > 0 && (
                          <span className="cal-col-count">{dayApptsCount}</span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Scrollable Time Grid Body */}
                <div
                  className={`cal-timegrid-body ${
                    viewMode === "day" ? "is-day-view" : "is-week-view"
                  }`}
                >
                  {/* Left Time Labels */}
                  <div className="cal-time-gutter">
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="cal-time-label"
                        style={{ height: `${HOUR_HEIGHT_PX}px` }}
                      >
                        <span>{formatMinutesToTime(hour * 60)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Day Columns */}
                  {columnsToRender.map((day) => {
                    const key = toDateKey(day)
                    const dayAppts = appointmentsByDate.get(key) ?? []
                    const isToday = key === todayKey

                    return (
                      <div key={key} className={`cal-day-column ${isToday ? "is-today" : ""}`}>
                        {/* Clickable hour slots */}
                        {HOURS.map((hour) => (
                          <div
                            key={hour}
                            className="cal-hour-cell"
                            style={{ height: `${HOUR_HEIGHT_PX}px` }}
                            onClick={() => openSlotModal(key, hour)}
                            title={`Click to add appointment at ${formatMinutesToTime(hour * 60)}`}
                          />
                        ))}

                        {/* Positioned Appointment Blocks */}
                        {dayAppts.map((appt, idx) => {
                          const startMins = parseTimeToMinutes(appt.appointment_time)
                          const gridStartMins = gridStartHour * 60
                          const offsetMinutes = Math.max(0, startMins - gridStartMins)
                          const topPx = (offsetMinutes / 60) * HOUR_HEIGHT_PX
                          const heightPx = Math.max(
                            44,
                            ((appt.duration_minutes || 60) / 60) * HOUR_HEIGHT_PX - 4
                          )

                          // Slight horizontal offset if two appointments share the exact same time
                          const overlappingIndex = dayAppts
                            .slice(0, idx)
                            .filter(
                              (other) =>
                                Math.abs(
                                  parseTimeToMinutes(other.appointment_time) - startMins
                                ) < 30
                            ).length

                          return (
                            <button
                              key={appt.id}
                              type="button"
                              className={`cal-event-block ${appt.color} status-${appt.status}`}
                              style={{
                                top: `${topPx + 2}px`,
                                height: `${heightPx}px`,
                                left: overlappingIndex > 0 ? `${Math.min(45, overlappingIndex * 24)}%` : "5px",
                              }}
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveAppointment(appt)
                              }}
                            >
                              <div className="cal-event-top">
                                <span className="cal-event-avatar">
                                  {getInitials(appt.customer_name)}
                                </span>
                                <div className="cal-event-copy">
                                  <strong>{appt.customer_name}</strong>
                                  <small>{appt.service_names}</small>
                                </div>
                              </div>
                              <div className="cal-event-meta">
                                <span>{appt.appointment_time}</span>
                                <b>{appt.total_price}</b>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : viewMode === "month" ? (
              <div className="cal-month-wrapper">
                <div className="cal-month-weekdays">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                <div className="cal-month-grid">
                  {monthViewDays.map((day) => {
                    const key = toDateKey(day)
                    const isCurrentMonth = day.getMonth() === selectedDate.getMonth()
                    const isToday = key === todayKey
                    const dayAppts = appointmentsByDate.get(key) ?? []

                    return (
                      <div
                        key={key}
                        className={`cal-month-cell ${!isCurrentMonth ? "outside" : ""} ${
                          isToday ? "today" : ""
                        }`}
                        onClick={() => {
                          setSelectedDate(day)
                          setViewMode("day")
                        }}
                      >
                        <div className="cal-month-cell-head">
                          <span className="cal-month-day-num">{day.getDate()}</span>
                          {dayAppts.length > 0 && (
                            <small>{dayAppts.length} booked</small>
                          )}
                        </div>
                        <div className="cal-month-events">
                          {dayAppts.slice(0, 3).map((appt) => (
                            <button
                              key={appt.id}
                              type="button"
                              className={`cal-month-pill ${appt.color}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveAppointment(appt)
                              }}
                            >
                              <time>{appt.appointment_time}</time>
                              <strong>{appt.customer_name}</strong>
                            </button>
                          ))}
                          {dayAppts.length > 3 && (
                            <span className="cal-month-more">+{dayAppts.length - 3} more</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              /* Agenda / List View */
              <div className="cal-agenda-wrapper">
                {Array.from(appointmentsByDate.entries()).length === 0 ? (
                  <div className="cal-empty-agenda">
                    <CalendarIcon size={32} />
                    <h3>No appointments found</h3>
                    <p>{staffMode ? "Assigned appointments will appear here when your owner schedules them." : "Create a new appointment or adjust your filters to see bookings."}</p>
                    {!staffMode && <Button
                      onClick={() => {
                        setDraftSlot({ date: selectedDateKey, time: "10:00 AM" })
                        setNewModalOpen(true)
                      }}
                    >
                      <Plus data-icon="inline-start" /> New appointment
                    </Button>}
                  </div>
                ) : (
                  Array.from(appointmentsByDate.entries())
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([dateKey, dayAppts]) => {
                      const d = parseDateKey(dateKey)
                      return (
                        <div key={dateKey} className="cal-agenda-group">
                          <div className="cal-agenda-date-header">
                            <strong>
                              {d.toLocaleDateString("en-US", {
                                weekday: "long",
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </strong>
                            <span>{dayAppts.length} appointments</span>
                          </div>
                          <div className="cal-agenda-rows">
                            {dayAppts.map((appt) => (
                              <button
                                key={appt.id}
                                type="button"
                                className="cal-agenda-row"
                                onClick={() => setActiveAppointment(appt)}
                              >
                                <span className={`cal-client-avatar ${appt.color}`}>
                                  {getInitials(appt.customer_name)}
                                </span>
                                <div className="cal-agenda-main">
                                  <strong>{appt.customer_name}</strong>
                                  <span>{appt.service_names}</span>
                                </div>
                                <div className="cal-agenda-time">
                                  <Clock3 size={14} />
                                  <span>
                                    {formatTimeRange(
                                      appt.appointment_time,
                                      appt.duration_minutes
                                    )}
                                  </span>
                                </div>
                                <strong className="cal-agenda-price">{appt.total_price}</strong>
                                <span className={`cal-status-pill is-${appt.status}`}>
                                  {appt.status}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Slide-over Appointment Details Drawer */}
      <AppointmentDrawer
        appointment={activeAppointment}
        onClose={() => setActiveAppointment(null)}
        onUpdateStatus={handleUpdateStatus}
        onReschedule={handleReschedule}
        onDelete={handleDeleteAppointment}
      />

      {/* New Appointment Modal */}
      <NewAppointmentModal
        open={newModalOpen}
        defaultDate={draftSlot.date}
        defaultTime={draftSlot.time}
        services={services}
        staff={staff}
        onClose={() => setNewModalOpen(false)}
        onCreate={handleCreateAppointment}
      />
    </div>
  )
}
