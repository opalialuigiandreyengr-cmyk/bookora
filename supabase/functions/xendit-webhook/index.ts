import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-callback-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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
    const expectedToken = (Deno.env.get('XENDIT_CALLBACK_TOKEN') || '').trim();
    const providedToken = (req.headers.get('x-callback-token') || '').trim();
    if (!expectedToken || providedToken !== expectedToken) {
      return jsonResponse({ error: 'Invalid callback token' }, 401);
    }

    const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Missing Supabase server configuration' }, 500);
    }

    const payload = await req.json().catch(() => ({}));
    const externalId = typeof payload?.external_id === 'string' ? payload.external_id : '';
    const invoiceId = typeof payload?.id === 'string' ? payload.id : '';
    const rawStatus = String(payload?.status || '').toUpperCase();

    if (!externalId && !invoiceId) {
      return jsonResponse({ error: 'Missing external_id or invoice id' }, 400);
    }

    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    };

    const queryFilter = externalId
      ? `external_id=eq.${encodeURIComponent(externalId)}`
      : `xendit_invoice_id=eq.${encodeURIComponent(invoiceId)}`;

    const sessionRes = await fetch(`${supabaseUrl}/rest/v1/subscription_checkout_sessions?${queryFilter}&limit=1`, {
      headers,
    });
    const sessions = (await sessionRes.json().catch(() => [])) as Array<{
      id: string;
      business_id: string;
      target_plan_code: string;
      billing_cycle: 'monthly' | 'annual';
      amount_php: number;
      external_id: string;
      status: string;
    }>;
    const checkoutSession = sessions[0];
    if (!checkoutSession) {
      return jsonResponse({ ok: true, ignored: true, reason: 'Checkout session not found' });
    }

    let mappedStatus: 'pending' | 'paid' | 'expired' | 'failed' = 'pending';
    if (rawStatus === 'PAID' || rawStatus === 'SETTLED') mappedStatus = 'paid';
    else if (rawStatus === 'EXPIRED') mappedStatus = 'expired';
    else if (rawStatus === 'FAILED') mappedStatus = 'failed';

    const alreadyPaid = checkoutSession.status === 'paid';
    const nowIso = new Date().toISOString();

    await fetch(`${supabaseUrl}/rest/v1/subscription_checkout_sessions?id=eq.${encodeURIComponent(checkoutSession.id)}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: alreadyPaid && mappedStatus === 'paid' ? 'paid' : mappedStatus,
        xendit_invoice_id: invoiceId || undefined,
        paid_at: mappedStatus === 'paid' ? payload?.paid_at || nowIso : null,
        raw_payload: payload,
        updated_at: nowIso,
      }),
    });

    if (mappedStatus === 'paid' && !alreadyPaid) {
      const currentSubRes = await fetch(
        `${supabaseUrl}/rest/v1/business_subscriptions?business_id=eq.${encodeURIComponent(
          checkoutSession.business_id
        )}&select=current_period_end&limit=1`,
        { headers }
      );
      const currentSubs = (await currentSubRes.json().catch(() => [])) as Array<{ current_period_end?: string | null }>;
      const { start, end } = addBillingInterval(currentSubs[0]?.current_period_end, checkoutSession.billing_cycle);

      await fetch(`${supabaseUrl}/rest/v1/business_subscriptions?on_conflict=business_id`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          business_id: checkoutSession.business_id,
          plan_code: checkoutSession.target_plan_code,
          status: 'active',
          billing_provider: 'xendit',
          billing_cycle: checkoutSession.billing_cycle,
          amount_php: Number(payload?.amount || checkoutSession.amount_php),
          currency: String(payload?.currency || 'PHP'),
          current_period_start: start,
          current_period_end: end,
          xendit_latest_invoice_id: invoiceId || null,
          xendit_latest_invoice_url: typeof payload?.invoice_url === 'string' ? payload.invoice_url : null,
          xendit_payment_status: rawStatus,
          notes: `Paid via Xendit invoice ${checkoutSession.external_id}`,
          updated_at: nowIso,
        }),
      });

      await fetch(`${supabaseUrl}/rest/v1/admin_audit_logs`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({
          target_user_id: checkoutSession.business_id,
          target_business_id: checkoutSession.business_id,
          target_email: typeof payload?.payer_email === 'string' ? payload.payer_email : '',
          action: 'billing.xendit_invoice_paid',
          category: 'billing',
          severity: 'info',
          summary: `Xendit payment settled (${checkoutSession.target_plan_code}, ${checkoutSession.billing_cycle})`,
          metadata: {
            external_id: checkoutSession.external_id,
            xendit_invoice_id: invoiceId,
            amount: payload?.amount || checkoutSession.amount_php,
            payment_method: payload?.payment_method || null,
          },
        }),
      });
    }

    return jsonResponse({ ok: true, status: mappedStatus, idempotent: alreadyPaid });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unexpected server error' }, 500);
  }
});
