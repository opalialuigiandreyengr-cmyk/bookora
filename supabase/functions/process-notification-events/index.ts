const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type NotificationEvent = {
  id: string
  business_id: string
  appointment_id: string | null
  event_type: string
  channel: string
  recipient: string
  status: string
  attempt_count: number
  scheduled_for: string | null
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
const apiUrl = () => Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") || ""
const serviceHeaders = () => ({ apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""}`, "Content-Type": "application/json" })

const updateEvent = async (eventId: string, status: "sent" | "failed", providerMessage: string) => {
  await fetch(`${apiUrl()}/rest/v1/notification_events?id=eq.${encodeURIComponent(eventId)}&status=eq.processing`, {
    method: "PATCH",
    headers: { ...serviceHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify({ status, provider_message: providerMessage.slice(0, 2000) }),
  })
}
const claimEvent = async (event: NotificationEvent, staleBefore: string) => {
  const filter = event.status === "processing"
    ? `id=eq.${encodeURIComponent(event.id)}&status=eq.processing&processing_started_at=lt.${encodeURIComponent(staleBefore)}`
    : `id=eq.${encodeURIComponent(event.id)}&status=eq.scheduled`
  const response = await fetch(`${apiUrl()}/rest/v1/notification_events?${filter}`, {
    method: "PATCH",
    headers: { ...serviceHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({ status: "processing", processing_started_at: new Date().toISOString(), attempt_count: (event.attempt_count || 0) + 1 }),
  })
  if (!response.ok) return false
  const rows = await response.json() as unknown[]
  return rows.length === 1
}
const isQuietHours = async (businessId: string) => {
  const response = await fetch(`${apiUrl()}/rest/v1/notification_settings?business_id=eq.${encodeURIComponent(businessId)}&select=quiet_hours_start,quiet_hours_end&limit=1`, { headers: { ...serviceHeaders(), Accept: "application/json" } })
  if (!response.ok) return false
  const rows = await response.json() as Array<{ quiet_hours_start: string | null; quiet_hours_end: string | null }>
  const start = rows[0]?.quiet_hours_start?.slice(0, 5)
  const end = rows[0]?.quiet_hours_end?.slice(0, 5)
  if (!start || !end) return false
  const now = new Date(); const current = now.getUTCHours() * 60 + now.getUTCMinutes(); const startMinutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)); const endMinutes = Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5))
  return startMinutes <= endMinutes ? current >= startMinutes && current < endMinutes : current >= startMinutes || current < endMinutes
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405)
  const workerSecret = Deno.env.get("NOTIFICATION_WORKER_SECRET")?.trim()
  if (!workerSecret || request.headers.get("x-worker-secret") !== workerSecret) return json({ error: "Unauthorized" }, 401)

  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim()
  const smsProviderUrl = Deno.env.get("SMS_PROVIDER_URL")?.trim()
  const smsProviderKey = Deno.env.get("SMS_PROVIDER_API_KEY")?.trim()
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const eventsResponse = await fetch(`${apiUrl()}/rest/v1/notification_events?or=(status.eq.scheduled,and(status.eq.processing,processing_started_at.lt.${encodeURIComponent(staleBefore)}))&order=created_at.asc&limit=50`, { headers: { ...serviceHeaders(), Accept: "application/json" } })
  if (!eventsResponse.ok) return json({ error: await eventsResponse.text() }, 502)
  const events = await eventsResponse.json() as NotificationEvent[]
  let sent = 0
  let failed = 0
  for (const event of events) {
    if (event.scheduled_for && new Date(event.scheduled_for).getTime() > Date.now()) continue
    if (await isQuietHours(event.business_id)) continue
    if (!await claimEvent(event, staleBefore)) continue
    if (event.channel === "email" && (!resendKey || !event.recipient.includes("@"))) {
      await updateEvent(event.id, "failed", !resendKey ? "Email provider is not configured" : "Recipient email is missing or invalid")
      failed++
      continue
    }
    if (event.channel === "sms" && (!smsProviderUrl || !smsProviderKey || !/^\+?[0-9][0-9\s().-]{6,}$/.test(event.recipient))) {
      await updateEvent(event.id, "failed", !smsProviderUrl || !smsProviderKey ? "SMS provider is not configured" : "Recipient phone number is missing or invalid")
      failed++
      continue
    }
    const label = event.event_type.replace(/_/g, " ")
    const message = `Bookora: ${label} for appointment ${event.appointment_id || "your appointment"}. Please review it in your Bookora workspace.`
    const providerResponse = event.channel === "sms"
      ? await fetch(smsProviderUrl!, { method: "POST", headers: { Authorization: `Bearer ${smsProviderKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ to: event.recipient, from: Deno.env.get("SMS_FROM_NUMBER") || "Bookora", message, event_type: event.event_type, appointment_id: event.appointment_id }) })
      : await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: `${Deno.env.get("RESEND_FROM_NAME") || "Bookora"} <${Deno.env.get("RESEND_FROM_EMAIL") || "appointments@bookoraph.com"}>`, to: [event.recipient], subject: `Bookora ${label}`, text: message }) })
    const providerText = await providerResponse.text()
    if (providerResponse.ok) { await updateEvent(event.id, "sent", providerText.slice(0, 500) || "Delivered to provider"); sent++ }
    else { await updateEvent(event.id, "failed", providerText); failed++ }
  }
  return json({ processed: events.length, sent, failed })
})
