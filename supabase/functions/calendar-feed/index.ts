type FeedToken = { business_id: string }
type Appointment = { id: string; customer_name: string | null; service_names: string | null; appointment_date: string; appointment_time: string; duration_minutes: number | null; status: string | null }

const apiUrl = () => Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") || ""
const serviceHeaders = () => ({ apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""}`, Accept: "application/json" })
const response = (body: string, status = 200, contentType = "text/calendar; charset=utf-8") => new Response(body, { status, headers: { "Content-Type": contentType, "Cache-Control": "no-store, max-age=0" } })
const escapeIcs = (value: string) => value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")
const parseTime = (value: string) => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!match) return 0
  let hour = Number(match[1])
  if (match[3]) { hour %= 12; if (match[3].toUpperCase() === "PM") hour += 12 }
  return hour * 60 + Number(match[2])
}
const icsDate = (date: string, minutes: number) => {
  const [year, month, day] = date.split("-").map(Number)
  const safe = Math.max(0, minutes)
  const value = new Date(Date.UTC(year, month - 1, day, Math.floor(safe / 60), safe % 60))
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}
const jsonFetch = async <T>(path: string) => {
  const result = await fetch(`${apiUrl()}/rest/v1/${path}`, { headers: serviceHeaders() })
  if (!result.ok) throw new Error(await result.text())
  return await result.json() as T
}

Deno.serve(async (request) => {
  if (request.method !== "GET") return response("Method not allowed", 405, "text/plain; charset=utf-8")
  const token = new URL(request.url).searchParams.get("token")?.trim()
  if (!token) return response("Calendar feed token is required.", 400, "text/plain; charset=utf-8")
  try {
    const tokenRows = await jsonFetch<FeedToken[]>(`calendar_feed_tokens?token=eq.${encodeURIComponent(token)}&select=business_id&limit=1`)
    const businessId = tokenRows[0]?.business_id
    if (!businessId) return response("Calendar feed not found.", 404, "text/plain; charset=utf-8")
    const appointments = await jsonFetch<Appointment[]>(`appointments?business_id=eq.${encodeURIComponent(businessId)}&select=id,customer_name,service_names,appointment_date,appointment_time,duration_minutes,status&order=appointment_date.asc,appointment_time.asc`)
    const active = appointments.filter((item) => !["cancelled", "canceled", "no_show", "declined", "rejected"].includes(String(item.status || "").toLowerCase()))
    const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Bookora//Owner Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"]
    for (const appointment of active) {
      const start = parseTime(appointment.appointment_time)
      const end = start + Math.max(5, Number(appointment.duration_minutes) || 60)
      const summary = `${appointment.service_names || "Appointment"} — ${appointment.customer_name || "Client"}`
      lines.push("BEGIN:VEVENT", `UID:${appointment.id}@bookora`, `DTSTAMP:${now}`, `DTSTART:${icsDate(appointment.appointment_date, start)}`, `DTEND:${icsDate(appointment.appointment_date, end)}`, `SUMMARY:${escapeIcs(summary)}`)
      lines.push("END:VEVENT")
    }
    lines.push("END:VCALENDAR")
    return response(`${lines.join("\r\n")}\r\n`)
  } catch (error) {
    console.error("Calendar feed failed", error)
    return response("Calendar feed temporarily unavailable.", 502, "text/plain; charset=utf-8")
  }
})
