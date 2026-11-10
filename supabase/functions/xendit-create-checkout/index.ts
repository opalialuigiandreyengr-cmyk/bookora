const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })

const apiUrl = () => Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") || ""
const anonKey = () => Deno.env.get("SUPABASE_ANON_KEY") || ""
const serviceHeaders = () => ({
  apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""}`,
  "Content-Type": "application/json",
})

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const authHeader = request.headers.get("Authorization") || ""
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Authentication required" }, 401)
  }

  // Verify the caller JWT with Supabase Auth
  const userRes = await fetch(`${apiUrl()}/auth/v1/user`, {
    headers: {
      apikey: anonKey() || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      Authorization: authHeader,
    },
  })
  if (!userRes.ok) {
    return json({ error: "Invalid or expired user session" }, 401)
  }
  const user = (await userRes.json()) as { id?: string; email?: string }
  if (!user.id) return json({ error: "Authenticated user not found" }, 401)

  let body: { plan_code?: string; billing_cycle?: string; success_redirect_url?: string; failure_redirect_url?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: "Invalid JSON body" }, 400)
  }

  const planCode = String(body.plan_code || "").trim().toLowerCase()
  const billingCycle = body.billing_cycle === "annual" ? "annual" : "monthly"
  if (!planCode) return json({ error: "plan_code is required" }, 422)

  // Look up target plan pricing on server (never trust client-submitted amounts)
  const planRes = await fetch(
    `${apiUrl()}/rest/v1/subscription_plans?code=eq.${encodeURIComponent(planCode)}&is_active=eq.true&limit=1`,
    { headers: serviceHeaders() }
  )
  const plans = planRes.ok ? ((await planRes.json()) as Array<Record<string, unknown>>) : []
  const plan = plans[0]
  if (!plan) return json({ error: "Selected subscription plan was not found" }, 404)

  const amountPhp = Number(billingCycle === "annual" ? plan.annual_price_php : plan.monthly_price_php)
  if (!Number.isFinite(amountPhp) || amountPhp <= 0) {
    return json({ error: "Free plans do not require Xendit checkout." }, 422)
  }

  const xenditKey = Deno.env.get("XENDIT_SECRET_KEY") || ""
  if (!xenditKey) {
    return json(
      {
        error: "Xendit paywall checkout is not enabled yet. Set XENDIT_SECRET_KEY and XENDIT_CALLBACK_TOKEN in Supabase Edge Function secrets to go live.",
        xendit_configured: false,
      },
      503
    )
  }

  const externalId = `bookora-${user.id}-${planCode}-${Date.now()}`
  const xenditAuth = btoa(`${xenditKey}:`)
  const invoiceRes = await fetch("https://api.xendit.co/v2/invoices", {
    method: "POST",
    headers: {
      Authorization: `Basic ${xenditAuth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      external_id: externalId,
      amount: amountPhp,
      currency: "PHP",
      payer_email: user.email || undefined,
      description: `Bookora ${String(plan.name)} Plan (${billingCycle})`,
      success_redirect_url: body.success_redirect_url || undefined,
      failure_redirect_url: body.failure_redirect_url || undefined,
      metadata: {
        business_id: user.id,
        plan_code: planCode,
        billing_cycle: billingCycle,
      },
    }),
  })

  if (!invoiceRes.ok) {
    const errText = await invoiceRes.text()
    return json({ error: `Xendit invoice creation failed: ${errText}` }, 502)
  }

  const invoice = (await invoiceRes.json()) as { id?: string; invoice_url?: string }
  await fetch(`${apiUrl()}/rest/v1/subscription_checkout_sessions`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify({
      business_id: user.id,
      target_plan_code: planCode,
      billing_cycle: billingCycle,
      provider: "xendit",
      external_id: externalId,
      xendit_invoice_id: invoice.id || null,
      xendit_invoice_url: invoice.invoice_url || null,
      amount_php: amountPhp,
      currency: "PHP",
      status: "pending",
      raw_payload: invoice,
    }),
  })

  return json({
    xendit_configured: true,
    external_id: externalId,
    invoice_id: invoice.id,
    invoice_url: invoice.invoice_url,
    amount_php: amountPhp,
  })
})

