-- ==============================================================================
-- Sync existing client subscription start/next-billing dates (Nov 7 -> Nov 10)
-- and add optional p_period_start support to admin_update_client_subscription
-- ==============================================================================

-- 1. Align existing business_subscriptions start date with actual business_profiles.created_at
--    and set next billing date (2026-11-10 for early Nov clients where current_period_end was null).
update public.business_subscriptions bs
set
    current_period_start = coalesce(bp.created_at, bs.current_period_start),
    current_period_end = case
        when bs.current_period_end is not null then bs.current_period_end
        when coalesce(bp.created_at, bs.created_at)::date <= date '2026-11-09'
            then timestamp with time zone '2026-11-10 23:59:59+08'
        else coalesce(bp.created_at, bs.current_period_start) + interval '1 month'
    end,
    updated_at = timezone('utc'::text, now())
from public.business_profiles bp
where bp.id = bs.business_id
  and bs.billing_provider in ('manual', 'system');

-- 2. Auto-set 1-month next billing date on newly onboarded business_subscriptions
create or replace function public.init_business_subscription_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_plan text := coalesce(nullif(trim(new.subscription_tier), ''), 'starter');
    v_price numeric(12,2) := 249;
    v_email text := '';
    v_start timestamp with time zone := coalesce(new.created_at, timezone('utc'::text, now()));
begin
    if not exists (select 1 from public.subscription_plans where code = v_plan) then
        v_plan := 'starter';
    end if;

    select coalesce(monthly_price_php, 249) into v_price
    from public.subscription_plans
    where code = v_plan;

    insert into public.business_subscriptions (
        business_id, plan_code, status, billing_provider, billing_cycle, amount_php, currency,
        current_period_start, current_period_end, notes
    ) values (
        new.id, v_plan, 'active', 'system', 'monthly', v_price, 'PHP',
        v_start, v_start + interval '1 month', 'Auto-created on business onboarding'
    )
    on conflict (business_id) do nothing;

    select coalesce(u.email, new.email, '') into v_email from auth.users u where u.id = new.id;

    insert into public.admin_audit_logs (
        actor_user_id, actor_email, actor_role, category, action, severity,
        target_user_id, target_business_id, target_email, summary, metadata
    ) values (
        new.id, v_email, 'owner',
        'business', 'business.created', 'info',
        new.id, new.id, v_email,
        format('New Bookora business registered: %s (%s)', new.business_name, coalesce(new.slug, 'no-slug')),
        jsonb_build_object('business_name', new.business_name, 'slug', new.slug, 'industry', new.industry, 'plan_code', v_plan)
    );

    return new;
end;
$$;


-- 3. Allow 'lemonsqueezy' in business_subscriptions.billing_provider check constraint
do $$
declare
    v_constraint text;
begin
    select conname into v_constraint
    from pg_constraint
    where conrelid = 'public.business_subscriptions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%billing_provider%';

    if v_constraint is not null then
        execute format('alter table public.business_subscriptions drop constraint %I', v_constraint);
    end if;

    alter table public.business_subscriptions
        add constraint business_subscriptions_billing_provider_check
        check (billing_provider in ('manual', 'xendit', 'lemonsqueezy', 'promo', 'system'));
end $$;
