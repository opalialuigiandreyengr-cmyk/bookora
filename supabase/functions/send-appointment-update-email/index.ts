const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type UpdatePayload = { businessId: string; appointmentId: string; eventType: "cancellation" | "reschedule"; appointmentDate?: string; appointmentTime?: string }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character))
const parseDataImage = (value: string) => {
  const match = value.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i)
  if (!match) return null
  const extension = match[1].toLowerCase().includes("png") ? "png" : match[1].toLowerCase().includes("webp") ? "webp" : "jpg"
  return { content: match[2].replace(/\s/g, ""), filename: `business-logo.${extension}` }
}

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

  const businessResponse = await fetch(`${supabaseUrl}/rest/v1/business_profiles?id=eq.${encodeURIComponent(payload.businessId)}&select=business_name,owner_name,logo_url,address,city,country&limit=1`, { headers })
  const businessRows = businessResponse.ok ? await businessResponse.json() as Array<{ business_name?: string; owner_name?: string; logo_url?: string; address?: string; city?: string; country?: string }> : []
  const profile = businessRows[0] || {}
  const businessName = profile.business_name || "Bookora"
  const ownerName = profile.owner_name || businessName
  const businessLocation = [profile.address, profile.city, profile.country].filter(Boolean).join(", ")
  const logoCandidate = profile.logo_url?.trim() || ""
  const remoteLogoUrl = /^https?:\/\//i.test(logoCandidate) ? escapeHtml(logoCandidate) : ""
  const dataLogo = parseDataImage(logoCandidate)
  const brandMark = remoteLogoUrl || dataLogo ? `<img src="cid:business-logo" alt="" width="44" height="44" style="display:block;border:0;border-radius:10px;object-fit:cover">` : `<div style="width:44px;height:44px;border-radius:10px;background:#171717;color:#fff;text-align:center;line-height:44px;font-size:20px;font-weight:700">${escapeHtml(businessName.trim().charAt(0).toUpperCase() || "B")}</div>`
  const date = payload.appointmentDate || appointment.appointment_date
  const time = payload.appointmentTime || appointment.appointment_time
  const cancelled = payload.eventType === "cancellation"
  const subject = cancelled ? `Appointment cancelled - ${businessName}` : `Appointment rescheduled - ${businessName}`
  const title = cancelled ? "Appointment Cancelled" : "Appointment Rescheduled"
  const intro = cancelled ? "Your appointment has been cancelled." : "Your appointment has been rescheduled to the following time."
  const text = [`Hi ${appointment.customer_name || "there"},`, "", intro, "", `Service: ${appointment.service_names || "Appointment"}`, `Date: ${date}`, `Time: ${time}`, `With: ${ownerName}`, ...(businessLocation ? [`Location: ${businessLocation}`] : []), "", `If you have questions, please contact ${businessName}.`].join("\n")
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;padding:0;background:#f8f6f3;font-family:Arial,Helvetica,sans-serif;color:#263246"><tr><td align="center" style="padding:28px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#fff;border:1px solid #eaded8;border-radius:14px"><tr><td style="padding:22px 24px 14px;border-bottom:1px solid #f0e7e2"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle">${brandMark}</td><td valign="middle" style="padding-left:10px;font-size:20px;font-weight:700;color:#263246">${escapeHtml(businessName)}</td></tr></table></td></tr><tr><td style="padding:24px"><h2 style="margin:0 0 12px;color:#c25750;font-size:24px;line-height:1.2">${title}</h2><p style="margin:0 0 12px;font-size:15px;line-height:1.6">Hi ${escapeHtml(appointment.customer_name || "there")},</p><p style="margin:0 0 18px;font-size:15px;line-height:1.6">${intro}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffaf8;border:1px solid #eaded8;border-radius:10px"><tr><td style="padding:16px;font-size:14px;line-height:1.55"><p style="margin:0 0 8px"><strong>Service:</strong> ${escapeHtml(appointment.service_names || "Appointment")}</p><p style="margin:0 0 8px"><strong>Date:</strong> ${escapeHtml(date)}</p><p style="margin:0 0 8px"><strong>Time:</strong> ${escapeHtml(time)}</p><p style="margin:0 0 8px"><strong>With:</strong> ${escapeHtml(ownerName)}</p>${businessLocation ? `<p style="margin:0"><strong>Location:</strong> ${escapeHtml(businessLocation)}</p>` : ""}</td></tr></table><p style="margin:18px 0 0;font-size:14px;line-height:1.6">If you have questions, please contact ${escapeHtml(businessName)}.</p></td></tr><tr><td style="padding:14px 24px;border-top:1px solid #f0e7e2;color:#8a929e;font-size:12px">Powered by <strong style="color:#b25550">Bookora</strong></td></tr></table></td></tr></table>`
  const attachments = remoteLogoUrl ? [{ path: logoCandidate, filename: "business-logo.png", content_id: "business-logo" }] : dataLogo ? [{ content: dataLogo.content, filename: dataLogo.filename, content_id: "business-logo" }] : []
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: `${businessName} <${Deno.env.get("RESEND_FROM_EMAIL")?.trim() || "appointments@bookoraph.com"}>`, to: [appointment.customer_email], subject, text, html, attachments }) })
  const responseText = await response.text()
  const status = response.ok ? "sent" : "failed"
  await fetch(`${supabaseUrl}/rest/v1/notification_events`, { method: "POST", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify({ business_id: payload.businessId, appointment_id: payload.appointmentId, event_type: payload.eventType, channel: "email", recipient: appointment.customer_email, status, provider_message: responseText.slice(0, 2000) }) })
  if (!response.ok) return json({ error: responseText }, response.status)
  return json({ ok: true })
})
