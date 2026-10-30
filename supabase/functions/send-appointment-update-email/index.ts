const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type UpdatePayload = {
  businessId: string
  appointmentId: string
  eventType: "cancellation" | "reschedule"
  appointmentDate?: string
  appointmentTime?: string
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character))

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim()
  if (!apiKey) return json({ error: "Resend API key is not configured" }, 500)
  const payload = await request.json() as UpdatePayload
  if (!payload.businessId || !payload.appointmentId || !["cancellation", "reschedule"].includes(payload.eventType)) return json({ error: "Invalid appointment update payload" }, 400)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") || ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" }
  const appointmentResponse = await fetch(`${supabaseUrl}/rest/v1/appointments?id=eq.${encodeURIComponent(payload.appointmentId)}&business_id=eq.${encodeURIComponent(payload.businessId)}&select=id,business_id,customer_email,customer_name,service_names,appointment_date,appointment_time`, { headers })
  if (!appointmentResponse.ok) return json({ error: "Could not load the appointment" }, 502)
  const appointments = await appointmentResponse.json() as Array<Record<string, string>>
  const appointment = appointments[0]
  if (!appointment) return json({ error: "Appointment not found" }, 404)
  if (!appointment.customer_email || !appointment.customer_email.includes("@")) return json({ skipped: true, reason: "Client has no valid email" })

  const settingsResponse = await fetch(`${supabaseUrl}/rest/v1/notification_settings?business_id=eq.${encodeURIComponent(payload.businessId)}&select=email_enabled,customer_confirmation_enabled&limit=1`, { headers })
  const settingsRows = settingsResponse.ok ? await settingsResponse.json() as Array<{ email_enabled?: boolean; customer_confirmation_enabled?: boolean }> : []
  if (settingsRows[0] && (settingsRows[0].email_enabled === false || settingsRows[0].customer_confirmation_enabled === false)) return json({ skipped: true, reason: "Client email notifications are disabled" })

  const businessResponse = await fetch(`${supabaseUrl}/rest/v1/business_profiles?id=eq.${encodeURIComponent(payload.businessId)}&select=business_name,owner_name&limit=1`, { headers })
  const businessRows = businessResponse.ok ? await businessResponse.json() as Array<{ business_name?: string; owner_name?: string }> : []
  const businessName = businessRows[0]?.business_name || "Bookora"
  const ownerName = businessRows[0]?.owner_name || businessName
  const date = payload.appointmentDate || appointment.appointment_date
  const time = payload.appointmentTime || appointment.appointment_time
  const cancelled = payload.eventType === "cancellation"
  const subject = cancelled ? `Appointment cancelled — ${businessName}` : `Appointment rescheduled — ${businessName}`
  const title = cancelled ? "Appointment Cancelled" : "Appointment Rescheduled"
  const intro = cancelled ? "Your appointment has been cancelled." : "Your appointment has been rescheduled to the following time."
  const text = [`Hi ${appointment.customer_name || "there"},`, "", intro, `Service: ${appointment.service_names || "Appointment"}`, `Date: ${date}`, `Time: ${time}`, `With: ${ownerName}`, "", `If you have questions, please contact ${businessName}.`].join("\n")
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: `${businessName} <${Deno.env.get("RESEND_FROM_EMAIL")?.trim() || "appointments@bookoraph.com"}>`, to: [appointment.customer_email], subject, text, html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#263246"><h2 style="color:#c25750">${title}</h2><p>Hi ${escapeHtml(appointment.customer_name || "there")},</p><p>${intro}</p><p><strong>Service:</strong> ${escapeHtml(appointment.service_names || "Appointment")}<br><strong>Date:</strong> ${escapeHtml(date)}<br><strong>Time:</strong> ${escapeHtml(time)}<br><strong>With:</strong> ${escapeHtml(ownerName)}</p><p>If you have questions, please contact ${escapeHtml(businessName)}.</p></div>` }) })
  const responseText = await response.text()
  const status = response.ok ? "sent" : "failed"
  await fetch(`${supabaseUrl}/rest/v1/notification_events`, { method: "POST", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify({ business_id: payload.businessId, appointment_id: payload.appointmentId, event_type: payload.eventType, channel: "email", recipient: appointment.customer_email, status, provider_message: responseText.slice(0, 2000) }) })
  if (!response.ok) return json({ error: responseText }, response.status)
  return json({ ok: true })
})
