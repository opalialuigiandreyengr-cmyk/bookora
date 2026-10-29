-- Phase 9: advanced scheduling controls.
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
