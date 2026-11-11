import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, x-event-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function verifySignature(rawBody: string, signatureHex: string, secret: string): Promise<boolean> {
  if (!signatureHex || !secret) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const computedHex = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (computedHex.length !== signatureHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computedHex.length; i += 1) {
    mismatch |= computedHex.charCodeAt(i) ^ signatureHex.charCodeAt(i);
  }
  return mismatch === 0;
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
    const webhookSecret = (Deno.env.get('LEMONSQUEEZY_WEBHOOK_SECRET') || '').trim();
    const rawBody = await req.text();
    const signature = (req.headers.get('x-signature') || '').trim();

    if (!webhookSecret || !(await verifySignature(rawBody, signature, webhookSecret))) {
      return jsonResponse({ error: 'Invalid webhook signature' }, 401);
    }

    const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Missing Supabase server configuration' }, 500);
    }

    const payload = JSON.parse(rawBody || '{}');
    const eventName = String(payload?.meta?.event_name || req.headers.get('x-event-name') || '').trim();
    const customData = (payload?.meta?.custom_data || {}) as Record<string, string | undefined>;
    const attrs = (payload?.data?.attributes || {}) as Record<string, unknown>;
    const resourceId = payload?.data?.id ? String(payload.data.id) : '';

    const businessId = (customData.business_id || '').trim();
    const externalId = (customData.external_id || '').trim();
    if (!businessId) {
      return jsonResponse({ ok: true, ignored: true, reason: 'Missing custom_data.business_id' });
    }

    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    };
    const nowIso = new Date().toISOString();

    if (eventName === 'subscription_expired' || eventName === 'subscription_payment_failed') {
      const nextSubStatus = eventName === 'subscription_expired' ? 'expired' : 'past_due';
      await fetch(`${supabaseUrl}/rest/v1/business_subscriptions?business_id=eq.${encodeURIComponent(businessId)}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: nextSubStatus,
          xendit_payment_status: eventName.toUpperCase(),
          updated_at: nowIso,
        }),
      });
      return jsonResponse({ ok: true, event: eventName, status: nextSubStatus });
    }

    const isPaidEvent =
      (eventName === 'order_created' && String(attrs.status || '').toLowerCase() === 'paid') ||
      eventName === 'subscription_payment_success';

    if (!isPaidEvent) {
      return jsonResponse({ ok: true, ignored: true, event: eventName });
    }

    const planCode = (customData.plan_code || 'starter').toLowerCase().trim();
    const cycle: 'monthly' | 'annual' = customData.billing_cycle === 'annual' ? 'annual' : 'monthly';

    let alreadyPaid = false;
    if (externalId) {
      const sessionRes = await fetch(
        `${supabaseUrl}/rest/v1/subscription_checkout_sessions?external_id=eq.${encodeURIComponent(externalId)}&limit=1`,
        { headers }
      );
      const sessions = (await sessionRes.json().catch(() => [])) as Array<{ id: string; status: string }>;
      const existing = sessions[0];
      if (existing) {
        alreadyPaid = existing.status === 'paid' && eventName === 'order_created';
        await fetch(
          `${supabaseUrl}/rest/v1/subscription_checkout_sessions?id=eq.${encodeURIComponent(existing.id)}`,
          {
            method: 'PATCH',
            headers: { ...headers, Prefer: 'return=minimal' },
            body: JSON.stringify({
              status: 'paid',
              paid_at: String(attrs.created_at || nowIso),
              raw_payload: payload,
              updated_at: nowIso,
            }),
          }
        );
      }
    }

    if (!alreadyPaid) {
      const currentSubRes = await fetch(
        `${supabaseUrl}/rest/v1/business_subscriptions?business_id=eq.${encodeURIComponent(
          businessId
        )}&select=current_period_end&limit=1`,
        { headers }
      );
      const currentSubs = (await currentSubRes.json().catch(() => [])) as Array<{ current_period_end?: string | null }>;
      const lsPeriodEnd =
        typeof attrs.renews_at === 'string'
          ? attrs.renews_at
          : typeof attrs.ends_at === 'string'
            ? attrs.ends_at
            : null;
      const fallbackInterval = addBillingInterval(currentSubs[0]?.current_period_end, cycle);
      const periodEnd = lsPeriodEnd || fallbackInterval.end;

      const planRes = await fetch(
        `${supabaseUrl}/rest/v1/subscription_plans?code=eq.${encodeURIComponent(planCode)}&limit=1`,
        { headers }
      );
      const plans = (await planRes.json().catch(() => [])) as Array<{
        monthly_price_php?: number;
        annual_price_php?: number;
      }>;
      const plan = plans[0];
      const baseAmount =
        Number(customData.base_amount_php) ||
        (cycle === 'annual' ? Number(plan?.annual_price_php ?? 2480) : Number(plan?.monthly_price_php ?? 249));

      await fetch(`${supabaseUrl}/rest/v1/business_subscriptions?on_conflict=business_id`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          business_id: businessId,
          plan_code: planCode,
          status: 'active',
          billing_provider: 'lemonsqueezy',
          billing_cycle: cycle,
          amount_php: baseAmount,
          currency: 'PHP',
          current_period_start: fallbackInterval.start,
          current_period_end: periodEnd,
          xendit_subscription_id:
            typeof attrs.subscription_id === 'number' || typeof attrs.subscription_id === 'string'
              ? String(attrs.subscription_id)
              : eventName.startsWith('subscription_')
                ? resourceId
                : null,
          xendit_latest_invoice_id: `ls_${resourceId}`,
          xendit_payment_status: 'PAID',
          notes: `Paid via Lemon Squeezy (${eventName}, ID ${resourceId})`,
          updated_at: nowIso,
        }),
      });

      await fetch(`${supabaseUrl}/rest/v1/admin_audit_logs`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({
          target_user_id: businessId,
          target_business_id: businessId,
          target_email: typeof attrs.user_email === 'string' ? attrs.user_email : '',
          action: `billing.lemonsqueezy_${eventName}`,
          category: 'billing',
          severity: 'info',
          summary: `Lemon Squeezy payment settled (${planCode}, ${cycle})`,
          metadata: {
            external_id: externalId || null,
            resource_id: resourceId,
            base_amount_php: baseAmount,
            total_charged_php: Number(customData.total_amount_php || baseAmount),
          },
        }),
      });
    }

    return jsonResponse({ ok: true, event: eventName, status: 'paid', idempotent: alreadyPaid });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unexpected server error' }, 500);
  }
});

