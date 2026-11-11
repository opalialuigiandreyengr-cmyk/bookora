import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getEnvConfig() {
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const lsApiKey = (Deno.env.get('LEMONSQUEEZY_API_KEY') || '').trim();
  const lsStoreId = (Deno.env.get('LEMONSQUEEZY_STORE_ID') || '').trim();
  const lsMonthlyVariantId = (
    Deno.env.get('LEMONSQUEEZY_MONTHLY_VARIANT_ID') ||
    Deno.env.get('LEMONSQUEEZY_VARIANT_ID') ||
    ''
  ).trim();
  const lsAnnualVariantId = (
    Deno.env.get('LEMONSQUEEZY_ANNUAL_VARIANT_ID') ||
    lsMonthlyVariantId
  ).trim();

  return {
    supabaseUrl,
    anonKey,
    serviceRoleKey,
    lsApiKey,
    lsStoreId,
    lsMonthlyVariantId,
    lsAnnualVariantId,
  };
}

function serviceHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

function lsHeaders(apiKey: string) {
  return {
    Accept: 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json',
    Authorization: `Bearer ${apiKey}`,
  };
}

/**
 * Pass-through calculation so Lemon Squeezy + international + subscription + payout fees
 * are added cleanly on top of the base Bookora PH plan price.
 */
function calculateCustomerPaidBreakdown(baseAmountPhp: number): {
  basePhp: number;
  feePhp: number;
  totalPhp: number;
} {
  const basePhp = Math.max(0, Math.round(baseAmountPhp));
  if (basePhp <= 0) return { basePhp: 0, feePhp: 0, totalPhp: 0 };
  // Covers ~7% card/intl/subscription + 1% PH bank payout + ~PHP 30 ($0.50 fixed)
  const totalPhp = Math.ceil((basePhp + 30) / 0.92);
  const feePhp = Math.max(0, totalPhp - basePhp);
  return { basePhp, feePhp, totalPhp };
}

