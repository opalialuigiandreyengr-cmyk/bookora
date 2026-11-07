-- Phase 1: owner-managed staff, roles, availability, and service assignments.
create table if not exists public.staff_members (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null,
    user_id uuid references auth.users(id) on delete set null,
    full_name text not null,
    email text not null default '',
    phone text not null default '',
    bio text not null default '',
    role text not null default 'staff' check (role in ('owner', 'manager', 'staff', 'limited')),
    status text not null default 'invited' check (status in ('active', 'invited', 'paused')),
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
