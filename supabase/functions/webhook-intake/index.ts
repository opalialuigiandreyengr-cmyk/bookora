const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, x-bookora-token, x-idempotency-key", "Access-Control-Allow-Methods": "POST, OPTIONS" }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
const baseUrl = () => Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") || ""
const serviceHeaders = () => ({ apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""}`, "Content-Type": "application/json", Accept: "application/json" })
const hashToken = async (token: string) => { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("") }

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405)
  const authHeader = request.headers.get("authorization") || ""
  const token = request.headers.get("x-bookora-token")?.trim() || (authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "")
  if (!token) return json({ error: "API token is required" }, 401)
  const tokenHash = await hashToken(token)
  const tokenResponse = await fetch(`${baseUrl()}/rest/v1/api_tokens?token_hash=eq.${encodeURIComponent(tokenHash)}&revoked_at=is.null&select=id,business_id,scopes&limit=1`, { headers: serviceHeaders() })
  if (!tokenResponse.ok) return json({ error: "Token lookup failed" }, 502)
  const tokenRows = await tokenResponse.json() as Array<{ id: string; business_id: string; scopes: string[] }>
  const apiToken = tokenRows[0]
  if (!apiToken || !apiToken.scopes.includes("webhooks:write")) return json({ error: "Invalid or insufficient API token" }, 401)
  const bodyText = await request.text()
  let payload: Record<string, unknown>
  try { payload = JSON.parse(bodyText) as Record<string, unknown> } catch { return json({ error: "Invalid JSON" }, 400) }
  const eventType = String(payload.event_type || payload.type || "").trim().slice(0, 100)
  const idempotencyKey = (request.headers.get("x-idempotency-key") || String(payload.idempotency_key || "")).trim().slice(0, 180)
  if (!eventType || !idempotencyKey) return json({ error: "event_type and idempotency key are required" }, 422)
  const eventResponse = await fetch(`${baseUrl()}/rest/v1/integration_webhook_events`, { method: "POST", headers: { ...serviceHeaders(), Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ business_id: apiToken.business_id, api_token_id: apiToken.id, event_type: eventType, idempotency_key: idempotencyKey, payload }) })
  if (!eventResponse.ok) return json({ error: await eventResponse.text() }, 502)
  const rows = await eventResponse.json() as unknown[]
  await fetch(`${baseUrl()}/rest/v1/api_tokens?id=eq.${encodeURIComponent(apiToken.id)}`, { method: "PATCH", headers: { ...serviceHeaders(), Prefer: "return=minimal" }, body: JSON.stringify({ last_used_at: new Date().toISOString() }) })
  return json({ accepted: true, duplicate: rows.length === 0, event_id: (rows[0] as { id?: string } | undefined)?.id || null }, 202)
})
