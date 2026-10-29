const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type BookingEmailPayload = {
  businessId: string
  bookingId: string
  customerEmail: string
  customerName: string
  businessName: string
  businessLogoUrl?: string
  businessLocation: string
  ownerName: string
  serviceNames: string
  customerNote?: string
  pegImageDataUrl?: string
  paymentReceiptDataUrl?: string
  appointmentDate: string
  appointmentDateKey: string
  appointmentTime: string
  durationMinutes: number
  totalPrice: string
  manageBookingsUrl: string
}

const recordDelivery = async (payload: BookingEmailPayload, status: "sent" | "failed", providerMessage = "") => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey || !payload.businessId) return
  try {
    await fetch(`${supabaseUrl}/rest/v1/notification_events`, {
      method: "POST",
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ business_id: payload.businessId, appointment_id: payload.bookingId, event_type: "booking_confirmation", channel: "email", recipient: payload.customerEmail, status, provider_message: providerMessage.slice(0, 2000) }),
    })
  } catch (error) {
    console.error("Unable to record notification delivery:", error)
  }
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character] || character))

const parseTime = (value: string) => {
  const match = value.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!match) return 0
  let hours = Number(match[1]) % 12
  if (match[3].toUpperCase() === "PM") hours += 12
  return hours * 60 + Number(match[2])
}

const formatIcsDate = (dateKey: string, time: string) => {
  const [year, month, day] = dateKey.split("-").map(Number)
  const totalMinutes = parseTime(time)
  const utc = new Date(Date.UTC(year, month - 1, day, Math.floor(totalMinutes / 60) - 8, totalMinutes % 60))
  return utc.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

const toBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary)
}

