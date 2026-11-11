import { supabase } from '@/lib/supabase';

export type OwnerSubscriptionInfo = {
  business_id: string;
  plan_code: string;
  plan_name: string;
  plan_description: string;
  monthly_price_php: number;
  annual_price_php: number;
  status: string;
  billing_provider: string;
  billing_cycle: string;
  amount_php: number;
  currency: string;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  xendit_latest_invoice_url: string | null;
  xendit_payment_status: string | null;
  features: string[];
};

export type PublicSubscriptionPlan = {
  code: string;
  name: string;
  description: string;
  monthly_price_php: number;
  annual_price_php: number;
  currency: string;
  max_staff: number | null;
  max_locations: number | null;
  features: string[];
  sort_order: number;
};

export type SubscriptionCheckoutSession = {
  id: string;
  business_id: string;
  target_plan_code: string;
  billing_cycle: 'monthly' | 'annual';
  provider: string;
  external_id: string;
  xendit_invoice_id: string | null;
  xendit_invoice_url: string | null;
  amount_php: number;
  currency: string;
  status: 'pending' | 'paid' | 'expired' | 'failed';
  paid_at: string | null;
  created_at: string;
};

export type SubscriptionBillingAlert = {
  level: 'urgent' | 'warning' | 'info';
  title: string;
  message: string;
  ctaLabel: string;
  dueDateIso: string | null;
  pendingInvoiceUrl: string | null;
};

