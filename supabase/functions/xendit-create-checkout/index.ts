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
  const xenditKey = (Deno.env.get('XENDIT_SECRET_KEY') || '').trim();
  return { supabaseUrl, anonKey, serviceRoleKey, xenditKey };
}

function serviceHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

function xenditHeaders(xenditKey: string) {
  return {
    Authorization: `Basic ${btoa(`${xenditKey}:`)}`,
    'Content-Type': 'application/json',
  };
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

function formatMobileNumber(countryCode?: string | null, phone?: string | null): string | undefined {
  const rawPhone = (phone || '').replace(/[^\d+]/g, '').trim();
  if (!rawPhone) return undefined;
  if (rawPhone.startsWith('+')) return rawPhone;
  const cc = (countryCode || '+63').replace(/[^\d+]/g, '') || '+63';
  const normalizedPhone = rawPhone.startsWith('0') ? rawPhone.slice(1) : rawPhone;
  const prefix = cc.startsWith('+') ? cc : `+${cc}`;
  return `${prefix}${normalizedPhone}`;
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
    const { supabaseUrl, anonKey, serviceRoleKey, xenditKey } = getEnvConfig();
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Supabase environment variables are missing.', xendit_configured: false }, 500);
    }

    if (!xenditKey) {
      return jsonResponse(
        {
          error: 'Xendit payment gateway is not configured yet (XENDIT_SECRET_KEY secret is missing in Supabase).',
          xendit_configured: false,
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
      const invoiceId = typeof body?.invoice_id === 'string' ? body.invoice_id.trim() : '';

      let sessionUrl = `${supabaseUrl}/rest/v1/subscription_checkout_sessions?business_id=eq.${encodeURIComponent(
        user.id
      )}&order=created_at.desc&limit=1`;
      if (externalId) {
        sessionUrl = `${supabaseUrl}/rest/v1/subscription_checkout_sessions?business_id=eq.${encodeURIComponent(
          user.id
        )}&external_id=eq.${encodeURIComponent(externalId)}&limit=1`;
      } else if (invoiceId) {
        sessionUrl = `${supabaseUrl}/rest/v1/subscription_checkout_sessions?business_id=eq.${encodeURIComponent(
          user.id
        )}&xendit_invoice_id=eq.${encodeURIComponent(invoiceId)}&limit=1`;
      }

      const sessionRes = await fetch(sessionUrl, { headers });
      const sessions = (await sessionRes.json().catch(() => [])) as Array<{
        id: string;
        business_id: string;
        target_plan_code: string;
        billing_cycle: 'monthly' | 'annual';
        external_id: string;
        xendit_invoice_id: string | null;
        xendit_invoice_url: string | null;
        amount_php: number;
        status: 'pending' | 'paid' | 'expired' | 'failed';
      }>;

      const checkoutSession = sessions[0];
      if (!checkoutSession) {
        return jsonResponse({
          ok: true,
          xendit_configured: true,
          status: 'none',
          verified: false,
          message: 'No checkout session found to verify yet.',
        });
      }

      if (checkoutSession.status === 'paid') {
        return jsonResponse({
          ok: true,
          xendit_configured: true,
          status: 'paid',
          verified: true,
          already_active: true,
          external_id: checkoutSession.external_id,
          invoice_url: checkoutSession.xendit_invoice_url,
          message: 'Payment already confirmed and subscription is active.',
        });
      }

      if (!checkoutSession.xendit_invoice_id) {
        return jsonResponse({
          ok: true,
          xendit_configured: true,
          status: checkoutSession.status,
          verified: false,
          external_id: checkoutSession.external_id,
          message: 'Checkout invoice ID is missing.',
        });
      }

      const xenditInvoiceRes = await fetch(
        `https://api.xendit.co/v2/invoices/${encodeURIComponent(checkoutSession.xendit_invoice_id)}`,
        { headers: xenditHeaders(xenditKey) }
      );
      const xenditInvoice = await xenditInvoiceRes.json().catch(() => ({}));
      if (!xenditInvoiceRes.ok) {
        return jsonResponse(
          {
            error: xenditInvoice?.message || 'Unable to verify invoice status with Xendit.',
            xendit_configured: true,
          },
          502
        );
      }

      const rawStatus = String(xenditInvoice?.status || 'PENDING').toUpperCase();
      let mappedStatus: 'pending' | 'paid' | 'expired' | 'failed' = 'pending';
      if (rawStatus === 'PAID' || rawStatus === 'SETTLED') mappedStatus = 'paid';
      else if (rawStatus === 'EXPIRED') mappedStatus = 'expired';
      else if (rawStatus === 'FAILED') mappedStatus = 'failed';

      const nowIso = new Date().toISOString();
      if (mappedStatus !== checkoutSession.status) {
        await fetch(
          `${supabaseUrl}/rest/v1/subscription_checkout_sessions?id=eq.${encodeURIComponent(checkoutSession.id)}`,
          {
            method: 'PATCH',
            headers: { ...headers, Prefer: 'return=minimal' },
            body: JSON.stringify({
              status: mappedStatus,
              paid_at: mappedStatus === 'paid' ? xenditInvoice?.paid_at || nowIso : null,
              raw_payload: xenditInvoice,
              updated_at: nowIso,
            }),
          }
        );
      }

      if (mappedStatus === 'paid') {
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
        const planAmount =
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
            billing_provider: 'xendit',
            billing_cycle: checkoutSession.billing_cycle,
            amount_php: Number(checkoutSession.amount_php || planAmount),
            currency: 'PHP',
            current_period_start: start,
            current_period_end: end,
            xendit_latest_invoice_id: String(xenditInvoice?.id || checkoutSession.xendit_invoice_id),
            xendit_latest_invoice_url: String(xenditInvoice?.invoice_url || checkoutSession.xendit_invoice_url || ''),
            xendit_payment_status: rawStatus,
            notes: `Verified via Xendit invoice ${checkoutSession.external_id}`,
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
            action: 'billing.xendit_invoice_verified',
            category: 'billing',
            severity: 'info',
            summary: `Verified paid Xendit invoice (${checkoutSession.target_plan_code}, ${checkoutSession.billing_cycle})`,
            metadata: {
              external_id: checkoutSession.external_id,
              xendit_invoice_id: checkoutSession.xendit_invoice_id,
              amount: checkoutSession.amount_php,
              payment_method: xenditInvoice?.payment_method || null,
            },
          }),
        });
      }

      return jsonResponse({
        ok: true,
        xendit_configured: true,
        status: mappedStatus,
        verified: mappedStatus === 'paid',
        xendit_status: rawStatus,
        external_id: checkoutSession.external_id,
        invoice_url: xenditInvoice?.invoice_url || checkoutSession.xendit_invoice_url,
        message:
          mappedStatus === 'paid'
            ? 'Payment confirmed! Your subscription is now active.'
            : mappedStatus === 'expired'
              ? 'This Xendit invoice has expired. Please generate a new checkout link.'
              : mappedStatus === 'failed'
                ? 'This Xendit payment failed. Please try again.'
                : 'Payment is still awaiting confirmation from Xendit.',
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

    const amount = cycle === 'annual' ? Number(plan.annual_price_php) : Number(plan.monthly_price_php);
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonResponse({ error: 'Selected plan does not require paid checkout.' }, 400);
    }

    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/business_profiles?id=eq.${encodeURIComponent(
        user.id
      )}&select=business_name,email,phone,country_code&limit=1`,
      { headers }
    );
    const profiles = (await profileRes.json().catch(() => [])) as Array<{
      business_name?: string | null;
      email?: string | null;
      phone?: string | null;
      country_code?: string | null;
    }>;
    const profile = profiles[0];
    const payerEmail = (profile?.email || user.email || 'billing@bookoraph.com').trim();
    const customerName = (profile?.business_name || payerEmail.split('@')[0] || 'Bookora PH Business').trim();
    const mobileNumber = formatMobileNumber(profile?.country_code, profile?.phone);

    const externalId = `bookora_sub_${user.id.slice(0, 8)}_${plan.code}_${cycle}_${Date.now()}`;
    const rawSuccessUrl = typeof body?.success_redirect_url === 'string' ? body.success_redirect_url : undefined;
    const rawFailureUrl = typeof body?.failure_redirect_url === 'string' ? body.failure_redirect_url : rawSuccessUrl;

    const successRedirectUrl = appendQueryParams(rawSuccessUrl, {
      xendit_status: 'success',
      external_id: externalId,
    });
    const failureRedirectUrl = appendQueryParams(rawFailureUrl, {
      xendit_status: 'failed',
      external_id: externalId,
    });

    const xenditPayload: Record<string, unknown> = {
      external_id: externalId,
      amount,
      currency: 'PHP',
      payer_email: payerEmail,
      description: `Bookora PH — ${plan.name} Plan (${cycle === 'annual' ? 'Annual · Save 17%' : 'Monthly'})`,
      invoice_duration: 86400,
      customer: {
        given_names: customerName,
        email: payerEmail,
        ...(mobileNumber ? { mobile_number: mobileNumber } : {}),
      },
      items: [
        {
          name: `Bookora PH ${plan.name} (${cycle})`,
          quantity: 1,
          price: amount,
          category: 'SaaS Subscription',
        },
      ],
      metadata: {
        business_id: user.id,
        plan_code: plan.code,
        billing_cycle: cycle,
        source: 'bookoraph',
      },
    };
    if (successRedirectUrl) xenditPayload.success_redirect_url = successRedirectUrl;
    if (failureRedirectUrl) xenditPayload.failure_redirect_url = failureRedirectUrl;

    const xenditRes = await fetch('https://api.xendit.co/v2/invoices', {
      method: 'POST',
      headers: xenditHeaders(xenditKey),
      body: JSON.stringify(xenditPayload),
    });

    const invoice = await xenditRes.json().catch(() => ({}));
    if (!xenditRes.ok || !invoice?.invoice_url) {
      return jsonResponse(
        {
          error: invoice?.message || 'Failed to create Xendit invoice',
          xendit_configured: true,
          details: invoice,
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
        provider: 'xendit',
        external_id: externalId,
        xendit_invoice_id: String(invoice.id || ''),
        xendit_invoice_url: String(invoice.invoice_url),
        amount_php: amount,
        currency: 'PHP',
        status: 'pending',
        raw_payload: invoice,
      }),
    });

    // Keep latest invoice reference on business_subscriptions if row already exists
    await fetch(`${supabaseUrl}/rest/v1/business_subscriptions?business_id=eq.${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        xendit_latest_invoice_id: String(invoice.id || ''),
        xendit_latest_invoice_url: String(invoice.invoice_url),
        xendit_payment_status: String(invoice.status || 'PENDING'),
        updated_at: new Date().toISOString(),
      }),
    });

    return jsonResponse({
      ok: true,
      xendit_configured: true,
      invoice_id: invoice.id,
      invoice_url: invoice.invoice_url,
      external_id: externalId,
      amount_php: amount,
      currency: 'PHP',
      expiry_date: invoice.expiry_date || null,
    });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Unexpected server error', xendit_configured: true },
      500
    );
  }
});
