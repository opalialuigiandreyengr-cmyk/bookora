const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, x-worker-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
const baseUrl = () => Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") || ""
const serviceKey = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const serviceHeaders = () => ({ apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, "Content-Type": "application/json", Accept: "application/json" })

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
const signature = async (secret: string, body: string) => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return `sha256=${hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))}`
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405)
  const workerSecret = Deno.env.get("NOTIFICATION_WORKER_SECRET") || ""
  if (!workerSecret || request.headers.get("x-worker-secret") !== workerSecret) return json({ error: "Unauthorized" }, 401)
  const claimedResponse = await fetch(`${baseUrl()}/rest/v1/rpc/claim_outbound_webhook_deliveries`, { method: "POST", headers: serviceHeaders(), body: JSON.stringify({ p_limit: 20 }) })
  if (!claimedResponse.ok) return json({ error: "Could not claim webhook deliveries." }, 502)
  const deliveries = await claimedResponse.json() as Array<{ id: string; event_type: string; payload: Record<string, unknown>; url: string; signing_secret: string; attempt_count: number }>
  let sent = 0; let failed = 0
  for (const delivery of deliveries) {
    const body = JSON.stringify({ event: delivery.event_type, id: delivery.id, created_at: new Date().toISOString(), data: delivery.payload })
    let responseStatus: number | null = null; let responseBody = ""; let errorMessage = ""
    try {
      const response = await fetch(delivery.url, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "Bookora-Webhooks/1.0", "X-Bookora-Event": delivery.event_type, "X-Bookora-Delivery": delivery.id, "X-Bookora-Signature": await signature(delivery.signing_secret, body) }, body, signal: AbortSignal.timeout(10000) })
      responseStatus = response.status; responseBody = (await response.text()).slice(0, 4000)
      if (response.ok) sent += 1; else { failed += 1; errorMessage = `Webhook returned HTTP ${response.status}` }
    } catch (error) { failed += 1; errorMessage = error instanceof Error ? error.message.slice(0, 1000) : "Webhook request failed" }
    await fetch(`${baseUrl()}/rest/v1/rpc/complete_outbound_webhook_delivery`, { method: "POST", headers: serviceHeaders(), body: JSON.stringify({ p_delivery_id: delivery.id, p_status: responseStatus !== null && responseStatus >= 200 && responseStatus < 300 ? "sent" : "failed", p_response_status: responseStatus, p_response_body: responseBody, p_error_message: errorMessage }) })
  }
  return json({ claimed: deliveries.length, sent, failed })
})
