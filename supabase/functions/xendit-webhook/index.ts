const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-callback-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })

const apiUrl = () => Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") || ""
const serviceHeaders = () => ({
  apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""}`,
  "Content-Type": "application/json",
})

const constantTimeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  }
  return diff === 0
}

type XenditInvoicePayload = {
  id?: string
  external_id?: string
  status?: string
  amount?: number
  paid_amount?: number
  currency?: string
  payer_email?: string
  paid_at?: string
  invoice_url?: string
  payment_method?: string
  payment_channel?: string
  metadata?: {
    business_id?: string
    plan_code?: string
    billing_cycle?: string
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const expectedToken = Deno.env.get("XENDIT_CALLBACK_TOKEN") || ""
  const providedToken = request.headers.get("x-callback-token") || ""
  if (!expectedToken || !providedToken || !constantTimeEqual(expectedToken, providedToken)) {
    return json({ error: "Invalid Xendit callback token" }, 401)
  }

  let payload: XenditInvoicePayload
  try {
    payload = await request.json()
  } catch {
    return json({ error: "Invalid JSON payload" }, 400)
  }

  const externalId = String(payload.external_id || "").trim()
  const invoiceId = String(payload.id || "").trim()
  const rawStatus = String(payload.status || "").toUpperCase()

  if (!externalId && !invoiceId) {
    return json({ error: "Missing external_id or invoice id" }, 422)
  }

  // Look up existing checkout session
  const filterParam = externalId
    ? `external_id=eq.${encodeURIComponent(externalId)}`
    : `xendit_invoice_id=eq.${encodeURIComponent(invoiceId)}`
  const sessionRes = await fetch(
    `${apiUrl()}/rest/v1/subscription_checkout_sessions?${filterParam}&limit=1`,
    { headers: serviceHeaders() }
  )
  const sessions = sessionRes.ok ? ((await sessionRes.json()) as Array<Record<string, unknown>>) : []
  const existingSession = sessions[0] || null

  const businessId = String(existingSession?.business_id || payload.metadata?.business_id || "").trim()
  const planCode = String(existingSession?.target_plan_code || payload.metadata?.plan_code || "").trim()
  const billingCycle = String(existingSession?.billing_cycle || payload.metadata?.billing_cycle || "monthly") === "annual"
    ? "annual"
    : "monthly"

  if (!businessId || !planCode) {
    return json({ error: "Unable to resolve target business_id or plan_code for Xendit event" }, 422)
  }

  const normalizedSessionStatus =
    rawStatus === "PAID" || rawStatus === "SETTLED"
      ? "paid"
      : rawStatus === "EXPIRED"
        ? "expired"
        : rawStatus === "FAILED"
          ? "failed"
          : "pending"

  const nowIso = new Date().toISOString()

  if (existingSession?.id) {
    await fetch(
      `${apiUrl()}/rest/v1/subscription_checkout_sessions?id=eq.${encodeURIComponent(String(existingSession.id))}`,
      {
        method: "PATCH",
        headers: serviceHeaders(),
        body: JSON.stringify({
          status: normalizedSessionStatus,
          xendit_invoice_id: invoiceId || existingSession.xendit_invoice_id,
          xendit_invoice_url: payload.invoice_url || existingSession.xendit_invoice_url,
          paid_at: normalizedSessionStatus === "paid" ? payload.paid_at || nowIso : null,
          raw_payload: payload,
          updated_at: nowIso,
        }),
      }
    )
  }

  if (normalizedSessionStatus === "paid") {
    const periodEnd = new Date()
    if (billingCycle === "annual") {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1)
    }

    const subRes = await fetch(
      `${apiUrl()}/rest/v1/business_subscriptions?on_conflict=business_id`,
      {
        method: "POST",
        headers: { ...serviceHeaders(), Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          business_id: businessId,
          plan_code: planCode,
          status: "active",
          billing_provider: "xendit",
          billing_cycle: billingCycle,
          amount_php: Number(payload.paid_amount ?? payload.amount ?? existingSession?.amount_php ?? 0),
          currency: payload.currency || "PHP",
          current_period_start: nowIso,
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: false,
          xendit_latest_invoice_id: invoiceId || null,
          xendit_latest_invoice_url: payload.invoice_url || null,
          xendit_payment_status: rawStatus,
          notes: `Upgraded via Xendit (${payload.payment_channel || payload.payment_method || "invoice"})`,
          updated_at: nowIso,
        }),
      }
    )

    if (!subRes.ok) {
      return json({ error: await subRes.text() }, 502)
    }
  }

  // Record immutable billing audit log
  await fetch(`${apiUrl()}/rest/v1/admin_audit_logs`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify({
      actor_email: payload.payer_email || "xendit-webhook",
      actor_role: "xendit_webhook",
      category: "billing",
      action: `xendit.invoice_${normalizedSessionStatus}`,
      severity: normalizedSessionStatus === "failed" ? "warning" : "info",
      target_user_id: businessId,
      target_business_id: businessId,
      target_email: payload.payer_email || "",
      summary: `Xendit invoice ${invoiceId || externalId} ${rawStatus} for ${planCode} (${billingCycle})`,
      metadata: {
        external_id: externalId,
        xendit_invoice_id: invoiceId,
        amount: payload.amount,
        payment_method: payload.payment_method,
        payment_channel: payload.payment_channel,
      },
    }),
  })

  return json({ accepted: true, status: normalizedSessionStatus, business_id: businessId, plan_code: planCode })
})