const parseDataImage = (value: string) => {
  const match = value.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i)
  if (!match) return null

  const extensionByMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  }
  const mimeType = match[1].toLowerCase()
  return {
    content: match[2].replace(/\s/g, ""),
    filename: `business-logo.${extensionByMime[mimeType] || "bin"}`,
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
})

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const apiKey = Deno.env.get("RESEND_API_KEY")
  let fromEmail = Deno.env.get("RESEND_FROM_EMAIL")?.trim() || "appointments@bookoraph.com"
  if (fromEmail.includes("resend.dev")) {
    fromEmail = "appointments@bookoraph.com"
  }
  const defaultFromName = Deno.env.get("RESEND_FROM_NAME") || "Bookora"
  if (!apiKey) return json({ error: "Resend API key is not configured" }, 500)

  const payload = await request.json() as BookingEmailPayload
  if (!payload.customerEmail || !payload.customerEmail.includes("@")) return json({ error: "A valid customer email is required" }, 400)

  const businessName = escapeHtml(payload.businessName || "Bookora")
  const customerName = escapeHtml(payload.customerName || "there")
  const serviceNames = escapeHtml(payload.serviceNames || "Requested services")
  const businessLocation = escapeHtml(payload.businessLocation || "")
  const ownerName = escapeHtml(payload.ownerName || "the studio owner")
  const customerNote = escapeHtml(payload.customerNote || "")
  const businessInitial = escapeHtml((payload.businessName || "B").trim().charAt(0).toUpperCase())
  const logoCandidate = payload.businessLogoUrl?.trim() || ""
  const remoteLogoUrl = /^https?:\/\//i.test(logoCandidate) ? escapeHtml(logoCandidate) : ""
  const dataLogo = parseDataImage(logoCandidate)
  const pegImage = parseDataImage(payload.pegImageDataUrl?.trim() || "")
  const receiptImage = parseDataImage(payload.paymentReceiptDataUrl?.trim() || "")
  const hasLogo = Boolean(remoteLogoUrl || dataLogo)
  const brandMark = hasLogo
    ? `<img src="cid:business-logo" alt="" width="44" height="44" style="display:block;border:0;border-radius:10px;object-fit:cover">`
    : `<div style="width:44px;height:44px;border-radius:10px;background:#171717;color:#fff;text-align:center;line-height:44px;font-size:20px;font-weight:700">${businessInitial}</div>`
  const calendarStart = formatIcsDate(payload.appointmentDateKey, payload.appointmentTime)
  const startMinutes = parseTime(payload.appointmentTime)
  const endHours = Math.floor((startMinutes + Math.max(5, Number(payload.durationMinutes || 30))) / 60)
  const endMinutes = (startMinutes + Math.max(5, Number(payload.durationMinutes || 30))) % 60
  const endTime = `${String(endHours % 12 || 12)}:${String(endMinutes).padStart(2, "0")} ${endHours >= 12 ? "PM" : "AM"}`
  const calendarEnd = formatIcsDate(payload.appointmentDateKey, endTime)
  const calendarFile = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bookora//Booking//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${payload.bookingId}@bookora.com`,
    `DTSTAMP:${formatIcsDate(payload.appointmentDateKey, payload.appointmentTime)}`,
    `DTSTART:${calendarStart}`,
    `DTEND:${calendarEnd}`,
    `SUMMARY:${payload.serviceNames} at ${payload.businessName}`,
    `DESCRIPTION:Booking ID ${payload.bookingId}. With: ${payload.ownerName}.`,
    `LOCATION:${payload.businessLocation || payload.businessName}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n")

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${payload.businessName || defaultFromName} <${fromEmail}>`,
      to: [payload.customerEmail],
      subject: `Appointment Book: ${payload.appointmentDate} with ${payload.ownerName}`,
      attachments: [
        { filename: "bookora-appointment.ics", content: toBase64(calendarFile) },
        ...(remoteLogoUrl
          ? [{ path: logoCandidate, filename: "business-logo.png", content_id: "business-logo" }]
          : dataLogo
            ? [{ content: dataLogo.content, filename: dataLogo.filename, content_id: "business-logo" }]
            : []),
        ...(pegImage ? [{ content: pegImage.content, filename: `design-peg.${pegImage.filename.split(".").pop()}`, content_id: "design-peg" }] : []),
        ...(receiptImage ? [{ content: receiptImage.content, filename: `payment-receipt.${receiptImage.filename.split(".").pop()}`, content_id: "payment-receipt" }] : []),
      ],
      text: [
        `Hi ${payload.customerName || "there"},`,
        "",
        `Your appointment request for ${payload.businessName} was received. Booking ID: ${payload.bookingId}`,
        `Service: ${payload.serviceNames}`,
        `When: ${payload.appointmentDate} · ${payload.appointmentTime}`,
        `With: ${payload.ownerName}`,
        `Estimated total: ${payload.totalPrice}`,
        ...(payload.customerNote ? [`Note: ${payload.customerNote}`] : []),
        ...(pegImage ? ["Design peg: attached"] : []),
        ...(receiptImage ? ["Payment receipt: attached"] : []),
        "",
        `${payload.businessName} will review your request and contact you soon.`,
        `Manage bookings: ${payload.manageBookingsUrl}`,
      ].join("\n"),
      html: `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;padding:0;background:#f8f6f3;font-family:Arial,Helvetica,sans-serif;color:#263246">
          <tr><td align="center" style="padding:28px 14px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #eaded8;border-radius:14px">
              <tr><td style="padding:22px 24px 14px;border-bottom:1px solid #f0e7e2">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td valign="middle">${brandMark}</td>
                  <td valign="middle" style="padding-left:10px;font-size:20px;font-weight:700;color:#263246">${businessName}</td>
                </tr></table>
              </td></tr>
              <tr><td style="padding:24px">
          <h2 style="margin:0 0 12px;color:#c25750;font-size:24px;line-height:1.2">Appointment Book</h2>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.6">Hi ${customerName},</p>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.6">Your appointment request for <strong>${businessName}</strong> was received.</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffaf8;border:1px solid #eaded8;border-radius:10px">
                  <tr><td style="padding:16px;font-size:14px;line-height:1.55">
                    <p style="margin:0 0 8px"><strong>Booking ID:</strong> ${escapeHtml(payload.bookingId)}</p>
                    <p style="margin:0 0 8px"><strong>Service:</strong> ${serviceNames}</p>
                    <p style="margin:0 0 8px"><strong>When:</strong> ${escapeHtml(payload.appointmentDate)}, ${escapeHtml(payload.appointmentTime)}</p>
                    <p style="margin:0 0 8px"><strong>With:</strong> ${ownerName}</p>
                    <p style="margin:0 0 8px"><strong>Estimated total:</strong> ${escapeHtml(payload.totalPrice)}</p>
                    <p style="margin:0"><strong>Location:</strong> ${businessLocation}</p>
                  </td></tr>
                </table>
                ${customerNote ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.6"><strong>Note:</strong> ${customerNote}</p>` : ""}
                ${pegImage ? `<div style="margin-top:18px"><p style="margin:0 0 8px;font-size:14px;font-weight:700">Design peg</p><img src="cid:design-peg" alt="Design peg attached to booking" width="240" style="display:block;width:100%;max-width:240px;height:auto;border:1px solid #eaded8;border-radius:10px"></div>` : ""}
                ${receiptImage ? `<div style="margin-top:18px"><p style="margin:0 0 8px;font-size:14px;font-weight:700">Payment receipt</p><img src="cid:payment-receipt" alt="Payment receipt attached to booking" width="240" style="display:block;width:100%;max-width:240px;height:auto;border:1px solid #eaded8;border-radius:10px"></div>` : ""}
                <p style="margin:18px 0 14px;font-size:14px;line-height:1.6">${businessName} will review your request and contact you soon.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:7px;background:#d85b53">
                  <a href="${escapeHtml(payload.manageBookingsUrl)}" style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700">Manage bookings</a>
                </td></tr></table>
                <p style="margin:16px 0 0;color:#6f7b89;font-size:12px;line-height:1.5">Your calendar file is attached. Open it to add this appointment to your calendar.</p>
              </td></tr>
              <tr><td style="padding:14px 24px;border-top:1px solid #f0e7e2;color:#8a929e;font-size:12px">Powered by <strong style="color:#b25550">Bookora</strong></td></tr>
            </table>
          </td></tr>
        </table>
      `,
    }),
  })

  const resText = await response.text()
  if (!response.ok) {
    console.error("Resend delivery failed:", response.status, resText)
    await recordDelivery(payload, "failed", resText)
    return json({
      error: resText,
      status: response.status,
      isSandboxRestriction: response.status === 403 && (resText.includes("testing emails") || resText.includes("own email address")),
    }, response.status)
  }

  let resData: any = null
  try {
    resData = JSON.parse(resText)
  } catch {}
  await recordDelivery(payload, "sent", resData?.id ? `Resend message ${resData.id}` : "Delivered to provider")
  return json({ ok: true, data: resData })
})
