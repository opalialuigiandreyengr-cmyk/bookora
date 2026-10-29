const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" }
type Schedule = { business_id: string; recipient_email: string; frequency: "weekly" | "monthly"; send_day: number; time_zone: string; last_sent_at: string | null; processing_started_at: string | null }
type Appointment = { appointment_date: string; status: string; total_price: string }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
const baseUrl = () => Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") || ""
const headers = () => ({ apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""}`, "Content-Type": "application/json" })
const money = (value: number) => `PHP ${value.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
const localParts = (date: Date, timeZone: string) => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", day: "numeric" }).formatToParts(date)
    return { weekday: parts.find((part) => part.type === "weekday")?.value || "Mon", day: Number(parts.find((part) => part.type === "day")?.value || 1) }
  } catch { return { weekday: "Mon", day: date.getUTCDate() } }
}
const dayOfWeek = (weekday: string) => ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[weekday] || 1)
const isDue = (schedule: Schedule, now: Date) => { const parts = localParts(now, schedule.time_zone || "Asia/Manila"); return schedule.frequency === "weekly" ? dayOfWeek(parts.weekday) === schedule.send_day : parts.day === schedule.send_day }
const cooldownDays = (frequency: Schedule["frequency"]) => frequency === "monthly" ? 25 : 6

const claimSchedule = async (schedule: Schedule, staleBefore: string) => {
  const businessId = encodeURIComponent(schedule.business_id)
  const claimStartedAt = new Date().toISOString()
  const filter = `business_id=eq.${businessId}&or=(processing_started_at.is.null,processing_started_at.lt.${encodeURIComponent(staleBefore)})`
  const response = await fetch(`${baseUrl()}/rest/v1/report_schedules?${filter}`, { method: "PATCH", headers: { ...headers(), Prefer: "return=representation" }, body: JSON.stringify({ processing_started_at: claimStartedAt }) })
  if (!response.ok) return false
  const rows = await response.json() as unknown[]
  return rows.length === 1 ? claimStartedAt : null
}

const releaseSchedule = async (businessId: string, claimStartedAt: string, patch: Record<string, string | null>) => {
  await fetch(`${baseUrl()}/rest/v1/report_schedules?business_id=eq.${encodeURIComponent(businessId)}&processing_started_at=eq.${encodeURIComponent(claimStartedAt)}`, { method: "PATCH", headers: { ...headers(), Prefer: "return=minimal" }, body: JSON.stringify(patch) })
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405)
  if (!Deno.env.get("NOTIFICATION_WORKER_SECRET") || request.headers.get("x-worker-secret") !== Deno.env.get("NOTIFICATION_WORKER_SECRET")) return json({ error: "Unauthorized" }, 401)
  const resendKey = Deno.env.get("RESEND_API_KEY")
  if (!resendKey) return json({ error: "Resend API key is not configured" }, 500)
  const schedulesResponse = await fetch(`${baseUrl()}/rest/v1/report_schedules?enabled=eq.true&select=business_id,recipient_email,frequency,send_day,time_zone,last_sent_at,processing_started_at`, { headers: headers() })
  if (!schedulesResponse.ok) return json({ error: await schedulesResponse.text() }, 502)
  const schedules = await schedulesResponse.json() as Schedule[]
  const now = new Date()
  const staleBefore = new Date(now.getTime() - 10 * 60 * 1000).toISOString()
  let sent = 0
  let claimed = 0
  for (const schedule of schedules) {
    if (!schedule.recipient_email || !isDue(schedule, now) || (schedule.last_sent_at && now.getTime() - new Date(schedule.last_sent_at).getTime() < cooldownDays(schedule.frequency) * 86400000)) continue
    if (schedule.processing_started_at && new Date(schedule.processing_started_at).getTime() >= new Date(staleBefore).getTime()) continue
    const claimStartedAt = await claimSchedule(schedule, staleBefore)
    if (!claimStartedAt) continue
    claimed++
    const from = new Date(now)
    from.setDate(now.getDate() - (schedule.frequency === "monthly" ? 30 : 7))
    const appointmentsResponse = await fetch(`${baseUrl()}/rest/v1/appointments?business_id=eq.${encodeURIComponent(schedule.business_id)}&appointment_date=gte.${from.toISOString().slice(0, 10)}&select=appointment_date,status,total_price`, { headers: headers() })
    if (!appointmentsResponse.ok) { await releaseSchedule(schedule.business_id, claimStartedAt, { processing_started_at: null }); continue }
    const appointments = await appointmentsResponse.json() as Appointment[]
    const active = appointments.filter((item) => item.status !== "cancelled")
    const revenue = active.reduce((sum, item) => sum + (Number(item.total_price.replace(/[^0-9.-]/g, "")) || 0), 0)
    const providerResponse = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: `${Deno.env.get("RESEND_FROM_NAME") || "Bookora"} <${Deno.env.get("RESEND_FROM_EMAIL") || "appointments@bookoraph.com"}>`, to: [schedule.recipient_email], subject: `Your Bookora ${schedule.frequency} report`, text: [`Bookora ${schedule.frequency} report`, `Period: ${from.toISOString().slice(0, 10)} to ${now.toISOString().slice(0, 10)}`, `Bookings: ${appointments.length}`, `Active bookings: ${active.length}`, `Cancelled: ${appointments.length - active.length}`, `Booked value: ${money(revenue)}`].join("\n") }) })
    if (providerResponse.ok) { await releaseSchedule(schedule.business_id, claimStartedAt, { last_sent_at: now.toISOString(), processing_started_at: null }); sent++ }
    else await releaseSchedule(schedule.business_id, claimStartedAt, { processing_started_at: null })
  }
  return json({ schedules: schedules.length, claimed, sent })
})
