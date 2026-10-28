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
alter table public.business_profiles
    add column if not exists booking_additional_info text default '';
alter table public.business_profiles
    add column if not exists payment_receipt_url text default '';

-- Index for id lookup
create index if not exists idx_business_profiles_id on public.business_profiles (id);

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
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint services_duration_nonnegative check (duration_minutes is null or duration_minutes >= 0),
    constraint services_buffer_nonnegative check (buffer_minutes >= 0)
);

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
    appointment_date text not null,
    appointment_time text not null,
    duration_minutes integer,
    buffer_minutes integer default 0,
    status text not null default 'pending',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_appointments_business_id on public.appointments (business_id);
alter table public.appointments add column if not exists duration_minutes integer;
alter table public.appointments add column if not exists buffer_minutes integer default 0;
alter table public.appointments add column if not exists peg_image_path text;
alter table public.appointments add column if not exists payment_receipt_path text;

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
        exists (
            select 1 from public.business_profiles profile
            where profile.id = appointments.business_id
              and profile.slug is not null
              and length(trim(profile.slug)) > 0
        )
    );

grant select, update, delete on public.appointments to authenticated;
grant insert on public.appointments to anon, authenticated;

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
language sql
security definer
set search_path = public
as $$
  update public.appointments
  set status = 'cancelled'
  where id = p_appointment_id
    and auth.role() = 'authenticated'
    and lower(trim(appointments.customer_email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')));
$$;

revoke all on function public.cancel_customer_appointment(uuid) from public;
grant execute on function public.cancel_customer_appointment(uuid) to authenticated;

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
    user_id uuid references auth.users(id) on delete cascade not null,
    business_id uuid references auth.users(id) on delete cascade not null,
    business_slug text not null,
    full_name text not null,
    email text not null,
    phone text default '',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique (user_id, business_id)
);

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
