const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
const supabaseUrl = () => Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") || ""
const serviceKey = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const authHeaders = () => ({ apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, "Content-Type": "application/json" })

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character))

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405)
  const url = supabaseUrl(); const key = serviceKey()
  if (!url || !key) return json({ error: "Supabase service configuration is missing" }, 500)
  const bearer = request.headers.get("authorization") || ""
  if (!bearer.toLowerCase().startsWith("bearer ")) return json({ error: "Authentication is required" }, 401)
  const userResponse = await fetch(`${url}/auth/v1/user`, { headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") || key, Authorization: bearer } })
  if (!userResponse.ok) return json({ error: "Authentication could not be verified" }, 401)
  const user = await userResponse.json() as { id?: string; email?: string }
  if (!user.id) return json({ error: "Authentication could not be verified" }, 401)
  const payload = await request.json() as { staffMemberId?: string; email?: string; fullName?: string; businessName?: string; redirectTo?: string }
  const email = String(payload.email || "").trim().toLowerCase()
  if (!payload.staffMemberId || !email || !email.includes("@")) return json({ error: "A staff member and valid email are required" }, 400)
  const staffResponse = await fetch(`${url}/rest/v1/staff_members?id=eq.${encodeURIComponent(payload.staffMemberId)}&business_id=eq.${encodeURIComponent(user.id)}&select=id,email,status`, { headers: { ...authHeaders(), Accept: "application/json" } })
  if (!staffResponse.ok || !(await staffResponse.json() as unknown[]).length) return json({ error: "Only the business owner can send this invitation" }, 403)
  const linkResponse = await fetch(`${url}/auth/v1/admin/generate_link`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ type: "invite", email, options: { redirectTo: payload.redirectTo || `${new URL(request.url).origin}/auth` } }) })
  const linkBody = await linkResponse.json().catch(() => ({})) as { action_link?: string; msg?: string }
  if (!linkResponse.ok || !linkBody.action_link) return json({ error: linkBody.msg || "Could not create an activation link" }, 502)
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim()
  if (resendKey) {
    const name = escapeHtml(String(payload.fullName || "there")); const business = escapeHtml(String(payload.businessName || "your business"))
    const delivery = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: `${Deno.env.get("RESEND_FROM_NAME") || "Bookora"} <${Deno.env.get("RESEND_FROM_EMAIL") || "appointments@bookoraph.com"}>`, to: [email], subject: `You’ve been invited to ${payload.businessName || "Bookora"}`, html: `<p>Hi ${name},</p><p>${business} invited you to join Bookora.</p><p><a href="${escapeHtml(linkBody.action_link)}">Activate your staff account</a></p><p>This invitation link is personal to you. Sign in with this email to claim your staff access.</p>` }))
    if (!delivery.ok) return json({ error: "Activation link was created but the invitation email could not be delivered", actionLink: linkBody.action_link }, 502)
    return json({ sent: true })
  }
  return json({ sent: false, actionLink: linkBody.action_link, message: "Invitation link created. Configure RESEND_API_KEY to send it automatically." })
})
