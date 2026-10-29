const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-payment-signature", "Access-Control-Allow-Methods": "POST, OPTIONS" }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
const apiUrl = () => Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") || ""
const serviceHeaders = () => ({ apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""}`, "Content-Type": "application/json" })
const toHex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
const constantTimeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}
const validSignature = async (body: string, signature: string | null) => {
  const secret = Deno.env.get("PAYMENT_WEBHOOK_SECRET") || ""
  if (!secret || !signature) return false
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const expected = toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))
  return constantTimeEqual(expected, signature)
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405)
  const body = await request.text()
  if (!await validSignature(body, request.headers.get("x-payment-signature"))) return json({ error: "Invalid webhook signature" }, 401)
  let event: { business_id?: string; provider?: string; provider_reference?: string; appointment_id?: string | null; customer_name?: string; customer_email?: string; amount?: number; currency?: string; transaction_type?: string; status?: string; note?: string }
  try { event = JSON.parse(body) } catch { return json({ error: "Invalid JSON" }, 400) }
  const validTypes = ["deposit", "payment", "refund", "adjustment"]
  const validStatuses = ["pending", "paid", "failed", "refunded"]
  if (!event.business_id || !event.provider || !event.provider_reference || !Number.isFinite(Number(event.amount)) || Number(event.amount) <= 0 || !validTypes.includes(String(event.transaction_type || "payment")) || !validStatuses.includes(String(event.status || "paid"))) return json({ error: "Invalid payment event" }, 422)
  const payload = { business_id: event.business_id, provider: event.provider, provider_reference: event.provider_reference, appointment_id: event.appointment_id || null, client_name: event.customer_name || "", client_email: event.customer_email || "", amount: Number(event.amount), currency: event.currency || "PHP", transaction_type: event.transaction_type || "payment", status: event.status || "paid", note: event.note || `Webhook event from ${event.provider}` }
  const response = await fetch(`${apiUrl()}/rest/v1/payment_transactions?on_conflict=business_id,provider,provider_reference`, { method: "POST", headers: { ...serviceHeaders(), Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(payload) })
  if (!response.ok) return json({ error: await response.text() }, 502)
  return json({ accepted: true, payment: (await response.json())[0] || null })
})
