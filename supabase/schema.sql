-- ==============================================================================
-- Bookora / Supabase Database Update for Password Changes & Security Logs
-- ==============================================================================
-- Run these SQL statements in your Supabase project SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
-- ==============================================================================

-- 1. Create a table to audit user security actions (e.g. password updates, credential modifications)
create table if not exists public.user_security_logs (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    action text not null default 'password_updated',
    details text,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index for fast user security lookup
create index if not exists idx_user_security_logs_user_id
    on public.user_security_logs (user_id);

-- 2. Enable Row Level Security (RLS) on user_security_logs
alter table public.user_security_logs enable row level security;

-- 3. Policy: Authenticated users can view only their own security logs
drop policy if exists "Users can view own security logs" on public.user_security_logs;
create policy "Users can view own security logs"
    on public.user_security_logs
    for select
    using (auth.uid() = user_id);

-- 4. Policy: Authenticated users can insert their own security logs
drop policy if exists "Users can insert own security logs" on public.user_security_logs;
create policy "Users can insert own security logs"
    on public.user_security_logs
    for insert
    with check (auth.uid() = user_id);

-- 5. Optional: Sync with public.profiles if a profiles table exists
do $$
begin
    if exists (select from pg_tables where schemaname = 'public' and tablename = 'profiles') then
        alter table public.profiles add column if not exists password_updated_at timestamp with time zone;
    end if;
end $$;

-- 6. PostgreSQL trigger function on auth.users:
-- Automatically records password changes whenever auth.users.encrypted_password changes.
create or replace function public.handle_user_password_change()
returns trigger as $$
begin
    if old.encrypted_password is distinct from new.encrypted_password then
        -- Record in security audit log
        insert into public.user_security_logs (user_id, action, details, created_at)
        values (new.id, 'password_updated', 'Password changed via Settings modal', timezone('utc'::text, now()));

        -- If public.profiles exists, sync password_updated_at
        if exists (select from pg_tables where schemaname = 'public' and tablename = 'profiles') then
            update public.profiles
            set password_updated_at = timezone('utc'::text, now())
            where id = new.id;
        end if;
    end if;
    return new;
end;
$$ language plpgsql security definer;

-- Attach trigger to auth.users (executes in Supabase with admin permissions)
drop trigger if exists on_auth_user_password_change on auth.users;
create trigger on_auth_user_password_change
    after update of encrypted_password on auth.users
    for each row execute function public.handle_user_password_change();

-- 7. Grant access to authenticated users
grant select, insert on public.user_security_logs to authenticated;

-- ==============================================================================
-- 8. Business Profiles Table & Policies
-- ==============================================================================
create table if not exists public.business_profiles (
    id uuid references auth.users(id) on delete cascade primary key,
    business_name text not null default 'Your business',
    slug text,
    industry text default 'Nail salon',
    about text default '',
    brand_color text default 'coral',
    theme text default 'Light',
    email text default '',
    country_code text default '+63',
    phone text default '',
    address text default '',
    city text default '',
    country text default 'Philippines',
    business_hours jsonb default '[
        {"day": "Monday", "open": true, "start": "09:00", "end": "17:00"},
        {"day": "Tuesday", "open": true, "start": "09:00", "end": "17:00"},
        {"day": "Wednesday", "open": true, "start": "09:00", "end": "17:00"},
        {"day": "Thursday", "open": true, "start": "09:00", "end": "17:00"},
        {"day": "Friday", "open": true, "start": "09:00", "end": "17:00"},
        {"day": "Saturday", "open": false, "start": "09:00", "end": "17:00"},
        {"day": "Sunday", "open": false, "start": "09:00", "end": "17:00"}
    ]'::jsonb,
    availability_breaks jsonb not null default '{}'::jsonb,
    time_off jsonb not null default '[]'::jsonb,
    website text default '',
    instagram text default '',
    facebook text default '',
    booking_policy text default '',
    booking_min_notice_hours integer default 2,
    booking_max_days integer default 60,
    booking_slot_size_minutes integer default 30,
    booking_cancellation_notice_hours integer default 24,
    booking_buffer_minutes integer default 0,
    booking_show_phone boolean default true,
    booking_show_address boolean default false,
    booking_show_notes boolean default true,
    booking_show_design_peg boolean default true,
    booking_show_payment_receipt boolean default false,
    booking_show_price boolean not null default true,
    booking_show_duration boolean not null default true,
    booking_show_hours boolean not null default true,
    booking_show_staff boolean not null default true,
    booking_show_reviews boolean not null default true,
    booking_allow_customer_login boolean not null default true,
    booking_fee_enabled boolean default false,
    booking_fee_type text default 'fixed',
    booking_fee_amount numeric default 0,
    booking_fee_note text default '',
    booking_additional_info text default '',
    payment_receipt_url text default '',
    banner_url text default '',
    logo_url text default '',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Safe migration for projects where business_profiles already exists.
alter table public.business_profiles
    add column if not exists booking_policy text default '';
alter table public.business_profiles add column if not exists availability_breaks jsonb not null default '{}'::jsonb;
alter table public.business_profiles add column if not exists time_off jsonb not null default '[]'::jsonb;
alter table public.business_profiles
    add column if not exists booking_min_notice_hours integer default 2;
alter table public.business_profiles
    add column if not exists booking_max_days integer default 60;
alter table public.business_profiles
    add column if not exists booking_slot_size_minutes integer default 30;
alter table public.business_profiles
    add column if not exists booking_cancellation_notice_hours integer default 24;
alter table public.business_profiles
    add column if not exists booking_buffer_minutes integer default 0;
alter table public.business_profiles
    add column if not exists booking_show_phone boolean default true;
alter table public.business_profiles
    add column if not exists booking_show_address boolean default false;
alter table public.business_profiles
    add column if not exists booking_show_notes boolean default true;
alter table public.business_profiles
    add column if not exists booking_show_design_peg boolean default true;
alter table public.business_profiles
    add column if not exists booking_show_payment_receipt boolean default false;
alter table public.business_profiles add column if not exists booking_show_price boolean not null default true;
alter table public.business_profiles add column if not exists booking_show_duration boolean not null default true;
alter table public.business_profiles add column if not exists booking_show_hours boolean not null default true;
alter table public.business_profiles add column if not exists booking_show_staff boolean not null default true;
alter table public.business_profiles add column if not exists booking_show_reviews boolean not null default true;
alter table public.business_profiles add column if not exists booking_allow_customer_login boolean not null default true;
alter table public.business_profiles
    add column if not exists booking_fee_enabled boolean default false;
alter table public.business_profiles
    add column if not exists booking_fee_type text default 'fixed';
alter table public.business_profiles
    add column if not exists booking_fee_amount numeric default 0;
alter table public.business_profiles
    add column if not exists booking_fee_note text default '';
alter table public.business_profiles
    add column if not exists booking_additional_info text default '';
alter table public.business_profiles
    add column if not exists payment_receipt_url text default '';

-- Index for id lookup
create index if not exists idx_business_profiles_id on public.business_profiles (id);

-- ============================================================================
-- 8a. Notification Settings
-- ============================================================================
create table if not exists public.notification_settings (
    business_id uuid references auth.users(id) on delete cascade primary key,
    email_enabled boolean not null default true,
    sms_enabled boolean not null default false,
    customer_confirmation_enabled boolean not null default true,
    staff_confirmation_enabled boolean not null default true,
    reminder_enabled boolean not null default true,
    reminder_lead_hours integer not null default 24,
    sender_name text not null default 'Bookora',
    email_signature text not null default '',
    quiet_hours_start time,
    quiet_hours_end time,
    updated_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint notification_settings_reminder_lead_hours_check check (reminder_lead_hours in (2, 24, 48, 72)),
    constraint notification_settings_sender_name_check check (char_length(sender_name) between 1 and 80),
    constraint notification_settings_email_signature_check check (char_length(email_signature) <= 1000)
);
alter table public.notification_settings enable row level security;
drop policy if exists "Owners can view notification settings" on public.notification_settings;
create policy "Owners can view notification settings" on public.notification_settings for select using (auth.uid() = business_id);
drop policy if exists "Owners can insert notification settings" on public.notification_settings;
create policy "Owners can insert notification settings" on public.notification_settings for insert with check (auth.uid() = business_id);
drop policy if exists "Owners can update notification settings" on public.notification_settings;
create policy "Owners can update notification settings" on public.notification_settings for update using (auth.uid() = business_id) with check (auth.uid() = business_id);
grant select, insert, update on public.notification_settings to authenticated;

-- ============================================================================
-- 8b. Notification Delivery Events
-- ============================================================================
create table if not exists public.notification_events (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null,
    appointment_id uuid,
    event_type text not null,
    channel text not null,
    recipient text not null default '',
    status text not null,
    provider_message text not null default '',
    scheduled_for timestamp with time zone,
    attempt_count integer not null default 0,
    processing_started_at timestamp with time zone,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint notification_events_type_check check (event_type in ('booking_confirmation', 'reminder', 'staff_notification', 'cancellation', 'reschedule', 'payment', 'no_show')),
    constraint notification_events_channel_check check (channel in ('email', 'sms')),
    constraint notification_events_status_check check (status in ('sent', 'failed', 'scheduled', 'processing')),
    constraint notification_events_message_check check (char_length(provider_message) <= 2000)
);
create index if not exists idx_notification_events_business_created on public.notification_events (business_id, created_at desc);
alter table public.notification_events enable row level security;
drop policy if exists "Owners can view notification events" on public.notification_events;
create policy "Owners can view notification events" on public.notification_events for select using (auth.uid() = business_id);
grant select on public.notification_events to authenticated;
create or replace function public.retry_notification_event(p_event_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare changed boolean; affected integer;
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  update public.notification_events set status = 'scheduled', provider_message = 'Retry requested by owner', processing_started_at = null where id = p_event_id and business_id = auth.uid() and status = 'failed' and attempt_count < 5;
  get diagnostics affected = row_count;
  changed := affected > 0;
  return changed;
end;
$$;
revoke all on function public.retry_notification_event(uuid) from public;
grant execute on function public.retry_notification_event(uuid) to authenticated;

-- ============================================================================
-- 8c. Scheduled Report Preferences
-- ============================================================================
create table if not exists public.report_schedules (
    business_id uuid references auth.users(id) on delete cascade primary key,
    recipient_email text not null default '',
    frequency text not null default 'weekly',
    send_day integer not null default 1,
    time_zone text not null default 'Asia/Manila',
    enabled boolean not null default false,
    last_sent_at timestamp with time zone,
    processing_started_at timestamp with time zone,
    updated_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint report_schedules_frequency_check check (frequency in ('weekly', 'monthly')),
    constraint report_schedules_send_day_check check (send_day between 1 and 28),
    constraint report_schedules_email_check check (recipient_email = '' or recipient_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
alter table public.report_schedules add column if not exists last_sent_at timestamp with time zone;
alter table public.report_schedules add column if not exists processing_started_at timestamp with time zone;
alter table public.report_schedules add column if not exists time_zone text not null default 'Asia/Manila';
alter table public.report_schedules enable row level security;
drop policy if exists "Owners can view report schedules" on public.report_schedules;
create policy "Owners can view report schedules" on public.report_schedules for select using (auth.uid() = business_id);
drop policy if exists "Owners can insert report schedules" on public.report_schedules;
create policy "Owners can insert report schedules" on public.report_schedules for insert with check (auth.uid() = business_id);
drop policy if exists "Owners can update report schedules" on public.report_schedules;
create policy "Owners can update report schedules" on public.report_schedules for update using (auth.uid() = business_id) with check (auth.uid() = business_id);
grant select, insert, update on public.report_schedules to authenticated;

-- ============================================================================
-- 8d. Integration Connections
-- ============================================================================
create table if not exists public.integration_connections (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null,
    provider text not null,
    status text not null default 'disconnected',
    external_account_label text not null default '',
    last_sync_at timestamp with time zone,
    error_message text not null default '',
    updated_at timestamp with time zone not null default timezone('utc'::text, now()),
    unique (business_id, provider),
    constraint integration_connections_provider_check check (provider in ('google_calendar', 'outlook_calendar', 'apple_calendar', 'zoom', 'webhooks', 'accounting')),
    constraint integration_connections_status_check check (status in ('connected', 'disconnected', 'error', 'pending')),
    constraint integration_connections_label_check check (char_length(external_account_label) <= 160),
    constraint integration_connections_error_check check (char_length(error_message) <= 1000)
);
alter table public.integration_connections enable row level security;
drop policy if exists "Owners can view integration connections" on public.integration_connections;
create policy "Owners can view integration connections" on public.integration_connections for select using (auth.uid() = business_id);
drop policy if exists "Owners can insert integration connections" on public.integration_connections;
create policy "Owners can insert integration connections" on public.integration_connections for insert with check (auth.uid() = business_id);
drop policy if exists "Owners can update integration connections" on public.integration_connections;
create policy "Owners can update integration connections" on public.integration_connections for update using (auth.uid() = business_id) with check (auth.uid() = business_id);
grant select, insert, update on public.integration_connections to authenticated;

-- Secure one-way calendar subscription feed tokens.
create table if not exists public.calendar_feed_tokens (id uuid default gen_random_uuid() primary key, business_id uuid references auth.users(id) on delete cascade not null unique, token text not null unique, created_at timestamp with time zone not null default timezone('utc'::text, now()), rotated_at timestamp with time zone not null default timezone('utc'::text, now()));
alter table public.calendar_feed_tokens enable row level security;
revoke all on public.calendar_feed_tokens from anon, authenticated;
create or replace function public.rotate_calendar_feed_token()
returns text language plpgsql security definer set search_path = public
as $$
declare next_token text;
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  next_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.calendar_feed_tokens (business_id, token, rotated_at) values (auth.uid(), next_token, timezone('utc'::text, now())) on conflict (business_id) do update set token = excluded.token, rotated_at = excluded.rotated_at;
  return next_token;
end;
$$;
revoke all on function public.rotate_calendar_feed_token() from public;
grant execute on function public.rotate_calendar_feed_token() to authenticated;

-- Scoped API tokens and provider-neutral webhook intake.
create extension if not exists pgcrypto;
create table if not exists public.api_tokens (id uuid default gen_random_uuid() primary key, business_id uuid references auth.users(id) on delete cascade not null, token_hash text not null unique, token_prefix text not null, scopes text[] not null default array['webhooks:write']::text[], created_at timestamp with time zone not null default timezone('utc'::text, now()), last_used_at timestamp with time zone, revoked_at timestamp with time zone, constraint api_tokens_scopes_check check (scopes <@ array['webhooks:write', 'api:read', 'api:write']::text[]));
create index if not exists idx_api_tokens_business on public.api_tokens (business_id, created_at desc);
alter table public.api_tokens enable row level security;
drop policy if exists "Owners can view API tokens" on public.api_tokens;
create policy "Owners can view API tokens" on public.api_tokens for select to authenticated using (auth.uid() = business_id);
grant select on public.api_tokens to authenticated;
create or replace function public.issue_api_token(p_scopes text[] default array['webhooks:write']::text[])
returns table (id uuid, token text, token_prefix text, scopes text[]) language plpgsql security definer set search_path = public
as $$
declare raw_token text; next_scopes text[];
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  next_scopes := coalesce(p_scopes, array['webhooks:write']::text[]);
  if next_scopes = '{}'::text[] or not (next_scopes <@ array['webhooks:write', 'api:read', 'api:write']::text[]) then raise exception 'Invalid API token scope.' using errcode = '22023'; end if;
  raw_token := 'bo_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  return query insert into public.api_tokens (business_id, token_hash, token_prefix, scopes) values (auth.uid(), encode(digest(raw_token, 'sha256'), 'hex'), left(raw_token, 11), next_scopes) returning api_tokens.id, raw_token, api_tokens.token_prefix, api_tokens.scopes;
end;
$$;
revoke all on function public.issue_api_token(text[]) from public;
grant execute on function public.issue_api_token(text[]) to authenticated;
create or replace function public.revoke_api_token(p_token_id uuid) returns void language plpgsql security definer set search_path = public as $$ begin update public.api_tokens set revoked_at = timezone('utc'::text, now()) where id = p_token_id and business_id = auth.uid() and revoked_at is null; end; $$;
revoke all on function public.revoke_api_token(uuid) from public;
grant execute on function public.revoke_api_token(uuid) to authenticated;
create table if not exists public.integration_webhook_events (id uuid default gen_random_uuid() primary key, business_id uuid references auth.users(id) on delete cascade not null, api_token_id uuid references public.api_tokens(id) on delete set null, event_type text not null, idempotency_key text not null, payload jsonb not null default '{}'::jsonb, status text not null default 'received' check (status in ('received', 'processed', 'failed')), created_at timestamp with time zone not null default timezone('utc'::text, now()), unique (business_id, idempotency_key));
alter table public.integration_webhook_events enable row level security;
drop policy if exists "Owners can view webhook events" on public.integration_webhook_events;
create policy "Owners can view webhook events" on public.integration_webhook_events for select to authenticated using (auth.uid() = business_id);
grant select on public.integration_webhook_events to authenticated;
revoke insert, update, delete on public.integration_webhook_events from anon, authenticated;

-- Enable RLS
alter table public.business_profiles enable row level security;

-- Policies
drop policy if exists "Users can view own business profile" on public.business_profiles;
create policy "Users can view own business profile"
    on public.business_profiles
    for select
    using (auth.uid() = id);

drop policy if exists "Users can insert own business profile" on public.business_profiles;
create policy "Users can insert own business profile"
    on public.business_profiles
    for insert
    with check (auth.uid() = id);

drop policy if exists "Users can update own business profile" on public.business_profiles;
create policy "Users can update own business profile"
    on public.business_profiles
    for update
    using (auth.uid() = id)
    with check (auth.uid() = id);

grant select, insert, update on public.business_profiles to authenticated;

-- Public profile media. Files are scoped to the authenticated user's folder and
-- the URLs are saved in business_profiles.banner_url / logo_url.
insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "Users can upload own brand assets" on storage.objects;
create policy "Users can upload own brand assets"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can update own brand assets" on storage.objects;
create policy "Users can update own brand assets"
    on storage.objects for update to authenticated
    using (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Anyone can view brand assets" on storage.objects;
create policy "Anyone can view brand assets"
    on storage.objects for select to public
    using (bucket_id = 'brand-assets');

-- ============================================================================
-- Services and service categories
-- ============================================================================
alter table public.business_profiles
    add column if not exists service_defaults_seeded boolean not null default false;

create table if not exists public.service_categories (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null,
    user_id uuid references auth.users(id) on delete set null,
    name text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique (business_id, name)
);

create table if not exists public.services (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null,
    category_id uuid references public.service_categories(id) on delete set null,
    name text not null,
    description text default '',
    duration_minutes integer,
    buffer_minutes integer not null default 0,
    price text not null default 'Free',
    image_url text default '',
    show_on_booking_page boolean not null default true,
    deposit_type text not null default 'none',
    deposit_amount numeric(12,2) not null default 0,
    service_hours jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint services_duration_nonnegative check (duration_minutes is null or duration_minutes >= 0),
    constraint services_buffer_nonnegative check (buffer_minutes >= 0)
);
alter table public.services add column if not exists deposit_type text not null default 'none';
alter table public.services add column if not exists deposit_amount numeric(12,2) not null default 0;
alter table public.services add column if not exists service_hours jsonb;
alter table public.services drop constraint if exists services_deposit_type_check;
alter table public.services add constraint services_deposit_type_check check (deposit_type in ('none', 'fixed', 'percentage'));
alter table public.services drop constraint if exists services_deposit_amount_check;
alter table public.services add constraint services_deposit_amount_check check (deposit_amount >= 0);

alter table public.services add column if not exists description text default '';

create index if not exists idx_service_categories_business_id on public.service_categories (business_id);
create index if not exists idx_services_business_id on public.services (business_id);
create index if not exists idx_services_category_id on public.services (category_id);

alter table public.service_categories enable row level security;
alter table public.services enable row level security;

drop policy if exists "Users can view own service categories" on public.service_categories;
create policy "Users can view own service categories" on public.service_categories for select using (auth.uid() = business_id);
drop policy if exists "Users can insert own service categories" on public.service_categories;
create policy "Users can insert own service categories" on public.service_categories for insert with check (auth.uid() = business_id);
drop policy if exists "Users can update own service categories" on public.service_categories;
create policy "Users can update own service categories" on public.service_categories for update using (auth.uid() = business_id) with check (auth.uid() = business_id);
drop policy if exists "Users can delete own service categories" on public.service_categories;
create policy "Users can delete own service categories" on public.service_categories for delete using (auth.uid() = business_id);

drop policy if exists "Users can view own services" on public.services;
create policy "Users can view own services" on public.services for select using (auth.uid() = business_id);
drop policy if exists "Users can insert own services" on public.services;
create policy "Users can insert own services" on public.services for insert with check (auth.uid() = business_id);
drop policy if exists "Users can update own services" on public.services;
create policy "Users can update own services" on public.services for update using (auth.uid() = business_id) with check (auth.uid() = business_id);
drop policy if exists "Users can delete own services" on public.services;
create policy "Users can delete own services" on public.services for delete using (auth.uid() = business_id);

grant select, insert, update, delete on public.service_categories to authenticated;
grant select, insert, update, delete on public.services to authenticated;

-- ============================================================================
-- 9a. Service Packages
-- ============================================================================
create table if not exists public.service_packages (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null,
    name text not null,
    description text not null default '',
    service_ids uuid[] not null default '{}',
    session_count integer not null default 1,
    price numeric not null default 0,
    active boolean not null default true,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    updated_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint service_packages_session_count_check check (session_count between 1 and 100),
    constraint service_packages_price_check check (price >= 0),
    constraint service_packages_name_check check (char_length(name) between 1 and 120)
);
create index if not exists idx_service_packages_business_id on public.service_packages (business_id);
alter table public.service_packages enable row level security;
drop policy if exists "Owners can view service packages" on public.service_packages;
create policy "Owners can view service packages" on public.service_packages for select using (auth.uid() = business_id);
drop policy if exists "Owners can insert service packages" on public.service_packages;
create policy "Owners can insert service packages" on public.service_packages for insert with check (auth.uid() = business_id);
drop policy if exists "Owners can update service packages" on public.service_packages;
create policy "Owners can update service packages" on public.service_packages for update using (auth.uid() = business_id) with check (auth.uid() = business_id);
drop policy if exists "Owners can delete service packages" on public.service_packages;
create policy "Owners can delete service packages" on public.service_packages for delete using (auth.uid() = business_id);
grant select, insert, update, delete on public.service_packages to authenticated;

-- ============================================================================
-- 9b. Advanced Scheduling Settings
-- ============================================================================
create table if not exists public.scheduling_settings (
    business_id uuid references auth.users(id) on delete cascade primary key,
    waitlist_enabled boolean not null default false,
    daily_capacity integer not null default 0,
    resources text[] not null default '{}',
    private_booking_enabled boolean not null default false,
    seasonal_availability_enabled boolean not null default false,
    updated_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint scheduling_settings_capacity_check check (daily_capacity between 0 and 500),
    constraint scheduling_settings_resources_check check (cardinality(resources) <= 50)
);
alter table public.scheduling_settings enable row level security;
drop policy if exists "Owners can view scheduling settings" on public.scheduling_settings;
create policy "Owners can view scheduling settings" on public.scheduling_settings for select using (auth.uid() = business_id);
drop policy if exists "Owners can insert scheduling settings" on public.scheduling_settings;
create policy "Owners can insert scheduling settings" on public.scheduling_settings for insert with check (auth.uid() = business_id);
drop policy if exists "Owners can update scheduling settings" on public.scheduling_settings;
create policy "Owners can update scheduling settings" on public.scheduling_settings for update using (auth.uid() = business_id) with check (auth.uid() = business_id);
grant select, insert, update on public.scheduling_settings to authenticated;

-- Public booking pages: only explicitly published profiles and booking-visible
-- services are readable without signing in. Private owner data remains protected.
drop policy if exists "Public can view published booking profiles" on public.business_profiles;
create policy "Public can view published booking profiles"
    on public.business_profiles for select to anon, authenticated
    using (slug is not null and length(trim(slug)) > 0);

drop policy if exists "Public can view booking services" on public.services;
create policy "Public can view booking services"
    on public.services for select to anon, authenticated
    using (
        show_on_booking_page = true
        and exists (
            select 1 from public.business_profiles profile
            where profile.id = services.business_id
              and profile.slug is not null
              and length(trim(profile.slug)) > 0
        )
    );

grant select on public.business_profiles to anon;
drop policy if exists "Public can view booking service categories" on public.service_categories;
create policy "Public can view booking service categories"
    on public.service_categories for select to anon, authenticated
    using (
        exists (
            select 1 from public.business_profiles profile
            where profile.id = service_categories.business_id
              and profile.slug is not null
              and length(trim(profile.slug)) > 0
        )
    );

grant select on public.service_categories to anon;
grant select on public.services to anon;

create or replace function public.get_public_booking_services(p_slug text, p_direct_service_id uuid default null)
returns table (id uuid, name text, description text, duration_minutes integer, price text, category_id uuid, image_url text, show_on_booking_page boolean, deposit_type text, deposit_amount numeric, service_hours jsonb)
language sql security definer set search_path = public
as $$
    select services.id, services.name, services.description, services.duration_minutes, services.price, services.category_id, services.image_url, services.show_on_booking_page, services.deposit_type, services.deposit_amount, services.service_hours
    from public.services join public.business_profiles profile on profile.id = services.business_id
    where profile.slug = trim(p_slug) and (services.show_on_booking_page = true or services.id = p_direct_service_id)
    order by services.created_at;
$$;
revoke all on function public.get_public_booking_services(text, uuid) from public;
grant execute on function public.get_public_booking_services(text, uuid) to anon, authenticated;

insert into storage.buckets (id, name, public)
values ('service-assets', 'service-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "Users can upload own service assets" on storage.objects;
create policy "Users can upload own service assets" on storage.objects for insert to authenticated
    with check (bucket_id = 'service-assets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users can update own service assets" on storage.objects;
create policy "Users can update own service assets" on storage.objects for update to authenticated
    using (bucket_id = 'service-assets' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'service-assets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Anyone can view service assets" on storage.objects;
create policy "Anyone can view service assets" on storage.objects for select to public
    using (bucket_id = 'service-assets');

-- ============================================================================
-- Staff, roles, availability, and service assignments
-- ============================================================================
create table if not exists public.staff_members (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null,
    full_name text not null,
    email text not null default '',
    phone text not null default '',
    bio text not null default '',
    role text not null default 'staff' check (role in ('owner', 'manager', 'staff', 'limited')),
    status text not null default 'invited' check (status in ('active', 'invited', 'paused')),
    user_id uuid references auth.users(id) on delete set null,
    working_hours jsonb not null default '{}'::jsonb,
    time_off jsonb not null default '[]'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.staff_members add column if not exists user_id uuid references auth.users(id) on delete set null;

create table if not exists public.staff_service_assignments (
    staff_id uuid references public.staff_members(id) on delete cascade not null,
    service_id uuid references public.services(id) on delete cascade not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    primary key (staff_id, service_id)
);

create index if not exists idx_staff_members_business_id on public.staff_members (business_id);
create unique index if not exists idx_staff_members_user_id on public.staff_members (user_id) where user_id is not null;
create index if not exists idx_staff_assignments_service_id on public.staff_service_assignments (service_id);

alter table public.staff_members enable row level security;
alter table public.staff_service_assignments enable row level security;

drop policy if exists "Business owners can view staff" on public.staff_members;
create policy "Business owners can view staff" on public.staff_members for select to authenticated using (auth.uid() = business_id);
drop policy if exists "Business owners can insert staff" on public.staff_members;
create policy "Business owners can insert staff" on public.staff_members for insert to authenticated with check (auth.uid() = business_id);
drop policy if exists "Business owners can update staff" on public.staff_members;
create policy "Business owners can update staff" on public.staff_members for update to authenticated using (auth.uid() = business_id) with check (auth.uid() = business_id);
drop policy if exists "Business owners can delete staff" on public.staff_members;
create policy "Business owners can delete staff" on public.staff_members for delete to authenticated using (auth.uid() = business_id);
drop policy if exists "Staff can view own membership" on public.staff_members;
create policy "Staff can view own membership" on public.staff_members for select to authenticated using (auth.uid() = user_id and status = 'active');

drop policy if exists "Business owners can view staff assignments" on public.staff_service_assignments;
create policy "Business owners can view staff assignments" on public.staff_service_assignments for select to authenticated using (exists (select 1 from public.staff_members staff where staff.id = staff_id and (staff.business_id = auth.uid() or (staff.user_id = auth.uid() and staff.status = 'active'))));
drop policy if exists "Business owners can insert staff assignments" on public.staff_service_assignments;
create policy "Business owners can insert staff assignments" on public.staff_service_assignments for insert to authenticated with check (exists (select 1 from public.staff_members staff where staff.id = staff_id and staff.business_id = auth.uid()) and exists (select 1 from public.services service where service.id = service_id and service.business_id = auth.uid()));
drop policy if exists "Business owners can delete staff assignments" on public.staff_service_assignments;
create policy "Business owners can delete staff assignments" on public.staff_service_assignments for delete to authenticated using (exists (select 1 from public.staff_members staff where staff.id = staff_id and staff.business_id = auth.uid()));

grant select, insert, update, delete on public.staff_members to authenticated;
grant select, insert, delete on public.staff_service_assignments to authenticated;

create or replace function public.claim_staff_membership()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare claimed_id uuid;
begin
    if auth.role() <> 'authenticated' or coalesce(auth.jwt() ->> 'email', '') = '' then raise exception 'Authentication is required to claim staff access.' using errcode = '42501'; end if;
    update public.staff_members set user_id = auth.uid(), status = 'active', updated_at = timezone('utc'::text, now())
    where id = (select id from public.staff_members where user_id is null and status in ('invited', 'active') and lower(trim(email)) = lower(trim(auth.jwt() ->> 'email')) order by created_at asc limit 1)
    returning id into claimed_id;
    return claimed_id;
end;
$$;
revoke all on function public.claim_staff_membership() from public;
grant execute on function public.claim_staff_membership() to authenticated;

-- ============================================================================
-- Customer Appointments Table & Policies
-- ============================================================================
create table if not exists public.appointments (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null,
    customer_name text not null,
    customer_email text not null,
    customer_phone text not null,
    customer_address text default '',
    customer_note text default '',
    service_names text not null,
    total_price text not null default '₱0',
    final_total_amount numeric(12,2),
    final_amount_note text not null default '',
    final_amount_sent_at timestamp with time zone,
    appointment_date text not null,
    appointment_time text not null,
    duration_minutes integer,
    buffer_minutes integer default 0,
    staff_member_id uuid references public.staff_members(id) on delete set null,
    location_name text not null default '',
    recurrence_rule text not null default 'none',
    recurrence_group_id uuid,
    no_show_reason text not null default '',
    status text not null default 'pending',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check check (status in ('pending', 'approved', 'completed', 'cancelled', 'no_show')) not valid;
alter table public.appointments add column if not exists no_show_reason text not null default '';
alter table public.appointments add constraint appointments_no_show_reason_check check (char_length(no_show_reason) <= 500) not valid;
alter table public.appointments drop constraint if exists appointments_duration_positive_check;
alter table public.appointments add constraint appointments_duration_positive_check check (duration_minutes is null or duration_minutes > 0) not valid;
alter table public.appointments drop constraint if exists appointments_date_time_required_check;
alter table public.appointments add constraint appointments_date_time_required_check check (length(trim(appointment_date)) > 0 and length(trim(appointment_time)) > 0) not valid;

create index if not exists idx_appointments_business_id on public.appointments (business_id);
alter table public.appointments add column if not exists duration_minutes integer;
alter table public.appointments add column if not exists buffer_minutes integer default 0;
alter table public.appointments add column if not exists peg_image_path text;
alter table public.appointments add column if not exists payment_receipt_path text;
alter table public.appointments add column if not exists final_total_amount numeric(12,2);
alter table public.appointments add column if not exists final_amount_note text not null default '';
alter table public.appointments add column if not exists final_amount_sent_at timestamp with time zone;
alter table public.appointments drop constraint if exists appointments_final_total_amount_check;
alter table public.appointments add constraint appointments_final_total_amount_check check (final_total_amount is null or final_total_amount >= 0) not valid;
alter table public.appointments add column if not exists staff_member_id uuid references public.staff_members(id) on delete set null;
alter table public.appointments add column if not exists location_name text not null default '';
alter table public.appointments add column if not exists meeting_url text not null default '';
alter table public.appointments drop constraint if exists appointments_meeting_url_check;
alter table public.appointments add constraint appointments_meeting_url_check check (meeting_url = '' or (char_length(meeting_url) <= 2048 and meeting_url ~* '^https://')) not valid;
alter table public.appointments add column if not exists recurrence_rule text not null default 'none';
alter table public.appointments add column if not exists recurrence_group_id uuid;
alter table public.appointments drop constraint if exists appointments_recurrence_rule_check;
alter table public.appointments add constraint appointments_recurrence_rule_check check (recurrence_rule in ('none', 'weekly', 'biweekly')) not valid;
create index if not exists idx_appointments_staff_member_id on public.appointments (staff_member_id);
create index if not exists idx_appointments_recurrence_group_id on public.appointments (recurrence_group_id);
alter table public.appointments alter column status set default 'pending';

-- Private customer-uploaded booking attachments. Guests may upload into the
-- published business folder; only the owning business can read or delete them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('booking-attachments', 'booking-attachments', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Public can upload booking attachments" on storage.objects;
create policy "Public can upload booking attachments" on storage.objects for insert to anon, authenticated
    with check (
        bucket_id = 'booking-attachments'
        and exists (
            select 1 from public.business_profiles profile
            where profile.id::text = (storage.foldername(name))[1]
              and profile.slug is not null
              and length(trim(profile.slug)) > 0
        )
    );

drop policy if exists "Business owners can view booking attachments" on storage.objects;
create policy "Business owners can view booking attachments" on storage.objects for select to authenticated
    using (
        bucket_id = 'booking-attachments'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Business owners can delete booking attachments" on storage.objects;
create policy "Business owners can delete booking attachments" on storage.objects for delete to authenticated
    using (
        bucket_id = 'booking-attachments'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Customers can view own booking attachments" on storage.objects;
create policy "Customers can view own booking attachments"
on storage.objects for select to authenticated
using (
    bucket_id = 'booking-attachments'
    and exists (
        select 1
        from public.appointments appointment
        where (appointment.peg_image_path = name or appointment.payment_receipt_path = name)
          and lower(trim(appointment.customer_email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
);

alter table public.appointments enable row level security;

drop policy if exists "Business owners can view own appointments" on public.appointments;
create policy "Business owners can view own appointments"
    on public.appointments for select
    using (auth.uid() = business_id);

drop policy if exists "Business owners can update own appointments" on public.appointments;
create policy "Business owners can update own appointments"
    on public.appointments for update
    using (auth.uid() = business_id)
    with check (auth.uid() = business_id);

drop policy if exists "Public can insert appointments" on public.appointments;
create policy "Public can insert appointments"
    on public.appointments for insert to anon, authenticated
    with check (
        business_id is not null
        and exists (
            select 1 from public.business_profiles profile
            where profile.id = business_id
              and profile.slug is not null
              and length(trim(profile.slug)) > 0
        )
    );

grant select, update, delete on public.appointments to authenticated;
grant insert on public.appointments to anon, authenticated;

create or replace function public.prevent_appointment_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    incoming_start timestamp;
    incoming_end timestamp;
    existing_start timestamp;
    existing_end timestamp;
begin
    if lower(coalesce(new.status, 'approved')) in ('cancelled', 'canceled', 'declined', 'rejected') then return new; end if;

    -- Serialize appointment writes for this business so concurrent requests
    -- cannot both pass the overlap scan before either transaction commits.
    perform pg_advisory_xact_lock(
        hashtextextended(coalesce(new.business_id::text, ''), 0)
    );

    begin
        incoming_start := to_timestamp(new.appointment_date || ' ' || new.appointment_time, 'YYYY-MM-DD HH12:MI AM')::timestamp;
    exception when others then
        raise exception 'Appointment date and time must be valid.' using errcode = '22007';
    end;
    incoming_end := incoming_start + make_interval(mins => greatest(coalesce(new.duration_minutes, 60) + coalesce(new.buffer_minutes, 0), 1));
    for existing_start, existing_end in
        select to_timestamp(a.appointment_date || ' ' || a.appointment_time, 'YYYY-MM-DD HH12:MI AM')::timestamp,
               to_timestamp(a.appointment_date || ' ' || a.appointment_time, 'YYYY-MM-DD HH12:MI AM')::timestamp
                 + make_interval(mins => greatest(coalesce(a.duration_minutes, 60) + coalesce(a.buffer_minutes, 0), 1))
        from public.appointments a
        where a.business_id = new.business_id
          and a.appointment_date = new.appointment_date
          and a.id is distinct from new.id
          and lower(coalesce(a.status, 'approved')) not in ('cancelled', 'canceled', 'declined', 'rejected')
    loop
        if incoming_start < existing_end and incoming_end > existing_start then
            raise exception 'This appointment overlaps an existing booking.' using errcode = '23P01';
        end if;
    end loop;
    return new;
end;
$$;

drop trigger if exists appointments_prevent_overlap on public.appointments;
create trigger appointments_prevent_overlap
    before insert or update of business_id, appointment_date, appointment_time, duration_minutes, buffer_minutes, status
    on public.appointments for each row execute function public.prevent_appointment_overlap();

create or replace function public.queue_appointment_notification_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    next_event text;
    owner_email text;
    staff_enabled boolean;
begin
    if tg_op = 'INSERT' then
        select coalesce(ns.staff_confirmation_enabled, true)
            into staff_enabled
            from public.notification_settings ns
            where ns.business_id = new.business_id;
        if coalesce(staff_enabled, true) then
            select u.email into owner_email from auth.users u where u.id = new.business_id;
            if coalesce(owner_email, '') <> '' then
                insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message)
                values (new.business_id, new.id, 'staff_notification', 'email', owner_email, 'scheduled', 'Queued by new appointment');
            end if;
        end if;
        return new;
    end if;
    if lower(coalesce(new.status, '')) = 'cancelled'
       and lower(coalesce(old.status, '')) <> 'cancelled' then
        next_event := 'cancellation';
    elsif lower(coalesce(new.status, '')) = 'no_show'
       and lower(coalesce(old.status, '')) <> 'no_show' then
        next_event := 'no_show';
    elsif (new.appointment_date is distinct from old.appointment_date
       or new.appointment_time is distinct from old.appointment_time)
       and lower(coalesce(new.status, '')) <> 'cancelled' then
        next_event := 'reschedule';
    else
        return new;
    end if;
    insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message)
    values (new.business_id, new.id, next_event, 'email', coalesce(new.customer_email, ''), 'scheduled', 'Queued by appointment state change');
    return new;
end;
$$;
drop trigger if exists appointments_queue_notification_event on public.appointments;
create trigger appointments_queue_notification_event after update of status, appointment_date, appointment_time on public.appointments for each row execute function public.queue_appointment_notification_event();
drop trigger if exists appointments_queue_staff_notification on public.appointments;
create trigger appointments_queue_staff_notification after insert on public.appointments for each row execute function public.queue_appointment_notification_event();

-- Final API rate-limit definition.
create table if not exists public.api_rate_limits (token_id uuid references public.api_tokens(id) on delete cascade primary key, window_started_at timestamp with time zone not null default timezone('utc'::text, now()), request_count integer not null default 0 check (request_count >= 0), updated_at timestamp with time zone not null default timezone('utc'::text, now()));
alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from anon, authenticated;
create or replace function public.consume_api_rate_limit(p_token_id uuid, p_limit integer default 120) returns boolean language plpgsql security definer set search_path = public as $$ declare current_count integer; begin if p_limit < 1 then raise exception 'Rate limit must be positive.' using errcode = '22023'; end if; insert into public.api_rate_limits (token_id, window_started_at, request_count, updated_at) values (p_token_id, timezone('utc'::text, now()), 1, timezone('utc'::text, now())) on conflict (token_id) do update set window_started_at = case when timezone('utc'::text, now()) - api_rate_limits.window_started_at >= interval '1 minute' then timezone('utc'::text, now()) else api_rate_limits.window_started_at end, request_count = case when timezone('utc'::text, now()) - api_rate_limits.window_started_at >= interval '1 minute' then 1 else api_rate_limits.request_count + 1 end, updated_at = timezone('utc'::text, now()) returning request_count into current_count; return coalesce(current_count, 0) <= p_limit; end; $$;
revoke all on function public.consume_api_rate_limit(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(uuid, integer) to service_role;

-- Final no-show follow-up notification definition.
alter table public.notification_settings add column if not exists no_show_followup_enabled boolean not null default false;
alter table public.notification_settings add column if not exists no_show_followup_delay_hours integer not null default 24;
alter table public.notification_settings drop constraint if exists notification_settings_no_show_followup_delay_check;
alter table public.notification_settings add constraint notification_settings_no_show_followup_delay_check check (no_show_followup_delay_hours in (2, 24, 48, 72));
alter table public.notification_events drop constraint if exists notification_events_type_check;
alter table public.notification_events add constraint notification_events_type_check check (event_type in ('booking_confirmation', 'reminder', 'staff_notification', 'cancellation', 'reschedule', 'payment', 'no_show', 'no_show_followup'));
create or replace function public.queue_appointment_notification_event() returns trigger language plpgsql security definer set search_path = public as $$ declare next_event text; owner_email text; staff_email text; staff_enabled boolean; sms_enabled boolean; followup_enabled boolean; followup_delay integer; begin select coalesce(ns.staff_confirmation_enabled, true), coalesce(ns.sms_enabled, false), coalesce(ns.no_show_followup_enabled, false), coalesce(ns.no_show_followup_delay_hours, 24) into staff_enabled, sms_enabled, followup_enabled, followup_delay from public.notification_settings ns where ns.business_id = new.business_id; if tg_op = 'INSERT' then if coalesce(staff_enabled, true) then select u.email into owner_email from auth.users u where u.id = new.business_id; if coalesce(owner_email, '') <> '' then insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message) values (new.business_id, new.id, 'staff_notification', 'email', owner_email, 'scheduled', 'Queued by new appointment'); end if; select sm.email into staff_email from public.staff_members sm where sm.id = new.staff_member_id and sm.business_id = new.business_id and sm.status = 'active' and coalesce(sm.email, '') <> ''; if coalesce(staff_email, '') <> '' and lower(staff_email) <> lower(coalesce(owner_email, '')) then insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message) values (new.business_id, new.id, 'staff_notification', 'email', staff_email, 'scheduled', 'Queued for assigned staff member'); end if; end if; if coalesce(sms_enabled, false) and coalesce(new.customer_phone, '') <> '' then insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message) values (new.business_id, new.id, 'booking_confirmation', 'sms', new.customer_phone, 'scheduled', 'Queued SMS confirmation'); end if; return new; end if; if lower(coalesce(new.status, '')) = 'cancelled' and lower(coalesce(old.status, '')) <> 'cancelled' then next_event := 'cancellation'; elsif lower(coalesce(new.status, '')) = 'no_show' and lower(coalesce(old.status, '')) <> 'no_show' then next_event := 'no_show'; elsif (new.appointment_date is distinct from old.appointment_date or new.appointment_time is distinct from old.appointment_time) and lower(coalesce(new.status, '')) <> 'cancelled' then next_event := 'reschedule'; else return new; end if; insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message) values (new.business_id, new.id, next_event, 'email', coalesce(new.customer_email, ''), 'scheduled', 'Queued by appointment state change'); if coalesce(sms_enabled, false) and coalesce(new.customer_phone, '') <> '' then insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message) values (new.business_id, new.id, next_event, 'sms', new.customer_phone, 'scheduled', 'Queued SMS appointment state change'); end if; if next_event = 'no_show' and coalesce(followup_enabled, false) and coalesce(new.customer_email, '') <> '' then insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message, scheduled_for) values (new.business_id, new.id, 'no_show_followup', 'email', new.customer_email, 'scheduled', 'Queued delayed no-show follow-up', timezone('utc'::text, now()) + make_interval(hours => followup_delay)); if coalesce(sms_enabled, false) and coalesce(new.customer_phone, '') <> '' then insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message, scheduled_for) values (new.business_id, new.id, 'no_show_followup', 'sms', new.customer_phone, 'scheduled', 'Queued delayed SMS no-show follow-up', timezone('utc'::text, now()) + make_interval(hours => followup_delay)); end if; end if; return new; end; $$;
drop trigger if exists appointments_queue_notification_event on public.appointments;
create trigger appointments_queue_notification_event after update of status, appointment_date, appointment_time on public.appointments for each row execute function public.queue_appointment_notification_event();
drop trigger if exists appointments_queue_staff_notification on public.appointments;
create trigger appointments_queue_staff_notification after insert on public.appointments for each row execute function public.queue_appointment_notification_event();
revoke all on function public.queue_appointment_notification_event() from public;

create or replace function public.queue_appointment_reminder_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare email_channel_enabled boolean; reminder_channel_enabled boolean; lead_hours integer; appointment_start timestamp;
begin
    select coalesce(ns.email_enabled, true), coalesce(ns.reminder_enabled, true), greatest(0, coalesce(ns.reminder_lead_hours, 24)) into email_channel_enabled, reminder_channel_enabled, lead_hours from public.notification_settings ns where ns.business_id = new.business_id;
    if coalesce(email_channel_enabled, true) = false or coalesce(reminder_channel_enabled, true) = false or coalesce(new.customer_email, '') = '' or lower(coalesce(new.status, '')) in ('cancelled', 'no_show', 'completed') then return new; end if;
    appointment_start := to_timestamp(new.appointment_date || ' ' || new.appointment_time, 'YYYY-MM-DD HH12:MI AM')::timestamp;
    delete from public.notification_events where appointment_id = new.id and event_type = 'reminder' and status = 'scheduled';
    insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message, scheduled_for) values (new.business_id, new.id, 'reminder', 'email', new.customer_email, 'scheduled', 'Queued using owner reminder lead time', appointment_start - make_interval(hours => lead_hours));
    return new;
end;
$$;
drop trigger if exists appointments_queue_reminder_event on public.appointments;
create trigger appointments_queue_reminder_event after insert or update of appointment_date, appointment_time, status on public.appointments for each row execute function public.queue_appointment_reminder_event();
revoke all on function public.queue_appointment_reminder_event() from public;

revoke all on function public.prevent_appointment_overlap() from public;

-- Owner-managed unavailable periods and personal events.
create table if not exists public.block_time_events (id uuid default gen_random_uuid() primary key, business_id uuid references auth.users(id) on delete cascade not null, title text not null, event_date date not null, start_time text not null, duration_minutes integer not null default 60, personal_event boolean not null default false, notes text not null default '', created_at timestamp with time zone default timezone('utc'::text, now()) not null, updated_at timestamp with time zone default timezone('utc'::text, now()) not null, constraint block_time_duration_check check (duration_minutes between 5 and 1440));
create index if not exists idx_block_time_events_business_date on public.block_time_events (business_id, event_date, start_time);
alter table public.block_time_events enable row level security;
drop policy if exists "Owners can view block time" on public.block_time_events;
create policy "Owners can view block time" on public.block_time_events for select to authenticated using (auth.uid() = business_id);
drop policy if exists "Owners can manage block time" on public.block_time_events;
create policy "Owners can manage block time" on public.block_time_events for all to authenticated using (auth.uid() = business_id) with check (auth.uid() = business_id);
grant select, insert, update, delete on public.block_time_events to authenticated;

-- Return only occupied time ranges for public booking availability checks.
-- Customer details remain protected by the appointments RLS policies above.
create or replace function public.get_public_booked_times(
    p_business_id uuid,
    p_appointment_date text
)
returns table (
    appointment_time text,
    duration_minutes integer,
    buffer_minutes integer
)
language sql
security definer
set search_path = public
stable
as $$
    select
        a.appointment_time,
        a.duration_minutes,
        coalesce(a.buffer_minutes, 0)
    from public.appointments a
    where a.business_id = p_business_id
      and a.appointment_date = p_appointment_date
      and lower(coalesce(a.status, 'pending')) not in ('cancelled', 'canceled', 'declined', 'rejected')
    union all
    select
        b.start_time,
        b.duration_minutes,
        0
    from public.block_time_events b
    where b.business_id = p_business_id
      and b.event_date::text = p_appointment_date
$$;

-- Allow signed-in customers to retrieve their own appointments across devices.
create or replace function public.get_customer_appointments(p_email text)
returns setof public.appointments
language sql
stable
security definer
set search_path = public
as $$
  select appointments.*
  from public.appointments
  where auth.role() = 'authenticated'
    and lower(trim(appointments.customer_email)) = lower(trim(p_email))
    and lower(trim(appointments.customer_email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  order by appointments.created_at desc;
$$;

revoke all on function public.get_customer_appointments(text) from public;
grant execute on function public.get_customer_appointments(text) to authenticated;

-- Allow signed-in customers to cancel their own appointments.
create or replace function public.cancel_customer_appointment(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    target public.appointments%rowtype;
    notice_hours integer;
    appointment_start timestamp;
begin
    if auth.role() <> 'authenticated' then
        raise exception 'Authentication is required to cancel an appointment.' using errcode = '42501';
    end if;
    select * into target from public.appointments where id = p_appointment_id and lower(trim(customer_email)) = lower(trim(coalesce(auth.jwt() ->> 'email', ''))) for update;
    if not found then raise exception 'Appointment not found or access denied.' using errcode = '42501'; end if;
    if lower(coalesce(target.status, '')) in ('cancelled', 'completed', 'no_show') then raise exception 'This appointment cannot be cancelled.' using errcode = '22023'; end if;
    select greatest(0, coalesce(booking_cancellation_notice_hours, 24)) into notice_hours from public.business_profiles where id = target.business_id;
    appointment_start := to_timestamp(target.appointment_date || ' ' || target.appointment_time, 'YYYY-MM-DD HH12:MI AM')::timestamp;
    if coalesce(notice_hours, 24) > 0 and appointment_start < (now() at time zone 'UTC') + make_interval(hours => coalesce(notice_hours, 24)) then raise exception 'This appointment is inside the cancellation notice window.' using errcode = '22023'; end if;
    update public.appointments set status = 'cancelled' where id = target.id;
end;
$$;

revoke all on function public.cancel_customer_appointment(uuid) from public;
grant execute on function public.cancel_customer_appointment(uuid) to authenticated;

-- ============================================================================
-- Owner Client CRM
-- ============================================================================
create table if not exists public.clients (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null,
    full_name text not null,
    email text not null default '',
    phone text not null default '',
    notes text not null default '',
    tags text[] not null default '{}',
    blocked boolean not null default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.clients add column if not exists blocked boolean not null default false;
create index if not exists idx_clients_business_blocked on public.clients (business_id, blocked);
create unique index if not exists idx_clients_business_email on public.clients (business_id, lower(email)) where length(trim(email)) > 0;
create index if not exists idx_clients_business_id on public.clients (business_id);
alter table public.clients add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.clients add column if not exists business_slug text default '';
alter table public.clients add column if not exists notes text not null default '';
alter table public.clients add column if not exists tags text[] not null default '{}';
alter table public.clients alter column user_id drop not null;
alter table public.clients alter column business_slug set default '';
alter table public.clients enable row level security;
drop policy if exists "Business owners can view clients" on public.clients;
create policy "Business owners can view clients" on public.clients for select to authenticated using (auth.uid() = business_id);
drop policy if exists "Business owners can insert clients" on public.clients;
create policy "Business owners can insert clients" on public.clients for insert to authenticated with check (auth.uid() = business_id);
drop policy if exists "Business owners can update clients" on public.clients;
create policy "Business owners can update clients" on public.clients for update to authenticated using (auth.uid() = business_id) with check (auth.uid() = business_id);
drop policy if exists "Business owners can delete clients" on public.clients;
create policy "Business owners can delete clients" on public.clients for delete to authenticated using (auth.uid() = business_id);
grant select, insert, update, delete on public.clients to authenticated;

-- ============================================================================
-- Owner Payment Ledger
-- ============================================================================
create table if not exists public.payment_transactions (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null,
    appointment_id uuid references public.appointments(id) on delete set null,
    client_name text not null default '',
    client_email text not null default '',
    amount numeric(12,2) not null check (amount >= 0),
    currency text not null default 'PHP',
    transaction_type text not null default 'payment' check (transaction_type in ('deposit', 'payment', 'refund', 'adjustment')),
    method text not null default 'cash' check (method in ('cash', 'card', 'bank_transfer', 'e_wallet', 'other')),
    status text not null default 'paid' check (status in ('pending', 'paid', 'failed', 'refunded')),
    note text not null default '',
    provider text not null default '',
    provider_reference text not null default '',
    retry_count integer not null default 0,
    last_retry_at timestamp with time zone,
    failure_reason text not null default '',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.payment_transactions add column if not exists provider text not null default '';
alter table public.payment_transactions add column if not exists provider_reference text not null default '';
create unique index if not exists idx_payment_provider_reference on public.payment_transactions (business_id, provider, provider_reference) where length(trim(provider_reference)) > 0;
alter table public.payment_transactions add column if not exists retry_count integer not null default 0;
alter table public.payment_transactions add column if not exists last_retry_at timestamp with time zone;
alter table public.payment_transactions add column if not exists failure_reason text not null default '';
alter table public.payment_transactions drop constraint if exists payment_transactions_retry_count_check;
alter table public.payment_transactions add constraint payment_transactions_retry_count_check check (retry_count between 0 and 20);
create or replace function public.retry_payment_transaction(p_payment_id uuid)
returns public.payment_transactions
language plpgsql security invoker set search_path = public
as $$
declare result_row public.payment_transactions;
begin
    update public.payment_transactions set status = 'pending', retry_count = retry_count + 1, last_retry_at = timezone('utc'::text, now()), failure_reason = '', updated_at = timezone('utc'::text, now()) where id = p_payment_id and business_id = auth.uid() and status = 'failed' and retry_count < 20 returning * into result_row;
    if result_row.id is null then raise exception 'Payment is not eligible for retry.' using errcode = '42501'; end if;
    return result_row;
end;
$$;
revoke all on function public.retry_payment_transaction(uuid) from public;
grant execute on function public.retry_payment_transaction(uuid) to authenticated;
create index if not exists idx_payment_transactions_business_id on public.payment_transactions (business_id, created_at desc);
create index if not exists idx_payment_transactions_appointment_id on public.payment_transactions (appointment_id);
alter table public.payment_transactions enable row level security;
drop policy if exists "Business owners can view payment transactions" on public.payment_transactions;
create policy "Business owners can view payment transactions" on public.payment_transactions for select to authenticated using (auth.uid() = business_id);
drop policy if exists "Business owners can insert payment transactions" on public.payment_transactions;
create policy "Business owners can insert payment transactions" on public.payment_transactions for insert to authenticated with check (auth.uid() = business_id);
drop policy if exists "Business owners can update payment transactions" on public.payment_transactions;
create policy "Business owners can update payment transactions" on public.payment_transactions for update to authenticated using (auth.uid() = business_id) with check (auth.uid() = business_id);
drop policy if exists "Business owners can delete payment transactions" on public.payment_transactions;
create policy "Business owners can delete payment transactions" on public.payment_transactions for delete to authenticated using (auth.uid() = business_id);
grant select, insert, update, delete on public.payment_transactions to authenticated;

create or replace function public.validate_payment_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare collected numeric;
begin
    if new.transaction_type = 'refund' and new.appointment_id is not null and new.status <> 'failed' then
        select coalesce(sum(case when transaction_type = 'refund' then -amount else amount end), 0) into collected
        from public.payment_transactions
        where business_id = new.business_id and appointment_id = new.appointment_id and status = 'paid' and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
        if new.amount > greatest(0, collected) then raise exception 'Refund exceeds the collected amount for this appointment.' using errcode = '22023'; end if;
    end if;
    return new;
end;
$$;
drop trigger if exists payment_transactions_validate_refund on public.payment_transactions;
create trigger payment_transactions_validate_refund before insert or update of amount, appointment_id, transaction_type, status on public.payment_transactions for each row execute function public.validate_payment_transaction();
revoke all on function public.validate_payment_transaction() from public;

create or replace function public.queue_payment_notification_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
        insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message)
        values (new.business_id, new.appointment_id, 'payment', 'email', coalesce(new.client_email, ''), 'scheduled', 'Queued after payment was marked paid');
    end if;
    return new;
end;
$$;
drop trigger if exists payment_transactions_queue_notification on public.payment_transactions;
create trigger payment_transactions_queue_notification after insert or update of status on public.payment_transactions for each row execute function public.queue_payment_notification_event();
revoke all on function public.queue_payment_notification_event() from public;

create or replace function public.sync_client_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if length(trim(coalesce(new.customer_email, ''))) = 0 then return new; end if;
    update public.clients
       set full_name = coalesce(nullif(trim(new.customer_name), ''), full_name),
           phone = coalesce(nullif(trim(new.customer_phone), ''), phone),
           updated_at = timezone('utc'::text, now())
     where business_id = new.business_id
       and lower(trim(email)) = lower(trim(new.customer_email));
    if not found then
        insert into public.clients (business_id, full_name, email, phone)
        values (new.business_id, coalesce(nullif(trim(new.customer_name), ''), 'Client'), lower(trim(new.customer_email)), coalesce(new.customer_phone, ''));
    end if;
    return new;
end;
$$;
drop trigger if exists appointments_sync_client on public.appointments;
create trigger appointments_sync_client after insert or update of customer_name, customer_email, customer_phone on public.appointments for each row execute function public.sync_client_from_appointment();
revoke all on function public.sync_client_from_appointment() from public;

create or replace function public.reject_blocked_customer_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if exists (select 1 from public.clients where business_id = new.business_id and blocked = true and length(trim(coalesce(email, ''))) > 0 and lower(trim(email)) = lower(trim(coalesce(new.customer_email, '')))) then
        raise exception 'This customer is not eligible to book online.' using errcode = '42501';
    end if;
    return new;
end;
$$;
drop trigger if exists appointments_reject_blocked_customer on public.appointments;
create trigger appointments_reject_blocked_customer before insert on public.appointments for each row execute function public.reject_blocked_customer_booking();
revoke all on function public.reject_blocked_customer_booking() from public;

grant execute on function public.get_public_booked_times(uuid, text) to anon, authenticated;

-- ============================================================================
-- Business Profiles - Owner Name column
-- ============================================================================
alter table public.business_profiles
    add column if not exists owner_name text default '';

-- ============================================================================
-- Customer Reviews Table & Policies
-- ============================================================================
create table if not exists public.business_reviews (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null,
    customer_name text not null,
    customer_email text not null,
    rating integer not null check (rating >= 1 and rating <= 5),
    comment text not null,
    service_name text default '',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_business_reviews_business_id on public.business_reviews (business_id);

alter table public.business_reviews enable row level security;

-- Public can view reviews for published businesses
drop policy if exists "Public can view business reviews" on public.business_reviews;
create policy "Public can view business reviews"
    on public.business_reviews for select to anon, authenticated
    using (
        exists (
            select 1 from public.business_profiles profile
            where profile.id = business_reviews.business_id
              and profile.slug is not null
              and length(trim(profile.slug)) > 0
        )
    );

-- Public (guests and signed in users) can post reviews
drop policy if exists "Public can insert business reviews" on public.business_reviews;
create policy "Public can insert business reviews"
    on public.business_reviews for insert to anon, authenticated
    with check (
        exists (
            select 1 from public.business_profiles profile
            where profile.id = business_reviews.business_id
              and profile.slug is not null
              and length(trim(profile.slug)) > 0
        )
    );

-- Business owners can manage reviews
grant select, update, delete on public.business_reviews to authenticated;
grant select, insert on public.business_reviews to anon, authenticated;

-- ============================================================================
-- Registered Business Clients Table & Policies
-- Stores client accounts directly in Supabase per business slug
-- ============================================================================
create table if not exists public.clients (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade,
    business_id uuid references auth.users(id) on delete cascade not null,
    business_slug text not null default '',
    full_name text not null,
    email text not null,
    phone text default '',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique (user_id, business_id)
);

alter table public.clients add column if not exists notes text not null default '';
alter table public.clients add column if not exists tags text[] not null default '{}';
alter table public.clients alter column user_id drop not null;

create index if not exists idx_clients_business_id on public.clients (business_id);
create index if not exists idx_clients_user_id on public.clients (user_id);
create index if not exists idx_clients_email on public.clients (email);

alter table public.clients enable row level security;

-- Authenticated clients and business owners can view client records
drop policy if exists "Users and salon owners can view client records" on public.clients;
create policy "Users and salon owners can view client records"
    on public.clients for select to authenticated
    using (auth.uid() = user_id or auth.uid() = business_id);

-- Clients can register / insert their client record
drop policy if exists "Clients can insert own client profile" on public.clients;
create policy "Clients can insert own client profile"
    on public.clients for insert to authenticated
    with check (auth.uid() = user_id);

-- Clients can update their own client record
drop policy if exists "Clients can update own client profile" on public.clients;
create policy "Clients can update own client profile"
    on public.clients for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- Business owners can manage clients for their salon
drop policy if exists "Business owners can manage their clients" on public.clients;
create policy "Business owners can manage their clients"
    on public.clients for all to authenticated
    using (auth.uid() = business_id);

grant select, insert, update on public.clients to authenticated;

-- Defense-in-depth: anonymous booking visitors can submit appointments, but
-- cannot read owner-only CRM, payment, staff, notification, report, or
-- integration data.
revoke all on table public.clients from anon;
revoke all on table public.payment_transactions from anon;
revoke all on table public.notification_events from anon;
revoke all on table public.notification_settings from anon;
revoke all on table public.staff_members from anon;
revoke all on table public.staff_service_assignments from anon;
revoke all on table public.report_schedules from anon;
revoke all on table public.integration_connections from anon;
revoke select, update, delete on table public.appointments from anon;

-- Membership plans and loyalty balances.
create table if not exists public.membership_plans (id uuid default gen_random_uuid() primary key, business_id uuid references auth.users(id) on delete cascade not null, name text not null, description text not null default '', monthly_price numeric(12,2) not null default 0, points_per_visit integer not null default 1, active boolean not null default true, created_at timestamp with time zone default timezone('utc'::text, now()) not null, updated_at timestamp with time zone default timezone('utc'::text, now()) not null, constraint membership_plans_price_check check (monthly_price >= 0), constraint membership_plans_points_check check (points_per_visit between 0 and 1000));
create table if not exists public.client_memberships (id uuid default gen_random_uuid() primary key, business_id uuid references auth.users(id) on delete cascade not null, client_id uuid references public.clients(id) on delete cascade not null, plan_id uuid references public.membership_plans(id) on delete set null, status text not null default 'active' check (status in ('active', 'paused', 'cancelled')), points_balance integer not null default 0 check (points_balance >= 0), started_at timestamp with time zone default timezone('utc'::text, now()) not null, expires_at timestamp with time zone, created_at timestamp with time zone default timezone('utc'::text, now()) not null, unique (business_id, client_id));
create index if not exists idx_membership_plans_business_id on public.membership_plans (business_id);
create index if not exists idx_client_memberships_business_id on public.client_memberships (business_id, status);
alter table public.membership_plans enable row level security;
alter table public.client_memberships enable row level security;
drop policy if exists "Owners can view membership plans" on public.membership_plans;
create policy "Owners can view membership plans" on public.membership_plans for select to authenticated using (auth.uid() = business_id);
drop policy if exists "Owners can manage membership plans" on public.membership_plans;
create policy "Owners can manage membership plans" on public.membership_plans for all to authenticated using (auth.uid() = business_id) with check (auth.uid() = business_id);
drop policy if exists "Owners can view client memberships" on public.client_memberships;
create policy "Owners can view client memberships" on public.client_memberships for select to authenticated using (auth.uid() = business_id);
drop policy if exists "Owners can manage client memberships" on public.client_memberships;
create policy "Owners can manage client memberships" on public.client_memberships for all to authenticated using (auth.uid() = business_id) with check (auth.uid() = business_id);
grant select, insert, update, delete on public.membership_plans to authenticated;
grant select, insert, update, delete on public.client_memberships to authenticated;

-- Classes and group sessions.
create table if not exists public.class_sessions (id uuid default gen_random_uuid() primary key, business_id uuid references auth.users(id) on delete cascade not null, name text not null, description text not null default '', session_date date not null, start_time text not null, duration_minutes integer not null default 60, capacity integer not null default 10, enrolled_count integer not null default 0, staff_member_id uuid references public.staff_members(id) on delete set null, status text not null default 'scheduled' check (status in ('scheduled', 'full', 'cancelled', 'completed')), created_at timestamp with time zone default timezone('utc'::text, now()) not null, updated_at timestamp with time zone default timezone('utc'::text, now()) not null, constraint class_sessions_duration_check check (duration_minutes between 5 and 1440), constraint class_sessions_capacity_check check (capacity between 1 and 500), constraint class_sessions_enrolled_check check (enrolled_count between 0 and capacity));
create index if not exists idx_class_sessions_business_date on public.class_sessions (business_id, session_date, start_time);
alter table public.class_sessions enable row level security;
drop policy if exists "Owners can view class sessions" on public.class_sessions;
create policy "Owners can view class sessions" on public.class_sessions for select to authenticated using (auth.uid() = business_id);
drop policy if exists "Owners can manage class sessions" on public.class_sessions;
create policy "Owners can manage class sessions" on public.class_sessions for all to authenticated using (auth.uid() = business_id) with check (auth.uid() = business_id);
grant select, insert, update, delete on public.class_sessions to authenticated;

-- Staff permission helpers and appointment access policies.
create or replace function public.current_staff_role(p_business_id uuid)
returns text language sql stable security definer set search_path = public
as $$ select case when auth.uid() = p_business_id then 'owner' else coalesce((select staff.role from public.staff_members staff where staff.business_id = p_business_id and staff.user_id = auth.uid() and staff.status = 'active' limit 1), '') end $$;
create or replace function public.current_staff_member_id(p_business_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select staff.id from public.staff_members staff where staff.business_id = p_business_id and staff.user_id = auth.uid() and staff.status = 'active' order by staff.created_at asc limit 1 $$;
revoke all on function public.current_staff_role(uuid) from public;
revoke all on function public.current_staff_member_id(uuid) from public;
grant execute on function public.current_staff_role(uuid) to authenticated;
grant execute on function public.current_staff_member_id(uuid) to authenticated;
create or replace function public.get_my_staff_context()
returns table (business_id uuid, staff_member_id uuid, role text, status text)
language sql stable security definer set search_path = public
as $$
  select staff.business_id, staff.id, staff.role, staff.status
  from public.staff_members staff
  where staff.user_id = auth.uid() and staff.status = 'active'
  order by staff.created_at asc limit 1;
$$;
revoke all on function public.get_my_staff_context() from public;
grant execute on function public.get_my_staff_context() to authenticated;
grant select, insert, update, delete on table public.appointments to authenticated;
grant select, insert on table public.appointments to anon;
revoke update, delete on table public.appointments from anon;

drop policy if exists "Business owners can view own appointments" on public.appointments;
drop policy if exists "Business owners and staff can view appointments" on public.appointments;
drop policy if exists "Allow appointment selects" on public.appointments;
create policy "Business owners and staff can view appointments" on public.appointments for select to authenticated using (public.current_staff_role(business_id) in ('owner', 'manager') or (public.current_staff_role(business_id) in ('staff', 'limited') and staff_member_id = public.current_staff_member_id(business_id)) or (coalesce(auth.jwt() ->> 'email', '') <> '' and lower(trim(customer_email)) = lower(trim(auth.jwt() ->> 'email'))));

drop policy if exists "Public can insert appointments" on public.appointments;
drop policy if exists "Allow appointment inserts" on public.appointments;
create policy "Allow appointment inserts" on public.appointments for insert to anon, authenticated with check (business_id is not null and (auth.uid() = business_id or public.current_staff_role(business_id) in ('owner', 'manager', 'staff') or exists (select 1 from public.business_profiles profile where profile.id = business_id)));

drop policy if exists "Business owners can update own appointments" on public.appointments;
drop policy if exists "Business owners and staff can update appointments" on public.appointments;
drop policy if exists "Allow appointment updates" on public.appointments;
create policy "Business owners and staff can update appointments" on public.appointments for update to authenticated using (public.current_staff_role(business_id) in ('owner', 'manager') or (public.current_staff_role(business_id) in ('staff', 'limited') and staff_member_id = public.current_staff_member_id(business_id))) with check (public.current_staff_role(business_id) in ('owner', 'manager') or (public.current_staff_role(business_id) in ('staff', 'limited') and staff_member_id = public.current_staff_member_id(business_id)));

drop policy if exists "Business owners can delete own appointments" on public.appointments;
drop policy if exists "Owners and managers can delete appointments" on public.appointments;
drop policy if exists "Allow appointment deletes" on public.appointments;
create policy "Owners and managers can delete appointments" on public.appointments for delete to authenticated using (public.current_staff_role(business_id) in ('owner', 'manager'));
drop policy if exists "Business owners can view clients" on public.clients;
create policy "Business owners and managers can view clients" on public.clients for select to authenticated using (public.current_staff_role(business_id) in ('owner', 'manager'));

-- Final notification trigger definition includes optional SMS events.
create or replace function public.queue_appointment_notification_event()
returns trigger language plpgsql security definer set search_path = public
as $$
declare next_event text; owner_email text; staff_email text; staff_enabled boolean; sms_enabled boolean; followup_enabled boolean; followup_delay integer;
begin
  select coalesce(ns.staff_confirmation_enabled, true), coalesce(ns.sms_enabled, false), coalesce(ns.no_show_followup_enabled, false), coalesce(ns.no_show_followup_delay_hours, 24) into staff_enabled, sms_enabled, followup_enabled, followup_delay from public.notification_settings ns where ns.business_id = new.business_id;
  if tg_op = 'INSERT' then
    if coalesce(staff_enabled, true) then
      select u.email into owner_email from auth.users u where u.id = new.business_id;
      if coalesce(owner_email, '') <> '' then insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message) values (new.business_id, new.id, 'staff_notification', 'email', owner_email, 'scheduled', 'Queued by new appointment'); end if;
      select sm.email into staff_email from public.staff_members sm where sm.id = new.staff_member_id and sm.business_id = new.business_id and sm.status = 'active' and coalesce(sm.email, '') <> '';
      if coalesce(staff_email, '') <> '' and lower(staff_email) <> lower(coalesce(owner_email, '')) then insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message) values (new.business_id, new.id, 'staff_notification', 'email', staff_email, 'scheduled', 'Queued for assigned staff member'); end if;
    end if;
    if coalesce(sms_enabled, false) and coalesce(new.customer_phone, '') <> '' then insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message) values (new.business_id, new.id, 'booking_confirmation', 'sms', new.customer_phone, 'scheduled', 'Queued SMS confirmation'); end if;
    return new;
  end if;
  if lower(coalesce(new.status, '')) = 'cancelled' and lower(coalesce(old.status, '')) <> 'cancelled' then next_event := 'cancellation';
  elsif lower(coalesce(new.status, '')) = 'no_show' and lower(coalesce(old.status, '')) <> 'no_show' then next_event := 'no_show';
  elsif (new.appointment_date is distinct from old.appointment_date or new.appointment_time is distinct from old.appointment_time) and lower(coalesce(new.status, '')) <> 'cancelled' then next_event := 'reschedule';
  else return new;
  end if;
  insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message) values (new.business_id, new.id, next_event, 'email', coalesce(new.customer_email, ''), 'scheduled', 'Queued by appointment state change');
  if coalesce(sms_enabled, false) and coalesce(new.customer_phone, '') <> '' then insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message) values (new.business_id, new.id, next_event, 'sms', new.customer_phone, 'scheduled', 'Queued SMS appointment state change'); end if;
  if next_event = 'no_show' and coalesce(followup_enabled, false) and (coalesce(new.customer_email, '') <> '' or (coalesce(sms_enabled, false) and coalesce(new.customer_phone, '') <> '')) then
    if coalesce(new.customer_email, '') <> '' then insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message, scheduled_for) values (new.business_id, new.id, 'no_show_followup', 'email', new.customer_email, 'scheduled', 'Queued delayed no-show follow-up', timezone('utc'::text, now()) + make_interval(hours => followup_delay)); end if;
    if coalesce(sms_enabled, false) and coalesce(new.customer_phone, '') <> '' then insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message, scheduled_for) values (new.business_id, new.id, 'no_show_followup', 'sms', new.customer_phone, 'scheduled', 'Queued delayed SMS no-show follow-up', timezone('utc'::text, now()) + make_interval(hours => followup_delay)); end if;
  end if;
  return new;
end;
$$;
drop trigger if exists appointments_queue_notification_event on public.appointments;
create trigger appointments_queue_notification_event after update of status, appointment_date, appointment_time on public.appointments for each row execute function public.queue_appointment_notification_event();
drop trigger if exists appointments_queue_staff_notification on public.appointments;
create trigger appointments_queue_staff_notification after insert on public.appointments for each row execute function public.queue_appointment_notification_event();
-- Outbound webhook endpoint tables and worker functions.
create table if not exists public.integration_webhook_endpoints (
  id uuid default gen_random_uuid() primary key, business_id uuid references auth.users(id) on delete cascade not null,
  name text not null default 'Bookora webhook', url text not null, signing_secret text not null,
  events text[] not null default array['appointment.created', 'appointment.updated']::text[], active boolean not null default true,
  last_delivery_at timestamp with time zone, last_error text not null default '', created_at timestamp with time zone not null default timezone('utc'::text, now()), updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint integration_webhook_endpoint_url_check check (url ~* '^https://'), constraint integration_webhook_endpoint_name_check check (char_length(name) between 1 and 120), constraint integration_webhook_endpoint_secret_check check (char_length(signing_secret) between 16 and 256), constraint integration_webhook_endpoint_events_check check (cardinality(events) between 1 and 20)
);
create unique index if not exists idx_webhook_endpoints_business_url on public.integration_webhook_endpoints (business_id, url);
alter table public.integration_webhook_endpoints enable row level security;
drop policy if exists "Owners can view webhook endpoints" on public.integration_webhook_endpoints;
create policy "Owners can view webhook endpoints" on public.integration_webhook_endpoints for select to authenticated using (auth.uid() = business_id);
drop policy if exists "Owners can insert webhook endpoints" on public.integration_webhook_endpoints;
create policy "Owners can insert webhook endpoints" on public.integration_webhook_endpoints for insert to authenticated with check (auth.uid() = business_id);
drop policy if exists "Owners can update webhook endpoints" on public.integration_webhook_endpoints;
create policy "Owners can update webhook endpoints" on public.integration_webhook_endpoints for update to authenticated using (auth.uid() = business_id) with check (auth.uid() = business_id);
drop policy if exists "Owners can delete webhook endpoints" on public.integration_webhook_endpoints;
create policy "Owners can delete webhook endpoints" on public.integration_webhook_endpoints for delete to authenticated using (auth.uid() = business_id);
grant select, insert, update, delete on public.integration_webhook_endpoints to authenticated;
create table if not exists public.integration_webhook_deliveries (
  id uuid default gen_random_uuid() primary key, endpoint_id uuid references public.integration_webhook_endpoints(id) on delete cascade not null, business_id uuid references auth.users(id) on delete cascade not null, event_type text not null, payload jsonb not null default '{}'::jsonb, status text not null default 'pending', attempt_count integer not null default 0, next_attempt_at timestamp with time zone not null default timezone('utc'::text, now()), processing_started_at timestamp with time zone, response_status integer, response_body text not null default '', error_message text not null default '', created_at timestamp with time zone not null default timezone('utc'::text, now()), constraint integration_webhook_delivery_status_check check (status in ('pending', 'processing', 'sent', 'failed')), constraint integration_webhook_delivery_attempt_check check (attempt_count between 0 and 5), constraint integration_webhook_delivery_response_check check (char_length(response_body) <= 4000)
);
create index if not exists idx_webhook_deliveries_due on public.integration_webhook_deliveries (status, next_attempt_at); create index if not exists idx_webhook_deliveries_business on public.integration_webhook_deliveries (business_id, created_at desc); alter table public.integration_webhook_deliveries enable row level security;
drop policy if exists "Owners can view webhook deliveries" on public.integration_webhook_deliveries;
create policy "Owners can view webhook deliveries" on public.integration_webhook_deliveries for select to authenticated using (auth.uid() = business_id); grant select on public.integration_webhook_deliveries to authenticated; revoke insert, update, delete on public.integration_webhook_deliveries from anon, authenticated;
create or replace function public.queue_outbound_webhook_event() returns trigger language plpgsql security definer set search_path = public as $$ declare event_name text; endpoint record; event_payload jsonb; begin event_name := case when tg_op = 'INSERT' then 'appointment.created' else 'appointment.updated' end; event_payload := jsonb_build_object('id', new.id, 'business_id', new.business_id, 'customer_name', new.customer_name, 'customer_email', new.customer_email, 'service_names', new.service_names, 'appointment_date', new.appointment_date, 'appointment_time', new.appointment_time, 'duration_minutes', new.duration_minutes, 'status', new.status, 'staff_member_id', new.staff_member_id, 'location_name', new.location_name, 'meeting_url', coalesce(new.meeting_url, ''), 'updated_at', timezone('utc'::text, now())); for endpoint in select id, business_id from public.integration_webhook_endpoints where business_id = new.business_id and active and event_name = any(events) loop insert into public.integration_webhook_deliveries (endpoint_id, business_id, event_type, payload) values (endpoint.id, endpoint.business_id, event_name, event_payload); end loop; return new; end; $$;
drop trigger if exists appointments_queue_outbound_webhook on public.appointments; create trigger appointments_queue_outbound_webhook after insert or update on public.appointments for each row execute function public.queue_outbound_webhook_event(); revoke all on function public.queue_outbound_webhook_event() from public;
create or replace function public.claim_outbound_webhook_deliveries(p_limit integer default 20) returns table (id uuid, endpoint_id uuid, business_id uuid, event_type text, payload jsonb, url text, signing_secret text, attempt_count integer) language plpgsql security definer set search_path = public as $$ begin return query with candidates as (select delivery.id from public.integration_webhook_deliveries delivery where (delivery.status = 'pending' and delivery.next_attempt_at <= timezone('utc'::text, now())) or (delivery.status = 'processing' and delivery.processing_started_at < timezone('utc'::text, now()) - interval '10 minutes') order by delivery.created_at asc for update skip locked limit greatest(1, least(coalesce(p_limit, 20), 100))), claimed as (update public.integration_webhook_deliveries delivery set status = 'processing', processing_started_at = timezone('utc'::text, now()), attempt_count = least(delivery.attempt_count + 1, 5) from candidates where delivery.id = candidates.id returning delivery.*) select claimed.id, claimed.endpoint_id, claimed.business_id, claimed.event_type, claimed.payload, endpoint.url, endpoint.signing_secret, claimed.attempt_count from claimed join public.integration_webhook_endpoints endpoint on endpoint.id = claimed.endpoint_id where endpoint.active; end; $$;
revoke all on function public.claim_outbound_webhook_deliveries(integer) from public, anon, authenticated; grant execute on function public.claim_outbound_webhook_deliveries(integer) to service_role;
create or replace function public.complete_outbound_webhook_delivery(p_delivery_id uuid, p_status text, p_response_status integer default null, p_response_body text default '', p_error_message text default '') returns void language plpgsql security definer set search_path = public as $$ declare delivery_row public.integration_webhook_deliveries; begin select * into delivery_row from public.integration_webhook_deliveries where id = p_delivery_id for update; if delivery_row.id is null then return; end if; update public.integration_webhook_deliveries set status = case when p_status = 'sent' then 'sent' when delivery_row.attempt_count >= 5 then 'failed' else 'pending' end, next_attempt_at = case when p_status = 'sent' or delivery_row.attempt_count >= 5 then timezone('utc'::text, now()) else timezone('utc'::text, now()) + make_interval(mins => least(60, power(2, delivery_row.attempt_count)::integer * 2)) end, processing_started_at = null, response_status = p_response_status, response_body = left(coalesce(p_response_body, ''), 4000), error_message = left(coalesce(p_error_message, ''), 1000) where id = p_delivery_id; update public.integration_webhook_endpoints set last_delivery_at = timezone('utc'::text, now()), last_error = case when p_status = 'sent' then '' else left(coalesce(p_error_message, 'Delivery failed'), 1000) end, updated_at = timezone('utc'::text, now()) where id = delivery_row.endpoint_id; end; $$;
revoke all on function public.complete_outbound_webhook_delivery(uuid, text, integer, text, text) from public, anon, authenticated; grant execute on function public.complete_outbound_webhook_delivery(uuid, text, integer, text, text) to service_role;


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
