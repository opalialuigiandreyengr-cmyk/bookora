-- ==============================================================================
-- Bookora Platform Admin, Subscriptions (Free/Starter/Pro + Xendit-ready),
-- and Immutable Security Audit Logs
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Platform Admins (easy to manage directly in Supabase Table Editor or SQL)
-- ------------------------------------------------------------------------------
create table if not exists public.platform_admins (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade unique,
    email text not null,
    role text not null default 'super_admin' check (role in ('super_admin', 'admin', 'support', 'viewer')),
    is_active boolean not null default true,
    notes text not null default '',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create unique index if not exists idx_platform_admins_email_lower
    on public.platform_admins (lower(email));

alter table public.platform_admins enable row level security;
revoke all on table public.platform_admins from anon;
grant select on table public.platform_admins to authenticated;

-- Helper: check if the current authenticated user is an active verified platform admin
create or replace function public.is_platform_admin(
    p_required_roles text[] default array['super_admin', 'admin', 'support', 'viewer']
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
    v_uid uuid := auth.uid();
    v_email text;
    v_confirmed timestamp with time zone;
    v_banned timestamp with time zone;
begin
    if v_uid is null then
        return false;
    end if;

    select u.email, u.email_confirmed_at, u.banned_until
    into v_email, v_confirmed, v_banned
    from auth.users u
    where u.id = v_uid;

    if v_email is null or v_confirmed is null then
        return false;
    end if;

    if v_banned is not null and v_banned > timezone('utc'::text, now()) then
        return false;
    end if;

    return exists (
        select 1
        from public.platform_admins pa
        where pa.is_active = true
          and pa.role = any(p_required_roles)
          and (
              pa.user_id = v_uid
              or (pa.user_id is null and lower(pa.email) = lower(v_email))
          )
    );
end;
$$;

revoke all on function public.is_platform_admin(text[]) from public;
grant execute on function public.is_platform_admin(text[]) to authenticated;

drop policy if exists "Platform admins can view own or all admin rows" on public.platform_admins;
create policy "Platform admins can view own or all admin rows"
    on public.platform_admins
    for select
    to authenticated
    using (
        user_id = auth.uid()
        or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or public.is_platform_admin()
    );

-- Normalize email and auto-link user_id when an admin row is inserted/updated in Supabase
create or replace function public.normalize_platform_admin_row()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_matched_uid uuid;
begin
    new.email := lower(trim(coalesce(new.email, '')));
    if new.email = '' then
        raise exception 'Admin email cannot be empty.' using errcode = '22023';
    end if;

    if new.user_id is null then
        select u.id
        into v_matched_uid
        from auth.users u
        where lower(u.email) = new.email
          and u.email_confirmed_at is not null
        limit 1;

        if v_matched_uid is not null then
            new.user_id := v_matched_uid;
        end if;
    end if;

    new.updated_at := timezone('utc'::text, now());
    return new;
end;
$$;

drop trigger if exists trg_normalize_platform_admin on public.platform_admins;
create trigger trg_normalize_platform_admin
    before insert or update on public.platform_admins
    for each row execute function public.normalize_platform_admin_row();

-- Resolve current user's platform admin context (and claim user_id if matched by verified email)
create or replace function public.admin_get_context()
returns table (
    is_admin boolean,
    admin_id uuid,
    role text,
    email text,
    user_id uuid
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_uid uuid := auth.uid();
    v_email text;
    v_confirmed timestamp with time zone;
    v_banned timestamp with time zone;
    v_admin public.platform_admins%rowtype;
begin
    if v_uid is null then
        return query select false, null::uuid, null::text, null::text, null::uuid;
        return;
    end if;

    select u.email, u.email_confirmed_at, u.banned_until
    into v_email, v_confirmed, v_banned
    from auth.users u
    where u.id = v_uid;

    if v_email is null or v_confirmed is null or (v_banned is not null and v_banned > timezone('utc'::text, now())) then
        return query select false, null::uuid, null::text, null::text, v_uid;
        return;
    end if;

    select pa.*
    into v_admin
    from public.platform_admins pa
    where pa.is_active = true
      and (
          pa.user_id = v_uid
          or (pa.user_id is null and lower(pa.email) = lower(v_email))
      )
    order by pa.created_at asc
    limit 1;

    if v_admin.id is null then
        return query select false, null::uuid, null::text, null::text, v_uid;
        return;
    end if;

    if v_admin.user_id is null then
        update public.platform_admins
        set user_id = v_uid,
            updated_at = timezone('utc'::text, now())
        where id = v_admin.id;
    end if;

    return query select true, v_admin.id, v_admin.role, v_admin.email, v_uid;
end;
$$;

revoke all on function public.admin_get_context() from public;
grant execute on function public.admin_get_context() to authenticated;

-- ------------------------------------------------------------------------------
-- 2. Immutable Security & Platform Audit Logs
-- ------------------------------------------------------------------------------
create table if not exists public.admin_audit_logs (
    id uuid default gen_random_uuid() primary key,
    actor_user_id uuid references auth.users(id) on delete set null,
    actor_email text not null default '',
    actor_role text not null default 'system',
    category text not null default 'security' check (category in ('auth', 'admin', 'subscription', 'business', 'billing', 'security')),
    action text not null,
    severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
    target_user_id uuid,
    target_business_id uuid,
    target_email text not null default '',
    summary text not null default '',
    before_state jsonb,
    after_state jsonb,
    metadata jsonb not null default '{}'::jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_admin_audit_logs_created_at
    on public.admin_audit_logs (created_at desc);
create index if not exists idx_admin_audit_logs_target_user
    on public.admin_audit_logs (target_user_id, created_at desc);
create index if not exists idx_admin_audit_logs_category_severity
    on public.admin_audit_logs (category, severity, created_at desc);

alter table public.admin_audit_logs enable row level security;
revoke all on table public.admin_audit_logs from anon;
revoke insert, update, delete on table public.admin_audit_logs from authenticated;
grant select on table public.admin_audit_logs to authenticated;

drop policy if exists "Platform admins can view audit logs" on public.admin_audit_logs;
create policy "Platform admins can view audit logs"
    on public.admin_audit_logs
    for select
    to authenticated
    using (public.is_platform_admin());

-- Trigger: audit changes to platform_admins (always critical)
create or replace function public.audit_platform_admin_changes()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_actor_uid uuid := auth.uid();
    v_actor_email text := '';
begin
    if v_actor_uid is not null then
        select coalesce(u.email, '') into v_actor_email from auth.users u where u.id = v_actor_uid;
    end if;

    if tg_op = 'INSERT' then
        insert into public.admin_audit_logs (
            actor_user_id, actor_email, actor_role, category, action, severity,
            target_user_id, target_email, summary, after_state
        ) values (
            v_actor_uid, coalesce(nullif(v_actor_email, ''), 'supabase_sql'), 'super_admin',
            'security', 'admin.role_granted', 'critical',
            new.user_id, new.email,
            format('Platform admin access granted to %s (%s)', new.email, new.role),
            to_jsonb(new)
        );
        return new;
    elsif tg_op = 'UPDATE' then
        if old.role is distinct from new.role or old.is_active is distinct from new.is_active then
            insert into public.admin_audit_logs (
                actor_user_id, actor_email, actor_role, category, action, severity,
                target_user_id, target_email, summary, before_state, after_state
            ) values (
                v_actor_uid, coalesce(nullif(v_actor_email, ''), 'supabase_sql'), 'super_admin',
                'security', 'admin.role_updated', 'critical',
                new.user_id, new.email,
                format('Platform admin %s updated (role: %s, active: %s)', new.email, new.role, new.is_active),
                to_jsonb(old), to_jsonb(new)
            );
        end if;
        return new;
    elsif tg_op = 'DELETE' then
        insert into public.admin_audit_logs (
            actor_user_id, actor_email, actor_role, category, action, severity,
            target_user_id, target_email, summary, before_state
        ) values (
            v_actor_uid, coalesce(nullif(v_actor_email, ''), 'supabase_sql'), 'super_admin',
            'security', 'admin.role_revoked', 'critical',
            old.user_id, old.email,
            format('Platform admin access removed for %s', old.email),
            to_jsonb(old)
        );
        return old;
    end if;
    return null;
end;
$$;

drop trigger if exists trg_audit_platform_admin_changes on public.platform_admins;
create trigger trg_audit_platform_admin_changes
    after insert or update or delete on public.platform_admins
    for each row execute function public.audit_platform_admin_changes();

-- Enhance existing auth.users password change trigger so it also logs to admin_audit_logs
create or replace function public.handle_user_password_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
    if old.encrypted_password is distinct from new.encrypted_password then
        insert into public.user_security_logs (user_id, action, details, created_at)
        values (new.id, 'password_updated', 'Password changed via Settings modal', timezone('utc'::text, now()));

        insert into public.admin_audit_logs (
            actor_user_id, actor_email, actor_role, category, action, severity,
            target_user_id, target_email, summary, metadata
        ) values (
            new.id, coalesce(new.email, ''), 'owner',
            'auth', 'user.password_updated', 'info',
            new.id, coalesce(new.email, ''),
            format('Account password updated for %s', coalesce(new.email, new.id::text)),
            jsonb_build_object('source', 'auth.users')
        );

        if exists (select from pg_tables where schemaname = 'public' and tablename = 'profiles') then
            update public.profiles
            set password_updated_at = timezone('utc'::text, now())
            where id = new.id;
        end if;
    end if;
    return new;
end;
$$;

-- ------------------------------------------------------------------------------
-- 3. Subscription Plans, Business Subscriptions & Xendit Paywall Foundation
-- ------------------------------------------------------------------------------
create table if not exists public.subscription_plans (
    code text primary key,
    name text not null,
    description text not null default '',
    monthly_price_php numeric(12,2) not null default 0 check (monthly_price_php >= 0),
    annual_price_php numeric(12,2) not null default 0 check (annual_price_php >= 0),
    currency text not null default 'PHP',
    max_staff integer,
    max_locations integer default 1,
    features jsonb not null default '[]'::jsonb,
    xendit_plan_id text,
    is_active boolean not null default true,
    is_public boolean not null default true,
    sort_order integer not null default 0,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.subscription_plans enable row level security;
grant select on table public.subscription_plans to anon, authenticated;
revoke insert, update, delete on table public.subscription_plans from anon, authenticated;

drop policy if exists "Anyone can view active subscription plans" on public.subscription_plans;
create policy "Anyone can view active subscription plans"
    on public.subscription_plans
    for select
    using (is_active = true or public.is_platform_admin());

insert into public.subscription_plans (
    code, name, description, monthly_price_php, annual_price_php, max_staff, max_locations, features, is_active, is_public, sort_order
) values
    (
        'free',
        'Free',
        'Perfect for getting started.',
        0,
        0,
        1,
        1,
        '["1 business location", "Basic booking calendar", "Up to 1 staff", "Service management", "Email notifications", "Basic reports"]'::jsonb,
        true,
        true,
        1
    ),
    (
        'starter',
        'Starter',
        'Ideal for small salons.',
        249,
        2490,
        3,
        1,
        '["1 business location", "Up to 3 staff", "Online booking page", "Service and pricing setup", "Automated reminders", "Basic reports", "Customer management"]'::jsonb,
        true,
        true,
        2
    ),
    (
        'pro',
        'Pro',
        'For growing salons.',
        499,
        4990,
        null,
        3,
        '["Multiple locations (up to 3)", "Unlimited staff", "Online booking page", "Service and package setup", "Automated reminders", "Payments (GCash, Maya, cards)", "Reports and analytics", "Promotions and discounts", "Custom branding"]'::jsonb,
        true,
        true,
        3
    ),
    (
        'enterprise',
        'Enterprise',
        'Custom multi-branch & priority support.',
        1499,
        14990,
        null,
        null,
        '["Unlimited locations", "Unlimited staff", "Dedicated onboarding", "Custom integrations & webhooks", "Priority support"]'::jsonb,
        true,
        false,
        4
    )
on conflict (code) do nothing;

-- Add explicit subscription columns on business_profiles (defaulting to starter for existing clients as requested)
alter table public.business_profiles
    add column if not exists subscription_tier text not null default 'starter';
alter table public.business_profiles
    add column if not exists subscription_status text not null default 'active';

-- Ensure all existing business_profiles rows have 'starter' / 'active' set cleanly
update public.business_profiles
set
    subscription_tier = coalesce(nullif(trim(subscription_tier), ''), 'starter'),
    subscription_status = coalesce(nullif(trim(subscription_status), ''), 'active')
where subscription_tier is null
   or trim(subscription_tier) = ''
   or subscription_status is null
   or trim(subscription_status) = '';

create table if not exists public.business_subscriptions (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null unique,
    plan_code text not null default 'starter' references public.subscription_plans(code),
    status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'cancelled', 'expired')),
    billing_provider text not null default 'manual' check (billing_provider in ('manual', 'xendit', 'promo', 'system')),
    billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'annual', 'lifetime', 'custom')),
    amount_php numeric(12,2) not null default 249,
    currency text not null default 'PHP',
    current_period_start timestamp with time zone default timezone('utc'::text, now()) not null,
    current_period_end timestamp with time zone,
    trial_ends_at timestamp with time zone,
    cancel_at_period_end boolean not null default false,
    xendit_customer_id text,
    xendit_subscription_id text,
    xendit_latest_invoice_id text,
    xendit_latest_invoice_url text,
    xendit_payment_status text,
    notes text not null default '',
    updated_by uuid references auth.users(id) on delete set null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_business_subscriptions_plan_status
    on public.business_subscriptions (plan_code, status);

alter table public.business_subscriptions enable row level security;
revoke all on table public.business_subscriptions from anon;
revoke insert, update, delete on table public.business_subscriptions from authenticated;
grant select on table public.business_subscriptions to authenticated;

drop policy if exists "Owners can view own subscription" on public.business_subscriptions;
create policy "Owners can view own subscription"
    on public.business_subscriptions
    for select
    to authenticated
    using (auth.uid() = business_id or public.is_platform_admin());

-- Backfill all existing business_profiles into business_subscriptions as 'starter'
insert into public.business_subscriptions (
    business_id, plan_code, status, billing_provider, billing_cycle, amount_php, currency, notes
)
select
    bp.id,
    case
        when exists (select 1 from public.subscription_plans sp where sp.code = bp.subscription_tier) then bp.subscription_tier
        else 'starter'
    end,
    case
        when bp.subscription_status in ('active', 'trialing', 'past_due', 'cancelled', 'expired') then bp.subscription_status
        else 'active'
    end,
    'manual',
    'monthly',
    coalesce((select sp.monthly_price_php from public.subscription_plans sp where sp.code = coalesce(nullif(bp.subscription_tier, ''), 'starter')), 249),
    'PHP',
    'Initial migration backfill — existing client set to Starter'
from public.business_profiles bp
on conflict (business_id) do nothing;

-- Sync business_subscriptions -> business_profiles columns and write fallback audit log if changed outside RPC
create or replace function public.sync_business_subscription_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_actor_uid uuid := coalesce(new.updated_by, auth.uid());
    v_actor_email text := '';
    v_owner_email text := '';
begin
    perform set_config('bookora.syncing_subscription', 'true', true);

    update public.business_profiles
    set
        subscription_tier = new.plan_code,
        subscription_status = new.status,
        updated_at = timezone('utc'::text, now())
    where id = new.business_id
      and (
          subscription_tier is distinct from new.plan_code
          or subscription_status is distinct from new.status
      );

    perform set_config('bookora.syncing_subscription', 'false', true);

    if coalesce(current_setting('bookora.audit_logged', true), '') <> 'true' then
        select coalesce(u.email, '') into v_owner_email from auth.users u where u.id = new.business_id;
        if v_actor_uid is not null then
            select coalesce(u.email, '') into v_actor_email from auth.users u where u.id = v_actor_uid;
        end if;

        if tg_op = 'INSERT' then
            insert into public.admin_audit_logs (
                actor_user_id, actor_email, actor_role, category, action, severity,
                target_user_id, target_business_id, target_email, summary, after_state
            ) values (
                v_actor_uid, coalesce(nullif(v_actor_email, ''), 'system'), 'system',
                'subscription', 'subscription.initialized', 'info',
                new.business_id, new.business_id, v_owner_email,
                format('Subscription initialized on %s (%s)', new.plan_code, new.status),
                jsonb_build_object('plan_code', new.plan_code, 'status', new.status, 'billing_provider', new.billing_provider)
            );
        elsif tg_op = 'UPDATE' and (old.plan_code is distinct from new.plan_code or old.status is distinct from new.status) then
            insert into public.admin_audit_logs (
                actor_user_id, actor_email, actor_role, category, action, severity,
                target_user_id, target_business_id, target_email, summary, before_state, after_state
            ) values (
                v_actor_uid, coalesce(nullif(v_actor_email, ''), new.billing_provider),
                case when new.billing_provider = 'xendit' then 'xendit_webhook' else 'system' end,
                'subscription', 'subscription.updated', 'info',
                new.business_id, new.business_id, v_owner_email,
                format('Subscription changed from %s (%s) to %s (%s)', old.plan_code, old.status, new.plan_code, new.status),
                jsonb_build_object('plan_code', old.plan_code, 'status', old.status, 'billing_provider', old.billing_provider),
                jsonb_build_object('plan_code', new.plan_code, 'status', new.status, 'billing_provider', new.billing_provider)
            );
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_sync_business_subscription on public.business_subscriptions;
create trigger trg_sync_business_subscription
    after insert or update on public.business_subscriptions
    for each row execute function public.sync_business_subscription_to_profile();

-- Prevent regular business owners from modifying their own subscription_tier/subscription_status directly
create or replace function public.guard_business_profile_subscription_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if coalesce(current_setting('bookora.syncing_subscription', true), '') = 'true'
       or current_user in ('postgres', 'service_role', 'supabase_admin')
       or public.is_platform_admin(array['super_admin', 'admin']) then
        return new;
    end if;

    new.subscription_tier := old.subscription_tier;
    new.subscription_status := old.subscription_status;
    return new;
end;
$$;

drop trigger if exists trg_guard_business_profile_subscription on public.business_profiles;
create trigger trg_guard_business_profile_subscription
    before update on public.business_profiles
    for each row execute function public.guard_business_profile_subscription_columns();

-- Auto-create a Starter subscription whenever a new business_profiles row is created
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
begin
    if not exists (select 1 from public.subscription_plans where code = v_plan) then
        v_plan := 'starter';
    end if;

    select coalesce(monthly_price_php, 249) into v_price
    from public.subscription_plans
    where code = v_plan;

    insert into public.business_subscriptions (
        business_id, plan_code, status, billing_provider, billing_cycle, amount_php, currency, notes
    ) values (
        new.id, v_plan, 'active', 'system', 'monthly', v_price, 'PHP', 'Auto-created on business onboarding'
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

drop trigger if exists trg_init_business_subscription on public.business_profiles;
create trigger trg_init_business_subscription
    after insert on public.business_profiles
    for each row execute function public.init_business_subscription_on_profile();

-- Xendit checkout & webhook tracking table (ready for Xendit paywall integration)
create table if not exists public.subscription_checkout_sessions (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null,
    target_plan_code text not null references public.subscription_plans(code),
    billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'annual')),
    provider text not null default 'xendit',
    external_id text not null unique,
    xendit_invoice_id text,
    xendit_invoice_url text,
    amount_php numeric(12,2) not null default 0,
    currency text not null default 'PHP',
    status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'failed')),
    raw_payload jsonb not null default '{}'::jsonb,
    paid_at timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_subscription_checkout_business
    on public.subscription_checkout_sessions (business_id, created_at desc);

