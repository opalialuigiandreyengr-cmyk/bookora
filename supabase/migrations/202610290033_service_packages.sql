-- Phase 9: prepaid service packages.
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