const formatPhp = (amount: number) =>
  `₱${Number(amount || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

export function computeNextDueDate(sub: OwnerSubscriptionInfo | null): Date | null {
  if (!sub) return null;
  if (sub.current_period_end) {
    const parsed = new Date(sub.current_period_end);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (sub.current_period_start && Number(sub.amount_php) > 0) {
    const start = new Date(sub.current_period_start);
    if (!Number.isNaN(start.getTime())) {
      const next = new Date(start);
      if (sub.billing_cycle === 'annual') next.setFullYear(next.getFullYear() + 1);
      else next.setMonth(next.getMonth() + 1);
      return next;
    }
  }
  return null;
}

export function calculateCustomerCheckoutPricing(baseAmountPhp: number): {
  basePhp: number;
  feePhp: number;
  totalPhp: number;
} {
  const basePhp = Math.max(0, Math.round(Number(baseAmountPhp || 0)));
  if (basePhp <= 0) return { basePhp: 0, feePhp: 0, totalPhp: 0 };
  // Covers ~7% card/intl/subscription + 1% PH bank payout + ~PHP 30 ($0.50 fixed)
  const totalPhp = Math.ceil((basePhp + 30) / 0.92);
  return {
    basePhp,
    feePhp: Math.max(0, totalPhp - basePhp),
    totalPhp,
  };
}

export function getSubscriptionBillingAlert(
  sub: OwnerSubscriptionInfo | null,
  sessions: SubscriptionCheckoutSession[] = []
): SubscriptionBillingAlert | null {
  if (!sub) return null;

  const pendingSession = sessions.find((s) => s.status === 'pending' && s.xendit_invoice_url);
  if (pendingSession) {
    return {
      level: 'warning',
      title: 'Pending subscription payment',
      message: `Complete your ${formatPhp(pendingSession.amount_php)} ${pendingSession.target_plan_code.toUpperCase()} checkout to activate your upgrade.`,
      ctaLabel: 'Complete payment',
      dueDateIso: null,
      pendingInvoiceUrl: pendingSession.xendit_invoice_url,
    };
  }

  if (sub.status === 'past_due' || sub.status === 'expired') {
    return {
      level: 'urgent',
      title: 'Monthly payment overdue',
      message: `Your ${sub.plan_name} plan (${formatPhp(sub.amount_php)}/mo) needs settlement to keep all features active.`,
      ctaLabel: 'Settle payment',
      dueDateIso: sub.current_period_end,
      pendingInvoiceUrl: sub.xendit_latest_invoice_url,
    };
  }

  const nextDue = computeNextDueDate(sub);
  if (nextDue && Number(sub.amount_php) > 0 && sub.plan_code !== 'free') {
    const diffMs = nextDue.getTime() - Date.now();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) {
      return {
        level: 'urgent',
        title: 'Monthly payment due today',
        message: `Settle ${formatPhp(sub.amount_php)} for your ${sub.plan_name} monthly subscription to continue uninterrupted.`,
        ctaLabel: 'Settle payment',
        dueDateIso: nextDue.toISOString(),
        pendingInvoiceUrl: null,
      };
    }
    if (diffDays <= 5) {
      return {
        level: 'warning',
        title: `Renewal due in ${diffDays} day${diffDays === 1 ? '' : 's'}`,
        message: `Your ${sub.plan_name} monthly plan (${formatPhp(sub.amount_php)}) renews on ${nextDue.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}.`,
        ctaLabel: 'Settle early',
        dueDateIso: nextDue.toISOString(),
        pendingInvoiceUrl: null,
      };
    }
  }

  if (sub.status === 'trialing' && sub.trial_ends_at) {
    const trialEnd = new Date(sub.trial_ends_at);
    const diffDays = Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 5) {
      return {
        level: 'info',
        title: diffDays <= 0 ? 'Trial ended' : `Trial ends in ${diffDays} day${diffDays === 1 ? '' : 's'}`,
        message: `Settle your ${sub.plan_name} monthly subscription (${formatPhp(sub.amount_php)}/mo) to continue uninterrupted.`,
        ctaLabel: 'Settle payment',
        dueDateIso: sub.trial_ends_at,
        pendingInvoiceUrl: null,
      };
    }
  }

  return null;
}

export async function fetchMySubscription(): Promise<OwnerSubscriptionInfo | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_my_subscription');
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    business_id: String(row.business_id),
    plan_code: String(row.plan_code ?? 'starter'),
    plan_name: String(row.plan_name ?? 'Starter'),
    plan_description: String(row.plan_description ?? ''),
    monthly_price_php: Number(row.monthly_price_php ?? 249),
    annual_price_php: Number(row.annual_price_php ?? 2490),
    status: String(row.status ?? 'active'),
    billing_provider: String(row.billing_provider ?? 'manual'),
    billing_cycle: String(row.billing_cycle ?? 'monthly'),
    amount_php: Number(row.amount_php ?? 249),
    currency: String(row.currency ?? 'PHP'),
    current_period_start: row.current_period_start ? String(row.current_period_start) : null,
    current_period_end: row.current_period_end ? String(row.current_period_end) : null,
    trial_ends_at: row.trial_ends_at ? String(row.trial_ends_at) : null,
    cancel_at_period_end: Boolean(row.cancel_at_period_end),
    xendit_latest_invoice_url: row.xendit_latest_invoice_url ? String(row.xendit_latest_invoice_url) : null,
    xendit_payment_status: row.xendit_payment_status ? String(row.xendit_payment_status) : null,
    features: Array.isArray(row.features) ? row.features.map(String) : [],
  };
}

export async function fetchPublicSubscriptionPlans(): Promise<PublicSubscriptionPlan[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .eq('is_public', true)
    .order('sort_order', { ascending: true });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((row) => ({
    code: String(row.code),
    name: String(row.name),
    description: String(row.description ?? ''),
    monthly_price_php: Number(row.monthly_price_php ?? 0),
    annual_price_php: Number(row.annual_price_php ?? 0),
    currency: String(row.currency ?? 'PHP'),
    max_staff: row.max_staff === null || row.max_staff === undefined ? null : Number(row.max_staff),
    max_locations: row.max_locations === null || row.max_locations === undefined ? null : Number(row.max_locations),
    features: Array.isArray(row.features) ? row.features.map(String) : [],
    sort_order: Number(row.sort_order ?? 0),
  }));
}

export async function fetchMyCheckoutSessions(businessId: string): Promise<SubscriptionCheckoutSession[]> {
  if (!supabase || !businessId) return [];
  const { data, error } = await supabase
    .from('subscription_checkout_sessions')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(15);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    business_id: String(row.business_id),
    target_plan_code: String(row.target_plan_code),
    billing_cycle: row.billing_cycle === 'annual' ? 'annual' : 'monthly',
    provider: String(row.provider ?? 'xendit'),
    external_id: String(row.external_id),
    xendit_invoice_id: row.xendit_invoice_id ? String(row.xendit_invoice_id) : null,
    xendit_invoice_url: row.xendit_invoice_url ? String(row.xendit_invoice_url) : null,
    amount_php: Number(row.amount_php ?? 0),
    currency: String(row.currency ?? 'PHP'),
    status: (['pending', 'paid', 'expired', 'failed'].includes(String(row.status))
      ? String(row.status)
      : 'pending') as SubscriptionCheckoutSession['status'],
    paid_at: row.paid_at ? String(row.paid_at) : null,
    created_at: String(row.created_at),
  }));
}

async function parseFunctionError(error: unknown): Promise<{ message: string; configured: boolean }> {
  const errObj = error as { message?: string; context?: { json?: () => Promise<Record<string, unknown>>; status?: number } } | null;
  let parsedMessage = '';
  let configuredFromBody: boolean | undefined;

  try {
    const ctx = errObj?.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json();
      if (typeof body?.error === 'string' && body.error.trim()) {
        parsedMessage = body.error.trim();
      }
      if (typeof body?.configured === 'boolean') {
        configuredFromBody = body.configured;
      } else if (typeof body?.xendit_configured === 'boolean') {
        configuredFromBody = body.xendit_configured;
      }
    }
  } catch {
    // Ignore non-JSON error context
  }

  const msg = parsedMessage || errObj?.message || 'Lemon Squeezy checkout is not configured yet.';
  const lower = msg.toLowerCase();
  const status = errObj?.context?.status;
  const notConfigured =
    configuredFromBody === false ||
    status === 503 ||
    lower.includes('503') ||
    lower.includes('not configured') ||
    lower.includes('not enabled') ||
    lower.includes('lemonsqueezy_api_key') ||
    lower.includes('edge function returned');

  return {
    message: msg,
    configured: configuredFromBody !== undefined ? configuredFromBody : !notConfigured,
  };
}

export async function createSubscriptionCheckout(params: {
  planCode: string;
  billingCycle: 'monthly' | 'annual';
  redirectUrl: string;
}): Promise<{
  ok: boolean;
  configured: boolean;
  checkoutUrl: string | null;
  externalId: string | null;
  error: string | null;
}> {
  if (!supabase) {
    return { ok: false, configured: false, checkoutUrl: null, externalId: null, error: 'Supabase is not configured.' };
  }
  const { data, error } = await supabase.functions.invoke('lemonsqueezy-create-checkout', {
    body: {
      action: 'create',
      plan_code: params.planCode,
      billing_cycle: params.billingCycle,
      success_redirect_url: params.redirectUrl,
    },
  });
  if (error) {
    const parsed = await parseFunctionError(error);
    return {
      ok: false,
      configured: parsed.configured,
      checkoutUrl: null,
      externalId: null,
      error: parsed.message,
    };
  }
  if (data?.configured === false) {
    return {
      ok: false,
      configured: false,
      checkoutUrl: null,
      externalId: null,
      error: String(data?.error || 'Lemon Squeezy checkout is not yet enabled.'),
    };
  }
  const url = data?.checkout_url || data?.invoice_url;
  return {
    ok: Boolean(url),
    configured: true,
    checkoutUrl: url ? String(url) : null,
    externalId: data?.external_id ? String(data.external_id) : null,
    error: url ? null : 'No checkout URL returned.',
  };
}

export async function verifySubscriptionCheckout(params?: {
  externalId?: string;
}): Promise<{
  ok: boolean;
  verified: boolean;
  status: 'none' | 'pending' | 'paid' | 'expired' | 'failed';
  configured: boolean;
  checkoutUrl: string | null;
  externalId: string | null;
  message: string | null;
  error: string | null;
}> {
  if (!supabase) {
    return {
      ok: false,
      verified: false,
      status: 'none',
      configured: false,
      checkoutUrl: null,
      externalId: null,
      message: null,
      error: 'Supabase is not configured.',
    };
  }
  const { data, error } = await supabase.functions.invoke('lemonsqueezy-create-checkout', {
    body: {
      action: 'verify',
      external_id: params?.externalId || undefined,
    },
  });
  if (error) {
    const parsed = await parseFunctionError(error);
    return {
      ok: false,
      verified: false,
      status: 'pending',
      configured: parsed.configured,
      checkoutUrl: null,
      externalId: null,
      message: null,
      error: parsed.message,
    };
  }
  const payload = (data || {}) as {
    ok?: boolean;
    verified?: boolean;
    status?: 'none' | 'pending' | 'paid' | 'expired' | 'failed';
    configured?: boolean;
    checkout_url?: string;
    invoice_url?: string;
    external_id?: string;
    message?: string;
  };
  return {
    ok: payload.ok !== false,
    verified: Boolean(payload.verified),
    status: payload.status || 'pending',
    configured: payload.configured !== false,
    checkoutUrl: payload.checkout_url || payload.invoice_url || null,
    externalId: payload.external_id || null,
    message: payload.message || null,
    error: null,
  };
}