alter table public.subscription_checkout_sessions enable row level security;
revoke all on table public.subscription_checkout_sessions from anon;
revoke insert, update, delete on table public.subscription_checkout_sessions from authenticated;
grant select on table public.subscription_checkout_sessions to authenticated;

drop policy if exists "Owners can view own checkout sessions" on public.subscription_checkout_sessions;
create policy "Owners can view own checkout sessions"
    on public.subscription_checkout_sessions
    for select
    to authenticated
    using (auth.uid() = business_id or public.is_platform_admin());

-- Allow any authenticated business owner to fetch their subscription + plan details cleanly
create or replace function public.get_my_subscription()
returns table (
    business_id uuid,
    plan_code text,
    plan_name text,
    plan_description text,
    monthly_price_php numeric,
    annual_price_php numeric,
    status text,
    billing_provider text,
    billing_cycle text,
    amount_php numeric,
    currency text,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    trial_ends_at timestamp with time zone,
    cancel_at_period_end boolean,
    xendit_latest_invoice_url text,
    xendit_payment_status text,
    features jsonb
)
language sql
stable
security definer
set search_path = public
as $$
    select
        coalesce(bs.business_id, auth.uid()) as business_id,
        coalesce(bs.plan_code, bp.subscription_tier, 'starter') as plan_code,
        coalesce(sp.name, initcap(coalesce(bs.plan_code, bp.subscription_tier, 'starter'))) as plan_name,
        coalesce(sp.description, '') as plan_description,
        coalesce(sp.monthly_price_php, 249) as monthly_price_php,
        coalesce(sp.annual_price_php, 2490) as annual_price_php,
        coalesce(bs.status, bp.subscription_status, 'active') as status,
        coalesce(bs.billing_provider, 'manual') as billing_provider,
        coalesce(bs.billing_cycle, 'monthly') as billing_cycle,
        coalesce(bs.amount_php, sp.monthly_price_php, 249) as amount_php,
        coalesce(bs.currency, 'PHP') as currency,
        bs.current_period_start,
        bs.current_period_end,
        bs.trial_ends_at,
        coalesce(bs.cancel_at_period_end, false) as cancel_at_period_end,
        bs.xendit_latest_invoice_url,
        bs.xendit_payment_status,
        coalesce(sp.features, '[]'::jsonb) as features
    from public.business_profiles bp
    left join public.business_subscriptions bs on bs.business_id = bp.id
    left join public.subscription_plans sp on sp.code = coalesce(bs.plan_code, bp.subscription_tier, 'starter')
    where bp.id = auth.uid()
    limit 1;