function appendQueryParams(rawUrl: string | undefined, params: Record<string, string>): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return undefined;
  try {
    const parsed = new URL(trimmed);
    for (const [k, v] of Object.entries(params)) {
      parsed.searchParams.set(k, v);
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function addBillingInterval(baseIso: string | null | undefined, cycle: 'monthly' | 'annual'): { start: string; end: string } {
  const now = new Date();
  const baseDate = baseIso ? new Date(baseIso) : null;
  const anchor = baseDate && !Number.isNaN(baseDate.getTime()) && baseDate.getTime() > now.getTime() ? baseDate : now;
  const next = new Date(anchor);
  if (cycle === 'annual') {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return {
    start: now.toISOString(),
    end: next.toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const {
      supabaseUrl,
      anonKey,
      serviceRoleKey,
      lsApiKey,
      lsStoreId,
      lsMonthlyVariantId,
      lsAnnualVariantId,
    } = getEnvConfig();

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Supabase environment variables are missing.', configured: false }, 500);
    }

    if (!lsApiKey || !lsStoreId || !lsMonthlyVariantId) {
      return jsonResponse(
        {
          error:
            'Lemon Squeezy is not configured yet (LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID, and LEMONSQUEEZY_MONTHLY_VARIANT_ID are required).',
          configured: false,
        },
        503
      );
    }

    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401);
    }

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey || serviceRoleKey,
        Authorization: `Bearer ${jwt}`,
      },
    });
    if (!userRes.ok) {
      return jsonResponse({ error: 'Unauthorized session. Please sign in again.' }, 401);
    }

    const user = await userRes.json();
    if (!user?.id) {
      return jsonResponse({ error: 'Invalid user session' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === 'string' ? body.action.toLowerCase().trim() : 'create';
    const headers = serviceHeaders(serviceRoleKey);

    if (action === 'verify') {
      const externalId = typeof body?.external_id === 'string' ? body.external_id.trim() : '';

      let sessionUrl = `${supabaseUrl}/rest/v1/subscription_checkout_sessions?business_id=eq.${encodeURIComponent(
        user.id
      )}&order=created_at.desc&limit=1`;
      if (externalId) {
        sessionUrl = `${supabaseUrl}/rest/v1/subscription_checkout_sessions?business_id=eq.${encodeURIComponent(
          user.id
        )}&external_id=eq.${encodeURIComponent(externalId)}&limit=1`;
      }

      const sessionRes = await fetch(sessionUrl, { headers });
      const sessions = (await sessionRes.json().catch(() => [])) as Array<{
        id: string;
        business_id: string;
        target_plan_code: string;
        billing_cycle: 'monthly' | 'annual';
        external_id: string;
        xendit_invoice_url: string | null;
        amount_php: number;
        status: 'pending' | 'paid' | 'expired' | 'failed';
      }>;

      const checkoutSession = sessions[0];
      if (!checkoutSession) {
        return jsonResponse({
          ok: true,
          configured: true,
          status: 'none',
          verified: false,
          message: 'No checkout session found yet.',
        });
      }

      if (checkoutSession.status === 'paid') {
        return jsonResponse({
          ok: true,
          configured: true,
          status: 'paid',
          verified: true,
          already_active: true,
          external_id: checkoutSession.external_id,
          checkout_url: checkoutSession.xendit_invoice_url,
          message: 'Payment confirmed! Your subscription is active.',
        });
      }

      // Check Lemon Squeezy orders by buyer email / profile email in case webhook is still in flight
      const profileRes = await fetch(
        `${supabaseUrl}/rest/v1/business_profiles?id=eq.${encodeURIComponent(user.id)}&select=email&limit=1`,
        { headers }
      );
      const profiles = (await profileRes.json().catch(() => [])) as Array<{ email?: string | null }>;
      const emailsToCheck = Array.from(
        new Set([user.email, profiles[0]?.email].filter((e): e is string => Boolean(e && e.trim())))
      );

      let matchedPaidOrder: { id: string; attributes?: Record<string, unknown> } | null = null;
      const sessionCreatedAtMs = Date.now() - 24 * 60 * 60 * 1000;

      for (const email of emailsToCheck) {
        const ordersRes = await fetch(
          `https://api.lemonsqueezy.com/v1/orders?filter[store_id]=${encodeURIComponent(
            lsStoreId
          )}&filter[user_email]=${encodeURIComponent(email)}`,
          { headers: lsHeaders(lsApiKey) }
        );
        if (!ordersRes.ok) continue;
        const ordersJson = await ordersRes.json().catch(() => ({}));
        const orders = Array.isArray(ordersJson?.data) ? ordersJson.data : [];
        for (const order of orders) {
          const attrs = order?.attributes || {};
          const orderStatus = String(attrs?.status || '').toLowerCase();
          const createdAt = attrs?.created_at ? new Date(String(attrs.created_at)).getTime() : 0;
          if (orderStatus === 'paid' && createdAt >= sessionCreatedAtMs) {
            matchedPaidOrder = order;
            break;
          }
        }
        if (matchedPaidOrder) break;
      }

      if (matchedPaidOrder) {
        const nowIso = new Date().toISOString();
        await fetch(
          `${supabaseUrl}/rest/v1/subscription_checkout_sessions?id=eq.${encodeURIComponent(checkoutSession.id)}`,
          {
            method: 'PATCH',
            headers: { ...headers, Prefer: 'return=minimal' },
            body: JSON.stringify({
              status: 'paid',
              paid_at: String(matchedPaidOrder.attributes?.created_at || nowIso),
              raw_payload: matchedPaidOrder,
              updated_at: nowIso,
            }),
          }
        );

        const currentSubRes = await fetch(
          `${supabaseUrl}/rest/v1/business_subscriptions?business_id=eq.${encodeURIComponent(
            user.id
          )}&select=current_period_end&limit=1`,
          { headers }
        );
        const currentSubs = (await currentSubRes.json().catch(() => [])) as Array<{ current_period_end?: string | null }>;
        const { start, end } = addBillingInterval(currentSubs[0]?.current_period_end, checkoutSession.billing_cycle);

        const planRes = await fetch(
          `${supabaseUrl}/rest/v1/subscription_plans?code=eq.${encodeURIComponent(checkoutSession.target_plan_code)}&limit=1`,
          { headers }
        );
        const plans = (await planRes.json().catch(() => [])) as Array<{
          monthly_price_php?: number;
          annual_price_php?: number;
        }>;
        const plan = plans[0];
        const planBaseAmount =
          checkoutSession.billing_cycle === 'annual'
            ? Number(plan?.annual_price_php ?? checkoutSession.amount_php)
            : Number(plan?.monthly_price_php ?? checkoutSession.amount_php);

        await fetch(`${supabaseUrl}/rest/v1/business_subscriptions?on_conflict=business_id`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({
            business_id: user.id,
            plan_code: checkoutSession.target_plan_code,
            status: 'active',
            billing_provider: 'lemonsqueezy',
            billing_cycle: checkoutSession.billing_cycle,
            amount_php: planBaseAmount,
            currency: 'PHP',
            current_period_start: start,
            current_period_end: end,
            xendit_latest_invoice_id: `ls_order_${matchedPaidOrder.id}`,
            xendit_latest_invoice_url: checkoutSession.xendit_invoice_url || '',
            xendit_payment_status: 'PAID',
            notes: `Paid via Lemon Squeezy order ${matchedPaidOrder.id}`,
            updated_at: nowIso,
          }),
        });

        await fetch(`${supabaseUrl}/rest/v1/admin_audit_logs`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({
            actor_user_id: user.id,
            actor_email: user.email || '',
            actor_role: 'owner',
            target_user_id: user.id,
            target_business_id: user.id,
            target_email: user.email || '',
            action: 'billing.lemonsqueezy_order_verified',
            category: 'billing',
            severity: 'info',
            summary: `Verified paid Lemon Squeezy checkout (${checkoutSession.target_plan_code}, ${checkoutSession.billing_cycle})`,
            metadata: {
              external_id: checkoutSession.external_id,
              order_id: matchedPaidOrder.id,
              charged_php: checkoutSession.amount_php,
            },
          }),
        });

        return jsonResponse({
          ok: true,
          configured: true,
          status: 'paid',
          verified: true,
          external_id: checkoutSession.external_id,
          checkout_url: checkoutSession.xendit_invoice_url,
          message: 'Payment confirmed! Your subscription is now active.',
        });
      }

      return jsonResponse({
        ok: true,
        configured: true,
        status: checkoutSession.status,
        verified: false,
        external_id: checkoutSession.external_id,
        checkout_url: checkoutSession.xendit_invoice_url,
        message: 'Payment is still awaiting confirmation from Lemon Squeezy.',
      });
    }

    // action === 'create'
    const planCode = typeof body?.plan_code === 'string' ? body.plan_code.toLowerCase().trim() : '';
    const cycle: 'monthly' | 'annual' = body?.billing_cycle === 'annual' ? 'annual' : 'monthly';
    if (!planCode) {
      return jsonResponse({ error: 'plan_code is required' }, 400);
    }

    const planRes = await fetch(
      `${supabaseUrl}/rest/v1/subscription_plans?code=eq.${encodeURIComponent(planCode)}&is_active=eq.true&limit=1`,
      { headers }
    );
    const plans = (await planRes.json().catch(() => [])) as Array<{
      code: string;
      name: string;
      monthly_price_php: number;
      annual_price_php: number;
    }>;
    const plan = plans[0];
    if (!plan) {
      return jsonResponse({ error: `Subscription plan "${planCode}" was not found.` }, 404);
    }

    const rawBaseAmount = cycle === 'annual' ? Number(plan.annual_price_php) : Number(plan.monthly_price_php);
    if (!Number.isFinite(rawBaseAmount) || rawBaseAmount <= 0) {
      return jsonResponse({ error: 'Selected plan does not require paid checkout.' }, 400);
    }

    const { basePhp, feePhp, totalPhp } = calculateCustomerPaidBreakdown(rawBaseAmount);
    const variantId = cycle === 'annual' ? lsAnnualVariantId : lsMonthlyVariantId;

    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/business_profiles?id=eq.${encodeURIComponent(
        user.id
      )}&select=business_name,email&limit=1`,
      { headers }
    );
    const profiles = (await profileRes.json().catch(() => [])) as Array<{
      business_name?: string | null;
      email?: string | null;
    }>;
    const profile = profiles[0];
    const payerEmail = (profile?.email || user.email || '').trim();
    const customerName = (profile?.business_name || payerEmail.split('@')[0] || 'Bookora PH Business').trim();

    const externalId = `bookora_ls_${user.id.slice(0, 8)}_${plan.code}_${cycle}_${Date.now()}`;
    const rawSuccessUrl = typeof body?.success_redirect_url === 'string' ? body.success_redirect_url : undefined;
    const redirectUrl = appendQueryParams(rawSuccessUrl, {
      checkout_status: 'success',
      external_id: externalId,
    });

    const lsPayload = {
      data: {
        type: 'checkouts',
        attributes: {
          custom_price: Math.round(totalPhp * 100),
          product_options: {
            name: `Bookora PH — ${plan.name} (${cycle === 'annual' ? 'Annual · Save 17%' : 'Monthly'})`,
            description: `Plan ${basePhp} PHP + Google Pay / Card / PayPal processing fee ${feePhp} PHP`,
            ...(redirectUrl ? { redirect_url: redirectUrl } : {}),
            redirect_url_target: '_top',
          },
          checkout_options: {
            button_color: '#FF6B57',
          },
          checkout_data: {
            ...(payerEmail ? { email: payerEmail } : {}),
            name: customerName,
            custom: {
              business_id: user.id,
              plan_code: plan.code,
              billing_cycle: cycle,
              external_id: externalId,
              base_amount_php: String(basePhp),
              fee_amount_php: String(feePhp),
              total_amount_php: String(totalPhp),
            },
          },
        },
        relationships: {
          store: {
            data: {
              type: 'stores',
              id: lsStoreId,
            },
          },
          variant: {
            data: {
              type: 'variants',
              id: variantId,
            },
          },
        },
      },
    };

    const lsRes = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: lsHeaders(lsApiKey),
      body: JSON.stringify(lsPayload),
    });

    const lsJson = await lsRes.json().catch(() => ({}));
    const checkoutUrl = lsJson?.data?.attributes?.url;
    const checkoutId = lsJson?.data?.id ? String(lsJson.data.id) : '';

    if (!lsRes.ok || !checkoutUrl) {
      const apiDetail =
        lsJson?.errors?.[0]?.detail || lsJson?.message || 'Failed to create Lemon Squeezy checkout.';
      return jsonResponse(
        {
          error: apiDetail,
          configured: true,
          details: lsJson,
        },
        502
      );
    }

    await fetch(`${supabaseUrl}/rest/v1/subscription_checkout_sessions`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        business_id: user.id,
        target_plan_code: plan.code,
        billing_cycle: cycle,
        provider: 'lemonsqueezy',
        external_id: externalId,
        xendit_invoice_id: checkoutId,
        xendit_invoice_url: String(checkoutUrl),
        amount_php: totalPhp,
        currency: 'PHP',
        status: 'pending',
        raw_payload: lsJson,
      }),
    });

    await fetch(`${supabaseUrl}/rest/v1/business_subscriptions?business_id=eq.${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        xendit_latest_invoice_id: checkoutId,
        xendit_latest_invoice_url: String(checkoutUrl),
        xendit_payment_status: 'PENDING',
        updated_at: new Date().toISOString(),
      }),
    });

    return jsonResponse({
      ok: true,
      configured: true,
      checkout_id: checkoutId,
      checkout_url: String(checkoutUrl),
      external_id: externalId,
      base_amount_php: basePhp,
      fee_amount_php: feePhp,
      total_amount_php: totalPhp,
      currency: 'PHP',
    });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Unexpected server error', configured: true },
      500
    );
  }
});

