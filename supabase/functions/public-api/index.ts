const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS" }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
const baseUrl = () => Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") || ""
const serviceHeaders = () => ({ apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""}`, Accept: "application/json" })
const hashToken = async (token: string) => { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("") }
const normalizeTime = (value: string) => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!match || Number(match[2]) > 59 || Number(match[1]) > 23) return null
  let hour = Number(match[1]); const minute = Number(match[2]); const meridiem = match[3]?.toUpperCase()
  if (meridiem) { if (hour < 1 || hour > 12) return null; if (meridiem === "PM" && hour !== 12) hour += 12; if (meridiem === "AM" && hour === 12) hour = 0 }
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`
}
const readJson = async (request: Request) => { try { return await request.json() as Record<string, unknown> } catch { return null } }

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (!["GET", "POST", "PATCH", "DELETE"].includes(request.method)) return json({ error: "Unsupported API method." }, 405)
  const authHeader = request.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""
  if (!token) return json({ error: "Bearer API token is required." }, 401)
  const tokenHash = await hashToken(token)
  const tokenResponse = await fetch(`${baseUrl()}/rest/v1/api_tokens?token_hash=eq.${encodeURIComponent(tokenHash)}&revoked_at=is.null&select=id,business_id,scopes&limit=1`, { headers: serviceHeaders() })
  if (!tokenResponse.ok) return json({ error: "Token lookup failed." }, 502)
  const tokenRows = await tokenResponse.json() as Array<{ id: string; business_id: string; scopes: string[] }>
  const apiToken = tokenRows[0]
  if (!apiToken || (!apiToken.scopes.includes("api:read") && !apiToken.scopes.includes("api:write"))) return json({ error: "Invalid or insufficient API token." }, 401)
  const rateResponse = await fetch(`${baseUrl()}/rest/v1/rpc/consume_api_rate_limit`, { method: "POST", headers: { ...serviceHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ p_token_id: apiToken.id, p_limit: 120 }) })
  if (!rateResponse.ok) return json({ error: "API rate limit could not be checked." }, 503)
  if ((await rateResponse.json()) === false) return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again in one minute." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } })
  const touchToken = () => fetch(`${baseUrl()}/rest/v1/api_tokens?id=eq.${encodeURIComponent(apiToken.id)}`, { method: "PATCH", headers: { ...serviceHeaders(), "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ last_used_at: new Date().toISOString() }) })
  const path = new URL(request.url).pathname.split("/").filter(Boolean)
  const appointmentsIndex = path.lastIndexOf("appointments")
  const appointmentId = appointmentsIndex >= 0 && path.length > appointmentsIndex + 1 ? path[appointmentsIndex + 1] : ""
  const resource = appointmentsIndex >= 0 ? "appointments" : path.at(-1)

  if (request.method === "POST") {
    if (resource !== "appointments" || appointmentId || !apiToken.scopes.includes("api:write")) return json({ error: "api:write scope is required to create appointments." }, 403)
    const input = await readJson(request); if (!input) return json({ error: "Invalid JSON." }, 400)
    const customerName = String(input.customer_name || input.name || "").trim(); const customerEmail = String(input.customer_email || input.email || "").trim().toLowerCase(); const appointmentDate = String(input.appointment_date || input.date || "").trim(); const rawTime = String(input.appointment_time || input.time || "").trim(); const appointmentTime = normalizeTime(rawTime)
    if (!customerName || !/^\S+@\S+\.\S+$/.test(customerEmail) || !/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate) || !appointmentTime) return json({ error: "name, email, date (YYYY-MM-DD), and valid time are required." }, 422)
    const duration = Math.min(1440, Math.max(5, Number(input.duration_minutes) || 60))
    const meetingUrl = String(input.meeting_url || "").trim(); if (meetingUrl && !/^https:\/\//i.test(meetingUrl)) return json({ error: "meeting_url must use HTTPS." }, 422)
    const payload = { business_id: apiToken.business_id, customer_name: customerName, customer_email: customerEmail, customer_phone: String(input.customer_phone || input.phone || "").trim(), customer_address: String(input.customer_address || "").trim(), customer_note: String(input.customer_note || "").trim(), service_names: String(input.service_names || input.service || "Appointment").trim(), total_price: String(input.total_price || "Free"), appointment_date: appointmentDate, appointment_time: appointmentTime, duration_minutes: duration, buffer_minutes: Math.min(240, Math.max(0, Number(input.buffer_minutes) || 0)), meeting_url: meetingUrl, status: "pending" }
    const createResponse = await fetch(`${baseUrl()}/rest/v1/appointments`, { method: "POST", headers: { ...serviceHeaders(), "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(payload) })
    if (!createResponse.ok) { const message = await createResponse.text(); return json({ error: message.includes("overlap") ? "That time overlaps an existing booking." : "Appointment could not be created." }, message.includes("overlap") ? 409 : 422) }
    await touchToken(); return json({ data: (await createResponse.json())[0] || null }, 201)
  }

  if (request.method === "PATCH" || request.method === "DELETE") {
    if (resource !== "appointments" || !appointmentId || !apiToken.scopes.includes("api:write")) return json({ error: "api:write scope and an appointment ID are required." }, 403)
    if (request.method === "DELETE") {
      const response = await fetch(`${baseUrl()}/rest/v1/appointments?id=eq.${encodeURIComponent(appointmentId)}&business_id=eq.${encodeURIComponent(apiToken.business_id)}`, { method: "DELETE", headers: { ...serviceHeaders(), Prefer: "return=representation" } })
      if (!response.ok) return json({ error: "Appointment could not be deleted." }, 422)
      const rows = await response.json() as unknown[]; if (!rows.length) return json({ error: "Appointment not found." }, 404)
      await touchToken(); return json({ data: rows[0] })
    }
    const input = await readJson(request); if (!input) return json({ error: "Invalid JSON." }, 400)
    const payload: Record<string, unknown> = {}
    if (input.status !== undefined) { const status = String(input.status).trim().toLowerCase(); if (!["pending", "approved", "completed", "cancelled", "no_show"].includes(status)) return json({ error: "Invalid appointment status." }, 422); payload.status = status; if (status === "no_show") payload.no_show_reason = String(input.no_show_reason || "").trim() }
    if (input.appointment_date !== undefined || input.date !== undefined) { const date = String(input.appointment_date || input.date || "").trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "date must use YYYY-MM-DD format." }, 422); payload.appointment_date = date }
    if (input.appointment_time !== undefined || input.time !== undefined) { const time = normalizeTime(String(input.appointment_time || input.time || "")); if (!time) return json({ error: "time must use HH:MM or h:MM AM/PM format." }, 422); payload.appointment_time = time }
    if (input.customer_note !== undefined) payload.customer_note = String(input.customer_note).trim()
    if (input.staff_member_id !== undefined) payload.staff_member_id = input.staff_member_id ? String(input.staff_member_id) : null
    if (input.meeting_url !== undefined) { const meetingUrl = String(input.meeting_url || "").trim(); if (meetingUrl && !/^https:\/\//i.test(meetingUrl)) return json({ error: "meeting_url must use HTTPS." }, 422); payload.meeting_url = meetingUrl }
    if (!Object.keys(payload).length) return json({ error: "Provide at least one supported appointment field." }, 422)
    const response = await fetch(`${baseUrl()}/rest/v1/appointments?id=eq.${encodeURIComponent(appointmentId)}&business_id=eq.${encodeURIComponent(apiToken.business_id)}`, { method: "PATCH", headers: { ...serviceHeaders(), "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(payload) })
    if (!response.ok) { const message = await response.text(); return json({ error: message.includes("overlap") ? "That time overlaps an existing booking." : "Appointment could not be updated." }, message.includes("overlap") ? 409 : 422) }
    const rows = await response.json() as unknown[]; if (!rows.length) return json({ error: "Appointment not found." }, 404)
    await touchToken(); return json({ data: rows[0] })
  }

  const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get("limit") || 25)))
  const offset = Math.max(0, Number(new URL(request.url).searchParams.get("offset") || 0))
  const url = new URL(request.url)
  let resourcePath = ""
  if (resource === "services") resourcePath = `services?business_id=eq.${encodeURIComponent(apiToken.business_id)}&show_on_booking_page=eq.true&select=id,name,description,duration_minutes,buffer_minutes,price,deposit_type,deposit_amount,service_hours&order=created_at.asc&limit=${limit}&offset=${offset}`
  else if (resource === "appointments") {
    const status = url.searchParams.get("status")?.trim(); const date = url.searchParams.get("date")?.trim()
    resourcePath = `appointments?business_id=eq.${encodeURIComponent(apiToken.business_id)}&select=id,customer_name,customer_email,service_names,appointment_date,appointment_time,duration_minutes,status,total_price,staff_member_id&order=appointment_date.asc,appointment_time.asc&limit=${limit}&offset=${offset}`
    if (status && /^[a-z_]+$/.test(status)) resourcePath += `&status=eq.${encodeURIComponent(status)}`
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) resourcePath += `&appointment_date=eq.${encodeURIComponent(date)}`
  } else if (resource === "clients") {
    const search = url.searchParams.get("search")?.trim().replace(/[(),]/g, "")
    resourcePath = `clients?business_id=eq.${encodeURIComponent(apiToken.business_id)}&select=id,full_name,email,phone,notes,tags,blocked,created_at,updated_at&order=created_at.desc&limit=${limit}&offset=${offset}`
    if (search) resourcePath += `&or=(full_name.ilike.*${encodeURIComponent(search)}*,email.ilike.*${encodeURIComponent(search)}*,phone.ilike.*${encodeURIComponent(search)}*)`
  } else if (resource === "payments") {
    const status = url.searchParams.get("status")?.trim()
    resourcePath = `payment_transactions?business_id=eq.${encodeURIComponent(apiToken.business_id)}&select=id,appointment_id,client_name,client_email,amount,currency,transaction_type,method,status,note,created_at,updated_at&order=created_at.desc&limit=${limit}&offset=${offset}`
    if (status && /^[a-z_]+$/.test(status)) resourcePath += `&status=eq.${encodeURIComponent(status)}`
  } else return json({ error: "Unknown resource. Use /services, /appointments, /clients, or /payments." }, 404)
  if (!apiToken.scopes.includes("api:read")) return json({ error: "api:read scope is required for this resource." }, 403)
  const resourceResponse = await fetch(`${baseUrl()}/rest/v1/${resourcePath}`, { headers: { ...serviceHeaders(), Prefer: "count=exact" } })
  if (!resourceResponse.ok) return json({ error: "Resource lookup failed." }, 502)
  const data = await resourceResponse.json(); await touchToken()
  const range = resourceResponse.headers.get("content-range") || `*/${Array.isArray(data) ? data.length : 0}`
  return json({ data, pagination: { limit, offset, total: range.split("/")[1] === "*" ? data.length : Number(range.split("/")[1]) } })
})