$$;

revoke all on function public.get_my_subscription() from public;
grant execute on function public.get_my_subscription() to authenticated;

-- ------------------------------------------------------------------------------
-- 4. Admin RPCs (strictly guarded by public.is_platform_admin())
-- ------------------------------------------------------------------------------

-- Overview KPIs
create or replace function public.admin_get_overview_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
    v_result jsonb;
begin
    if not public.is_platform_admin() then
        raise exception 'Platform admin privileges required.' using errcode = '42501';
    end if;

    select jsonb_build_object(
        'total_businesses', (select count(*) from public.business_profiles),
        'total_auth_users', (select count(*) from auth.users),
        'free_count', (select count(*) from public.business_profiles where subscription_tier = 'free'),
        'starter_count', (select count(*) from public.business_profiles where subscription_tier = 'starter'),
        'pro_count', (select count(*) from public.business_profiles where subscription_tier = 'pro'),
        'other_plan_count', (select count(*) from public.business_profiles where subscription_tier not in ('free', 'starter', 'pro')),
        'active_subscriptions', (select count(*) from public.business_profiles where subscription_status in ('active', 'trialing')),
        'suspended_users', (select count(*) from auth.users where banned_until is not null and banned_until > timezone('utc'::text, now())),
        'total_appointments', (select count(*) from public.appointments),
        'total_paid_revenue_php', (select coalesce(sum(amount), 0) from public.payment_transactions where status = 'paid'),
        'audit_events_24h', (select count(*) from public.admin_audit_logs where created_at >= timezone('utc'::text, now()) - interval '24 hours'),
        'security_warnings_7d', (select count(*) from public.admin_audit_logs where severity in ('warning', 'critical') and created_at >= timezone('utc'::text, now()) - interval '7 days')
    ) into v_result;

    return v_result;
