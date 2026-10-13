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
    banner_url text default '',
    logo_url text default '',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

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
