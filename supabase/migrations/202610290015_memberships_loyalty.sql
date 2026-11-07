-- Phase 9: membership plans and loyalty balances.
create table if not exists public.membership_plans (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null,
    name text not null,
    description text not null default '',
    monthly_price numeric(12,2) not null default 0,
    points_per_visit integer not null default 1,
    active boolean not null default true,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint membership_plans_price_check check (monthly_price >= 0),
    constraint membership_plans_points_check check (points_per_visit between 0 and 1000)
);

create table if not exists public.client_memberships (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null,
    client_id uuid references public.clients(id) on delete cascade not null,
    plan_id uuid references public.membership_plans(id) on delete set null,
    status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
    points_balance integer not null default 0 check (points_balance >= 0),
    started_at timestamp with time zone default timezone('utc'::text, now()) not null,
    expires_at timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique (business_id, client_id)
);

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