end;
$$;

revoke all on function public.admin_get_overview_stats() from public;
grant execute on function public.admin_get_overview_stats() to authenticated;

-- List Bookora SaaS clients (businesses, or filtered by auth account type)
create or replace function public.admin_list_clients(
    p_search text default '',
    p_plan text default 'all',
    p_status text default 'all',
    p_account_type text default 'business',
    p_limit integer default 50,
    p_offset integer default 0
)
returns table (
    user_id uuid,
    email text,
    phone text,
    email_confirmed_at timestamp with time zone,
    phone_confirmed_at timestamp with time zone,
    created_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    banned_until timestamp with time zone,
    is_suspended boolean,
    has_password boolean,
    auth_providers text[],
    account_type text,
    full_name text,
    mfa_enabled boolean,
    mfa_factors_count integer,
    password_updated_at timestamp with time zone,
    has_business_profile boolean,
    business_name text,
    slug text,
    industry text,
    business_email text,
    country_code text,
    business_phone text,
    city text,
    country text,
    brand_color text,
    theme text,
    logo_url text,
    website text,
    instagram text,
    facebook text,
    profile_updated_at timestamp with time zone,
    plan_code text,
    plan_name text,
    monthly_price_php numeric,
    subscription_status text,
    billing_provider text,
    billing_cycle text,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    xendit_customer_id text,
    xendit_subscription_id text,
    subscription_notes text,
    subscription_updated_at timestamp with time zone,
    services_count bigint,
    appointments_count bigint,
    clients_count bigint,
    staff_count bigint,
    paid_revenue_php numeric,
    total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
    v_search text := lower(trim(coalesce(p_search, '')));
    v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
    v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
    if not public.is_platform_admin() then
        raise exception 'Platform admin privileges required.' using errcode = '42501';
    end if;

    return query
    with enriched as (
        select
            u.id as user_id,
            coalesce(u.email, '')::text as email,
            coalesce(u.phone, '')::text as phone,
            u.email_confirmed_at,
            u.phone_confirmed_at,
            u.created_at,
            u.last_sign_in_at,
            u.banned_until,
            (u.banned_until is not null and u.banned_until > timezone('utc'::text, now())) as is_suspended,
            (coalesce(u.encrypted_password, '') <> '') as has_password,
            coalesce(
                (select array_agg(distinct i.provider::text) from auth.identities i where i.user_id = u.id),
                array[coalesce(u.raw_app_meta_data->>'provider', 'email')]::text[]
            ) as auth_providers,
            case
                when bp.id is not null then 'business'
                when exists (select 1 from public.staff_members sm where sm.user_id = u.id) then 'staff'
                when coalesce(u.raw_user_meta_data->>'account_type', '') = 'client'
                     or coalesce(u.raw_user_meta_data->>'role', '') = 'client' then 'client'
                when exists (select 1 from public.platform_admins pa where pa.user_id = u.id and pa.is_active = true) then 'admin'
                else coalesce(nullif(u.raw_user_meta_data->>'account_type', ''), 'business')
            end as account_type,
            coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')::text as full_name,
            exists (select 1 from auth.mfa_factors mf where mf.user_id = u.id and mf.status = 'verified') as mfa_enabled,
            coalesce((select count(*)::integer from auth.mfa_factors mf where mf.user_id = u.id and mf.status = 'verified'), 0) as mfa_factors_count,
            (
                select max(usl.created_at)
                from public.user_security_logs usl
                where usl.user_id = u.id and usl.action = 'password_updated'
            ) as password_updated_at,
            (bp.id is not null) as has_business_profile,
            coalesce(bp.business_name, u.raw_user_meta_data->>'business_name', '')::text as business_name,
            coalesce(bp.slug, '')::text as slug,
            coalesce(bp.industry, '')::text as industry,
            coalesce(bp.email, u.email, '')::text as business_email,
            coalesce(bp.country_code, '+63')::text as country_code,
            coalesce(bp.phone, '')::text as business_phone,
            coalesce(bp.city, '')::text as city,
            coalesce(bp.country, '')::text as country,
            coalesce(bp.brand_color, 'coral')::text as brand_color,
            coalesce(bp.theme, 'Light')::text as theme,
            coalesce(bp.logo_url, '')::text as logo_url,
            coalesce(bp.website, '')::text as website,
            coalesce(bp.instagram, '')::text as instagram,
            coalesce(bp.facebook, '')::text as facebook,
            bp.updated_at as profile_updated_at,
            coalesce(bs.plan_code, bp.subscription_tier, 'starter')::text as plan_code,
            coalesce(sp.name, initcap(coalesce(bs.plan_code, bp.subscription_tier, 'starter')))::text as plan_name,
            coalesce(sp.monthly_price_php, 249)::numeric as monthly_price_php,
            coalesce(bs.status, bp.subscription_status, 'active')::text as subscription_status,
            coalesce(bs.billing_provider, 'manual')::text as billing_provider,
            coalesce(bs.billing_cycle, 'monthly')::text as billing_cycle,
            bs.current_period_start,
            bs.current_period_end,
            bs.xendit_customer_id,
            bs.xendit_subscription_id,
            coalesce(bs.notes, '')::text as subscription_notes,
            bs.updated_at as subscription_updated_at,
            coalesce((select count(*) from public.services s where s.business_id = u.id), 0)::bigint as services_count,
            coalesce((select count(*) from public.appointments a where a.business_id = u.id), 0)::bigint as appointments_count,
            coalesce((select count(*) from public.clients c where c.business_id = u.id), 0)::bigint as clients_count,
            coalesce((select count(*) from public.staff_members st where st.business_id = u.id), 0)::bigint as staff_count,
            coalesce((select sum(pt.amount) from public.payment_transactions pt where pt.business_id = u.id and pt.status = 'paid'), 0)::numeric as paid_revenue_php
        from auth.users u
        left join public.business_profiles bp on bp.id = u.id
        left join public.business_subscriptions bs on bs.business_id = u.id
        left join public.subscription_plans sp on sp.code = coalesce(bs.plan_code, bp.subscription_tier, 'starter')
    ),
    filtered as (
        select e.*
        from enriched e
        where (
            coalesce(p_account_type, 'business') = 'all'
            or e.account_type = p_account_type
        )
        and (
            coalesce(p_plan, 'all') = 'all'
            or e.plan_code = p_plan
        )
        and (
            coalesce(p_status, 'all') = 'all'
            or (p_status = 'suspended' and e.is_suspended = true)
            or (p_status <> 'suspended' and e.subscription_status = p_status)
        )
        and (
            v_search = ''
            or lower(e.email) like '%' || v_search || '%'
            or lower(e.business_name) like '%' || v_search || '%'
            or lower(e.slug) like '%' || v_search || '%'
            or lower(e.full_name) like '%' || v_search || '%'
            or lower(e.business_phone) like '%' || v_search || '%'
            or lower(e.city) like '%' || v_search || '%'
            or lower(e.industry) like '%' || v_search || '%'
            or e.user_id::text like '%' || v_search || '%'
        )
    )
    select
        f.*,
        count(*) over() as total_count
    from filtered f
    order by f.created_at desc
    limit v_limit
    offset v_offset;
end;
$$;

revoke all on function public.admin_list_clients(text, text, text, text, integer, integer) from public;
grant execute on function public.admin_list_clients(text, text, text, text, integer, integer) to authenticated;

-- Get complete client detail (credentials metadata, business profile, subscription, stats, and recent logs)
create or replace function public.admin_get_client_detail(
    p_user_id uuid,
    p_log_view boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_actor_uid uuid := auth.uid();
    v_actor_email text := '';
    v_actor_role text := 'admin';
    v_user record;
    v_profile public.business_profiles%rowtype;
    v_sub public.business_subscriptions%rowtype;
    v_plan public.subscription_plans%rowtype;
    v_identities jsonb;
    v_mfa jsonb;
    v_pw_updated_at timestamp with time zone;
    v_stats jsonb;
    v_audit_logs jsonb;
    v_security_logs jsonb;
    v_checkouts jsonb;
begin
    if not public.is_platform_admin() then
        raise exception 'Platform admin privileges required.' using errcode = '42501';
    end if;

    select * into v_user from auth.users where id = p_user_id;
    if v_user.id is null then
        raise exception 'User not found.' using errcode = 'P0002';
    end if;

    select * into v_profile from public.business_profiles where id = p_user_id;
    select * into v_sub from public.business_subscriptions where business_id = p_user_id;
    select * into v_plan from public.subscription_plans where code = coalesce(v_sub.plan_code, v_profile.subscription_tier, 'starter');

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', i.id,
                'provider', i.provider,
                'last_sign_in_at', i.last_sign_in_at,
                'created_at', i.created_at,
                'identity_email', i.identity_data->>'email'
            )
            order by i.created_at asc
        ),
        '[]'::jsonb
    )
    into v_identities
    from auth.identities i
    where i.user_id = p_user_id;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', mf.id,
                'friendly_name', mf.friendly_name,
                'factor_type', mf.factor_type,
                'status', mf.status,
                'created_at', mf.created_at
            )
            order by mf.created_at asc
        ),
        '[]'::jsonb
    )
    into v_mfa
    from auth.mfa_factors mf
    where mf.user_id = p_user_id;

    select max(created_at) into v_pw_updated_at
    from public.user_security_logs
    where user_id = p_user_id and action = 'password_updated';

    select jsonb_build_object(
        'services_count', (select count(*) from public.services where business_id = p_user_id),
        'appointments_count', (select count(*) from public.appointments where business_id = p_user_id),
        'clients_count', (select count(*) from public.clients where business_id = p_user_id),
        'staff_count', (select count(*) from public.staff_members where business_id = p_user_id),
        'paid_revenue_php', (select coalesce(sum(amount), 0) from public.payment_transactions where business_id = p_user_id and status = 'paid'),
        'last_appointment_at', (select max(created_at) from public.appointments where business_id = p_user_id)
    ) into v_stats;

    select coalesce(jsonb_agg(to_jsonb(al) order by al.created_at desc), '[]'::jsonb)
    into v_audit_logs
    from (
        select id, actor_email, actor_role, category, action, severity, summary, before_state, after_state, metadata, created_at
        from public.admin_audit_logs
        where target_user_id = p_user_id or target_business_id = p_user_id or actor_user_id = p_user_id
        order by created_at desc
        limit 25
    ) al;

    select coalesce(jsonb_agg(to_jsonb(sl) order by sl.created_at desc), '[]'::jsonb)
    into v_security_logs
    from (
        select id, action, details, ip_address, user_agent, created_at
        from public.user_security_logs
        where user_id = p_user_id
        order by created_at desc
        limit 25
    ) sl;

    select coalesce(jsonb_agg(to_jsonb(cs) order by cs.created_at desc), '[]'::jsonb)
    into v_checkouts
    from (
        select id, target_plan_code, billing_cycle, provider, external_id, xendit_invoice_id, xendit_invoice_url, amount_php, currency, status, paid_at, created_at
        from public.subscription_checkout_sessions
        where business_id = p_user_id
        order by created_at desc
        limit 10
    ) cs;

    if p_log_view then
        select u.email into v_actor_email from auth.users u where u.id = v_actor_uid;
        select coalesce(pa.role, 'admin') into v_actor_role from public.platform_admins pa where pa.user_id = v_actor_uid limit 1;

        insert into public.admin_audit_logs (
            actor_user_id, actor_email, actor_role, category, action, severity,
            target_user_id, target_business_id, target_email, summary
        ) values (
            v_actor_uid, coalesce(v_actor_email, ''), v_actor_role,
            'admin', 'admin.client_viewed', 'info',
            p_user_id, case when v_profile.id is not null then p_user_id else null end,
            coalesce(v_user.email, ''),
            format('Inspected client credentials & profile for %s', coalesce(v_profile.business_name, v_user.email, p_user_id::text))
        );
    end if;

    return jsonb_build_object(
        'credentials', jsonb_build_object(
            'user_id', v_user.id,
            'email', v_user.email,
            'phone', v_user.phone,
            'email_confirmed_at', v_user.email_confirmed_at,
            'phone_confirmed_at', v_user.phone_confirmed_at,
            'has_password', (coalesce(v_user.encrypted_password, '') <> ''),
            'password_updated_at', v_pw_updated_at,
            'created_at', v_user.created_at,
            'updated_at', v_user.updated_at,
            'last_sign_in_at', v_user.last_sign_in_at,
            'banned_until', v_user.banned_until,
            'is_suspended', (v_user.banned_until is not null and v_user.banned_until > timezone('utc'::text, now())),
            'is_anonymous', coalesce(v_user.is_anonymous, false),
            'raw_user_meta_data', coalesce(v_user.raw_user_meta_data, '{}'::jsonb),
            'raw_app_meta_data', coalesce(v_user.raw_app_meta_data, '{}'::jsonb),
            'identities', v_identities,
            'mfa_factors', v_mfa
        ),
        'business_profile', case when v_profile.id is not null then to_jsonb(v_profile) else null end,
        'subscription', jsonb_build_object(
            'plan_code', coalesce(v_sub.plan_code, v_profile.subscription_tier, 'starter'),
            'plan_name', coalesce(v_plan.name, 'Starter'),
            'monthly_price_php', coalesce(v_plan.monthly_price_php, 249),
            'status', coalesce(v_sub.status, v_profile.subscription_status, 'active'),
            'billing_provider', coalesce(v_sub.billing_provider, 'manual'),
            'billing_cycle', coalesce(v_sub.billing_cycle, 'monthly'),
            'amount_php', coalesce(v_sub.amount_php, v_plan.monthly_price_php, 249),
            'currency', coalesce(v_sub.currency, 'PHP'),
            'current_period_start', v_sub.current_period_start,
            'current_period_end', v_sub.current_period_end,
            'trial_ends_at', v_sub.trial_ends_at,
            'cancel_at_period_end', coalesce(v_sub.cancel_at_period_end, false),
            'xendit_customer_id', v_sub.xendit_customer_id,
            'xendit_subscription_id', v_sub.xendit_subscription_id,
            'xendit_latest_invoice_id', v_sub.xendit_latest_invoice_id,
            'xendit_latest_invoice_url', v_sub.xendit_latest_invoice_url,
            'xendit_payment_status', v_sub.xendit_payment_status,
            'notes', coalesce(v_sub.notes, ''),
            'updated_at', v_sub.updated_at
        ),
        'stats', v_stats,
        'recent_audit_logs', v_audit_logs,
        'recent_security_logs', v_security_logs,
        'checkout_sessions', v_checkouts
    );
