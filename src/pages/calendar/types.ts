export type CalendarViewMode = "day" | "week" | "month" | "agenda"

export type AppointmentColor = "coral" | "lilac" | "peach" | "mint" | "blue"

export interface CalendarAppointment {
  id: string
  business_id: string
  customer_name: string
  customer_email: string
  customer_phone: string
  customer_address?: string
  customer_note?: string
  service_names: string
  total_price: string
  appointment_date: string // YYYY-MM-DD
  appointment_time: string // e.g. "10:30 AM"
  duration_minutes: number
  buffer_minutes?: number
  status: "approved" | "completed" | "cancelled" | "pending"
  peg_image_path?: string | null
  payment_receipt_path?: string | null
  color: AppointmentColor
}

export interface CalendarServiceOption {
  id?: string
  name: string
  duration_minutes: number
  price: string
}

const COLOR_PALETTE: AppointmentColor[] = ["coral", "lilac", "peach", "mint", "blue"]

export function pickAppointmentColor(seed: string): AppointmentColor {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return COLOR_PALETTE[hash % COLOR_PALETTE.length]
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number)
  if (!y || !m || !d) return new Date()
  return new Date(y, m - 1, d)
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay() // 0 = Sun, 1 = Mon
  const diff = day === 0 ? -6 : 1 - day // Monday start
  d.setDate(d.getDate() + diff)
  return d
}

export function parseTimeToMinutes(timeStr: string): number {
  const cleaned = timeStr.trim().toUpperCase()
  const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/)
  if (!match) return 9 * 60
  let hours = Number(match[1])
  const minutes = Number(match[2])
  const meridiem = match[3]
  if (meridiem === "PM" && hours < 12) hours += 12
  if (meridiem === "AM" && hours === 12) hours = 0
  return hours * 60 + minutes
}

export function formatMinutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes))
  const hours24 = Math.floor(clamped / 60)
  const mins = clamped % 60
  const meridiem = hours24 >= 12 ? "PM" : "AM"
  const hours12 = hours24 % 12 || 12
  return `${hours12}:${String(mins).padStart(2, "0")} ${meridiem}`
}

export function formatTimeRange(startTimeStr: string, durationMinutes: number): string {
  const startMins = parseTimeToMinutes(startTimeStr)
  const endMins = startMins + (durationMinutes || 60)
  return `${formatMinutesToTime(startMins)} – ${formatMinutesToTime(endMins)}`
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "CL"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function buildDemoAppointments(anchorDate: Date, businessId: string): CalendarAppointment[] {
  const weekStart = startOfWeek(anchorDate)
  const todayKey = toDateKey(anchorDate)
  const tueKey = toDateKey(addDays(weekStart, 1))
  const wedKey = toDateKey(addDays(weekStart, 2))
  const thuKey = toDateKey(addDays(weekStart, 3))
  const friKey = toDateKey(addDays(weekStart, 4))

  return [
    {
      id: "demo-appt-1",
      business_id: businessId,
      customer_name: "Anna Reyes",
      customer_email: "anna.reyes@example.com",
      customer_phone: "+63 917 204 8812",
      customer_note: "Prefers soft neutral nude gel shade.",
      service_names: "Softgel Extension",
      total_price: "₱650",
      appointment_date: todayKey,
      appointment_time: "9:00 AM",
      duration_minutes: 60,
      status: "approved",
      color: "coral",
    },
    {
      id: "demo-appt-2",
      business_id: businessId,
      customer_name: "Liza Gomez",
      customer_email: "liza.gomez@example.com",
      customer_phone: "+63 918 552 3109",
      customer_note: "French tip nail art request.",
      service_names: "Gel Manicure & Nail Art",
      total_price: "₱850",
      appointment_date: todayKey,
      appointment_time: "11:00 AM",
      duration_minutes: 90,
      status: "approved",
      color: "lilac",
    },
    {
      id: "demo-appt-3",
      business_id: businessId,
      customer_name: "Maria Cruz",
      customer_email: "maria.cruz@example.com",
      customer_phone: "+63 917 891 4420",
      customer_note: "",
      service_names: "Classic Facial & Glow",
      total_price: "₱900",
      appointment_date: todayKey,
      appointment_time: "2:00 PM",
      duration_minutes: 60,
      status: "approved",
      color: "mint",
    },
    {
      id: "demo-appt-4",
      business_id: businessId,
      customer_name: "Sofia Lim",
      customer_email: "sofia.lim@example.com",
      customer_phone: "+63 919 330 7115",
      customer_note: "First time client.",
      service_names: "Hair Treatment & Blowout",
      total_price: "₱1,200",
      appointment_date: tueKey === todayKey ? wedKey : tueKey,
      appointment_time: "10:00 AM",
      duration_minutes: 90,
      status: "approved",
      color: "peach",
    },
    {
      id: "demo-appt-5",
      business_id: businessId,
      customer_name: "Ella Tan",
      customer_email: "ella.tan@example.com",
      customer_phone: "+63 917 612 9084",
      customer_note: "",
      service_names: "Gel Pedicure",
      total_price: "₱550",
      appointment_date: thuKey,
      appointment_time: "1:00 PM",
      duration_minutes: 60,
      status: "approved",
      color: "blue",
    },
    {
      id: "demo-appt-6",
      business_id: businessId,
      customer_name: "Camille Santos",
      customer_email: "camille.s@example.com",
      customer_phone: "+63 917 401 2290",
      customer_note: "Bridal prep package.",
      service_names: "Full Set Softgel + Spa Pedi",
      total_price: "₱1,450",
      appointment_date: friKey,
      appointment_time: "3:30 PM",
      duration_minutes: 90,
      status: "approved",
      color: "coral",
    },
  ]
}