end;
$$;

revoke all on function public.admin_get_client_detail(uuid, boolean) from public;
grant execute on function public.admin_get_client_detail(uuid, boolean) to authenticated;

-- Update or assign a client's subscription plan (writes before/after audit log)
create or replace function public.admin_update_client_subscription(
    p_business_id uuid,
    p_plan_code text,
    p_status text default 'active',
    p_billing_provider text default 'manual',
    p_billing_cycle text default 'monthly',
    p_period_end timestamp with time zone default null,
    p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_actor_uid uuid := auth.uid();
    v_actor_email text := '';
    v_actor_role text := 'admin';
    v_target_email text := '';
    v_plan public.subscription_plans%rowtype;
    v_before public.business_subscriptions%rowtype;
    v_after public.business_subscriptions%rowtype;
    v_amount numeric(12,2);
begin
    if not public.is_platform_admin(array['super_admin', 'admin']) then
        raise exception 'Super admin or admin privileges required to update subscriptions.' using errcode = '42501';
    end if;

    select * into v_plan from public.subscription_plans where code = lower(trim(p_plan_code));
    if v_plan.code is null then
        raise exception 'Invalid subscription plan code: %', p_plan_code using errcode = '22023';
    end if;

    if p_status not in ('active', 'trialing', 'past_due', 'cancelled', 'expired') then
        raise exception 'Invalid subscription status: %', p_status using errcode = '22023';
    end if;

    if p_billing_provider not in ('manual', 'xendit', 'promo', 'system') then
        raise exception 'Invalid billing provider: %', p_billing_provider using errcode = '22023';
    end if;

    if p_billing_cycle not in ('monthly', 'annual', 'lifetime', 'custom') then
        raise exception 'Invalid billing cycle: %', p_billing_cycle using errcode = '22023';
    end if;

    select coalesce(email, '') into v_target_email from auth.users where id = p_business_id;
    if v_target_email = '' and not exists (select 1 from auth.users where id = p_business_id) then
        raise exception 'Target client user does not exist.' using errcode = 'P0002';
    end if;

    select * into v_before from public.business_subscriptions where business_id = p_business_id;
    v_amount := case when p_billing_cycle = 'annual' then v_plan.annual_price_php else v_plan.monthly_price_php end;

    select coalesce(email, '') into v_actor_email from auth.users where id = v_actor_uid;
    select coalesce(pa.role, 'admin') into v_actor_role from public.platform_admins pa where pa.user_id = v_actor_uid limit 1;

    perform set_config('bookora.audit_logged', 'true', true);

    insert into public.business_subscriptions (
        business_id, plan_code, status, billing_provider, billing_cycle, amount_php, currency,
        current_period_start, current_period_end, notes, updated_by, updated_at
    ) values (
        p_business_id, v_plan.code, p_status, p_billing_provider, p_billing_cycle, v_amount, v_plan.currency,
        timezone('utc'::text, now()), p_period_end, coalesce(p_notes, ''), v_actor_uid, timezone('utc'::text, now())
    )
    on conflict (business_id) do update set
        plan_code = excluded.plan_code,
        status = excluded.status,
        billing_provider = excluded.billing_provider,
        billing_cycle = excluded.billing_cycle,
        amount_php = excluded.amount_php,
        current_period_end = excluded.current_period_end,
        notes = excluded.notes,
        updated_by = excluded.updated_by,
        updated_at = timezone('utc'::text, now())
    returning * into v_after;

    perform set_config('bookora.audit_logged', 'false', true);

    insert into public.admin_audit_logs (
        actor_user_id, actor_email, actor_role, category, action, severity,
        target_user_id, target_business_id, target_email, summary, before_state, after_state, metadata
    ) values (
        v_actor_uid, v_actor_email, v_actor_role,
        'subscription', 'admin.subscription_updated', 'info',
        p_business_id, p_business_id, v_target_email,
        format(
            'Subscription updated for %s: %s (%s) -> %s (%s)',
            coalesce(nullif(v_target_email, ''), p_business_id::text),
            coalesce(v_before.plan_code, 'none'),
            coalesce(v_before.status, 'none'),
            v_after.plan_code,
            v_after.status
        ),
        case when v_before.id is not null then to_jsonb(v_before) else null end,
        to_jsonb(v_after),
        jsonb_build_object('notes', coalesce(p_notes, ''), 'billing_provider', p_billing_provider)
    );

    return to_jsonb(v_after);
end;
$$;

revoke all on function public.admin_update_client_subscription(uuid, text, text, text, text, timestamp with time zone, text) from public;
grant execute on function public.admin_update_client_subscription(uuid, text, text, text, text, timestamp with time zone, text) to authenticated;

-- Suspend or unsuspend a user account (updates auth.users.banned_until and writes audit log)
create or replace function public.admin_toggle_user_suspension(
    p_user_id uuid,
    p_suspend boolean,
    p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_actor_uid uuid := auth.uid();
    v_actor_email text := '';
    v_actor_role text := 'admin';
    v_target_email text := '';
    v_prev_banned timestamp with time zone;
    v_next_banned timestamp with time zone;
begin
    if not public.is_platform_admin(array['super_admin', 'admin']) then
        raise exception 'Super admin or admin privileges required to suspend accounts.' using errcode = '42501';
    end if;

    if p_user_id = v_actor_uid then
        raise exception 'You cannot suspend your own admin account.' using errcode = '22023';
    end if;

    select email, banned_until into v_target_email, v_prev_banned from auth.users where id = p_user_id;
    if v_target_email is null then
        raise exception 'Target user not found.' using errcode = 'P0002';
    end if;

    v_next_banned := case when p_suspend then '2099-12-31T23:59:59Z'::timestamp with time zone else null end;

    update auth.users
    set banned_until = v_next_banned,
        updated_at = timezone('utc'::text, now())
    where id = p_user_id;

    select coalesce(email, '') into v_actor_email from auth.users where id = v_actor_uid;
    select coalesce(pa.role, 'admin') into v_actor_role from public.platform_admins pa where pa.user_id = v_actor_uid limit 1;

    insert into public.admin_audit_logs (
        actor_user_id, actor_email, actor_role, category, action, severity,
        target_user_id, target_business_id, target_email, summary, before_state, after_state, metadata
    ) values (
        v_actor_uid, v_actor_email, v_actor_role,
        'security',
        case when p_suspend then 'admin.user_suspended' else 'admin.user_unsuspended' end,
        'warning',
        p_user_id, p_user_id, v_target_email,
        case
            when p_suspend then format('Suspended account %s', v_target_email)
            else format('Restored suspended account %s', v_target_email)
        end,
        jsonb_build_object('banned_until', v_prev_banned),
        jsonb_build_object('banned_until', v_next_banned),
        jsonb_build_object('reason', coalesce(p_reason, ''))
    );

    return jsonb_build_object('user_id', p_user_id, 'is_suspended', p_suspend, 'banned_until', v_next_banned);
end;
$$;

revoke all on function public.admin_toggle_user_suspension(uuid, boolean, text) from public;
grant execute on function public.admin_toggle_user_suspension(uuid, boolean, text) to authenticated;

-- Record explicit admin security/audit events from the admin UI
create or replace function public.admin_record_audit_event(
    p_action text,
    p_category text default 'admin',
    p_severity text default 'info',
    p_target_user_id uuid default null,
    p_target_business_id uuid default null,
    p_target_email text default '',
    p_summary text default '',
    p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_actor_uid uuid := auth.uid();
    v_actor_email text := '';
    v_actor_role text := 'admin';
    v_log_id uuid;
begin
    if not public.is_platform_admin() then
        raise exception 'Platform admin privileges required.' using errcode = '42501';
    end if;

    select coalesce(email, '') into v_actor_email from auth.users where id = v_actor_uid;
    select coalesce(pa.role, 'admin') into v_actor_role from public.platform_admins pa where pa.user_id = v_actor_uid limit 1;

    insert into public.admin_audit_logs (
        actor_user_id, actor_email, actor_role, category, action, severity,
        target_user_id, target_business_id, target_email, summary, metadata
    ) values (
        v_actor_uid,
        v_actor_email,
        v_actor_role,
        case when p_category in ('auth', 'admin', 'subscription', 'business', 'billing', 'security') then p_category else 'admin' end,
        left(coalesce(nullif(trim(p_action), ''), 'admin.event'), 120),
        case when p_severity in ('info', 'warning', 'critical') then p_severity else 'info' end,
        p_target_user_id,
        p_target_business_id,
        coalesce(p_target_email, ''),
        left(coalesce(p_summary, ''), 500),
        coalesce(p_metadata, '{}'::jsonb)
    )
    returning id into v_log_id;

    return v_log_id;
end;
$$;

revoke all on function public.admin_record_audit_event(text, text, text, uuid, uuid, text, text, jsonb) from public;
grant execute on function public.admin_record_audit_event(text, text, text, uuid, uuid, text, text, jsonb) to authenticated;

-- List audit logs with search & filtering
create or replace function public.admin_list_audit_logs(
    p_search text default '',
    p_category text default 'all',
    p_severity text default 'all',
    p_limit integer default 60,
    p_offset integer default 0
)
returns table (
    id uuid,
    actor_user_id uuid,
    actor_email text,
    actor_role text,
    category text,
    action text,
    severity text,
    target_user_id uuid,
    target_business_id uuid,
    target_email text,
    summary text,
    before_state jsonb,
    after_state jsonb,
    metadata jsonb,
    created_at timestamp with time zone,
    total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_search text := lower(trim(coalesce(p_search, '')));
    v_limit integer := least(greatest(coalesce(p_limit, 60), 1), 200);
    v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
    if not public.is_platform_admin() then
        raise exception 'Platform admin privileges required.' using errcode = '42501';
    end if;

    return query
    with filtered as (
        select l.*
        from public.admin_audit_logs l
        where (coalesce(p_category, 'all') = 'all' or l.category = p_category)
          and (coalesce(p_severity, 'all') = 'all' or l.severity = p_severity)
          and (
              v_search = ''
              or lower(l.actor_email) like '%' || v_search || '%'
              or lower(l.target_email) like '%' || v_search || '%'
              or lower(l.action) like '%' || v_search || '%'
              or lower(l.summary) like '%' || v_search || '%'
          )
    )
    select
        f.id,
        f.actor_user_id,
        f.actor_email,
        f.actor_role,
        f.category,
        f.action,
        f.severity,
        f.target_user_id,
        f.target_business_id,
        f.target_email,
        f.summary,
        f.before_state,
        f.after_state,
        f.metadata,
        f.created_at,
        count(*) over() as total_count
    from filtered f
    order by f.created_at desc
    limit v_limit
    offset v_offset;
end;
$$;

revoke all on function public.admin_list_audit_logs(text, text, text, integer, integer) from public;
grant execute on function public.admin_list_audit_logs(text, text, text, integer, integer) to authenticated;

-- List user password/security logs across accounts for admin security review
create or replace function public.admin_list_user_security_logs(
    p_search text default '',
    p_limit integer default 60,
    p_offset integer default 0
)
returns table (
    id uuid,
    user_id uuid,
    user_email text,
    business_name text,
    action text,
    details text,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone,
    total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
    v_search text := lower(trim(coalesce(p_search, '')));
    v_limit integer := least(greatest(coalesce(p_limit, 60), 1), 200);
    v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
    if not public.is_platform_admin() then
        raise exception 'Platform admin privileges required.' using errcode = '42501';
    end if;

    return query
    with joined as (
        select
            usl.id,
            usl.user_id,
            coalesce(u.email, '')::text as user_email,
            coalesce(bp.business_name, '')::text as business_name,
            usl.action,
            coalesce(usl.details, '')::text as details,
            coalesce(usl.ip_address, '')::text as ip_address,
            coalesce(usl.user_agent, '')::text as user_agent,
            usl.created_at
        from public.user_security_logs usl
        left join auth.users u on u.id = usl.user_id
        left join public.business_profiles bp on bp.id = usl.user_id
        where v_search = ''
           or lower(coalesce(u.email, '')) like '%' || v_search || '%'
           or lower(coalesce(bp.business_name, '')) like '%' || v_search || '%'
           or lower(usl.action) like '%' || v_search || '%'
           or lower(coalesce(usl.details, '')) like '%' || v_search || '%'
    )
    select j.*, count(*) over() as total_count
    from joined j
    order by j.created_at desc
    limit v_limit
    offset v_offset;
end;
$$;

revoke all on function public.admin_list_user_security_logs(text, integer, integer) from public;
grant execute on function public.admin_list_user_security_logs(text, integer, integer) to authenticated;

-- List and manage platform admins from the UI (super_admin only for mutations)
create or replace function public.admin_list_platform_admins()
returns table (
    id uuid,
    user_id uuid,
    email text,
    role text,
    is_active boolean,
    notes text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.is_platform_admin() then
        raise exception 'Platform admin privileges required.' using errcode = '42501';
    end if;

    return query
    select pa.id, pa.user_id, pa.email, pa.role, pa.is_active, pa.notes, pa.created_at, pa.updated_at
    from public.platform_admins pa
    order by pa.created_at asc;
end;
$$;

revoke all on function public.admin_list_platform_admins() from public;
grant execute on function public.admin_list_platform_admins() to authenticated;

create or replace function public.admin_upsert_platform_admin(
    p_email text,
    p_role text default 'admin',
    p_is_active boolean default true,
    p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_email text := lower(trim(coalesce(p_email, '')));
    v_row public.platform_admins%rowtype;
begin
    if not public.is_platform_admin(array['super_admin']) then
        raise exception 'Super admin privileges required to manage platform admins.' using errcode = '42501';
    end if;

    if v_email = '' or position('@' in v_email) = 0 then
        raise exception 'Enter a valid admin email address.' using errcode = '22023';
    end if;

    if p_role not in ('super_admin', 'admin', 'support', 'viewer') then
        raise exception 'Invalid admin role: %', p_role using errcode = '22023';
    end if;

    insert into public.platform_admins (email, role, is_active, notes)
    values (v_email, p_role, coalesce(p_is_active, true), coalesce(p_notes, ''))
    on conflict (lower(email)) do update set
        role = excluded.role,
        is_active = excluded.is_active,
        notes = excluded.notes,
        updated_at = timezone('utc'::text, now())
    returning * into v_row;

    return to_jsonb(v_row);
end;
$$;

revoke all on function public.admin_upsert_platform_admin(text, text, boolean, text) from public;
grant execute on function public.admin_upsert_platform_admin(text, text, boolean, text) to authenticated;

-- Allow super_admin / admin to create or update subscription plans (including Xendit plan IDs)
create or replace function public.admin_upsert_subscription_plan(
    p_code text,
    p_name text,
    p_description text default '',
    p_monthly_price_php numeric default 0,
    p_annual_price_php numeric default 0,
    p_max_staff integer default null,
    p_max_locations integer default 1,
    p_features jsonb default '[]'::jsonb,
    p_xendit_plan_id text default null,
    p_is_active boolean default true,
    p_is_public boolean default true,
    p_sort_order integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_code text := lower(regexp_replace(trim(coalesce(p_code, '')), '[^a-z0-9_-]+', '-', 'g'));
    v_actor_uid uuid := auth.uid();
    v_actor_email text := '';
    v_row public.subscription_plans%rowtype;
begin
    if not public.is_platform_admin(array['super_admin', 'admin']) then
        raise exception 'Admin privileges required to manage plans.' using errcode = '42501';
    end if;

    if v_code = '' then
        raise exception 'Plan code is required.' using errcode = '22023';
    end if;

    insert into public.subscription_plans (
        code, name, description, monthly_price_php, annual_price_php,
        max_staff, max_locations, features, xendit_plan_id,
        is_active, is_public, sort_order, updated_at
    ) values (
        v_code, trim(p_name), coalesce(p_description, ''),
        greatest(0, coalesce(p_monthly_price_php, 0)),
        greatest(0, coalesce(p_annual_price_php, 0)),
        p_max_staff, p_max_locations, coalesce(p_features, '[]'::jsonb),
        nullif(trim(coalesce(p_xendit_plan_id, '')), ''),
        coalesce(p_is_active, true), coalesce(p_is_public, true),
        coalesce(p_sort_order, 10), timezone('utc'::text, now())
    )
    on conflict (code) do update set
        name = excluded.name,
        description = excluded.description,
        monthly_price_php = excluded.monthly_price_php,
        annual_price_php = excluded.annual_price_php,
        max_staff = excluded.max_staff,
        max_locations = excluded.max_locations,
        features = excluded.features,
        xendit_plan_id = excluded.xendit_plan_id,
        is_active = excluded.is_active,
        is_public = excluded.is_public,
        sort_order = excluded.sort_order,
        updated_at = timezone('utc'::text, now())
    returning * into v_row;

    select coalesce(email, '') into v_actor_email from auth.users where id = v_actor_uid;
    insert into public.admin_audit_logs (
        actor_user_id, actor_email, actor_role, category, action, severity,
        summary, after_state
    ) values (
        v_actor_uid, v_actor_email, 'admin', 'billing', 'admin.plan_upserted', 'info',
        format('Subscription plan %s (%s) saved at PHP %s/mo', v_row.name, v_row.code, v_row.monthly_price_php),
        to_jsonb(v_row)
    );

    return to_jsonb(v_row);
end;
$$;

revoke all on function public.admin_upsert_subscription_plan(text, text, text, numeric, numeric, integer, integer, jsonb, text, boolean, boolean, integer) from public;
grant execute on function public.admin_upsert_subscription_plan(text, text, text, numeric, numeric, integer, integer, jsonb, text, boolean, boolean, integer) to authenticated;

