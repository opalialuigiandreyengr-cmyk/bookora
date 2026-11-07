-- ============================================================================
-- MASTER FIX: Table Permissions & RLS Policies for Bookora
-- Fixes permission denied on appointments, clients, and payment_transactions
-- Run this once in Supabase Dashboard > SQL Editor.
-- ============================================================================

begin;

-- 1. Ensure schema usage
grant usage on schema public to anon, authenticated, service_role;

-- 2. Grant table-level CRUD permissions on all public tables to authenticated
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated, anon;

-- 3. Specific table-level privileges for anon role (public booking visitor)
grant select, insert on table public.appointments to anon;
grant select, insert on table public.clients to anon;
grant select, insert on table public.payment_transactions to anon;
grant select on table public.business_profiles to anon;
grant select on table public.services to anon;
grant select on table public.service_categories to anon;
grant select on table public.staff_members to anon;
grant select on table public.staff_service_assignments to anon;
grant select on table public.service_packages to anon;
grant select on table public.class_sessions to anon;

-- Revoke dangerous direct mutations from anon
revoke update, delete on table public.appointments from anon;
revoke update, delete on table public.clients from anon;
revoke update, delete on table public.payment_transactions from anon;

-- 4. Helper functions for staff roles
create or replace function public.current_staff_role(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
    select case
        when auth.uid() = p_business_id then 'owner'
        else coalesce((
            select staff.role
            from public.staff_members staff
            where staff.business_id = p_business_id
              and staff.user_id = auth.uid()
              and staff.status = 'active'
            limit 1
        ), '')
    end;
$$;

create or replace function public.current_staff_member_id(p_business_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select staff.id
    from public.staff_members staff
    where staff.business_id = p_business_id
      and staff.user_id = auth.uid()
      and staff.status = 'active'
    order by staff.created_at asc
    limit 1;
$$;

revoke all on function public.current_staff_role(uuid) from public;
revoke all on function public.current_staff_member_id(uuid) from public;
grant execute on function public.current_staff_role(uuid) to anon, authenticated;
grant execute on function public.current_staff_member_id(uuid) to anon, authenticated;

-- ============================================================================
-- 5. APPOINTMENTS POLICIES
-- ============================================================================
alter table public.appointments enable row level security;

drop policy if exists "Business owners can view own appointments" on public.appointments;
drop policy if exists "Business owners and staff can view appointments" on public.appointments;
drop policy if exists "Allow appointment selects" on public.appointments;
drop policy if exists "Customers can view own appointments" on public.appointments;
drop policy if exists "Customers view own appointments" on public.appointments;

drop policy if exists "Business owners can insert own appointments" on public.appointments;
drop policy if exists "Public can insert appointments" on public.appointments;
drop policy if exists "Allow appointment inserts" on public.appointments;
drop policy if exists "Enable insert for all users" on public.appointments;

drop policy if exists "Business owners can update own appointments" on public.appointments;
drop policy if exists "Business owners and staff can update appointments" on public.appointments;
drop policy if exists "Allow appointment updates" on public.appointments;

drop policy if exists "Business owners can delete own appointments" on public.appointments;
drop policy if exists "Owners and managers can delete appointments" on public.appointments;
drop policy if exists "Allow appointment deletes" on public.appointments;

create policy "Allow appointment inserts"
    on public.appointments for insert to anon, authenticated
    with check (
        business_id is not null
        and (
            auth.uid() = business_id
            or public.current_staff_role(business_id) in ('owner', 'manager', 'staff')
            or exists (
                select 1 from public.business_profiles bp
                where bp.id = business_id
            )
        )
    );

create policy "Allow appointment selects"
    on public.appointments for select to authenticated
    using (
        auth.uid() = business_id
        or public.current_staff_role(business_id) in ('owner', 'manager')
        or exists (
            select 1 from public.business_profiles bp
            where bp.id = business_id
              and (bp.id = auth.uid() or lower(trim(bp.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', ''))))
        )
        or (
            public.current_staff_role(business_id) in ('staff', 'limited')
            and staff_member_id = public.current_staff_member_id(business_id)
        )
        or (
            coalesce(auth.jwt() ->> 'email', '') <> ''
            and lower(trim(customer_email)) = lower(trim(auth.jwt() ->> 'email'))
        )
    );

create policy "Allow appointment updates"
    on public.appointments for update to authenticated
    using (
        auth.uid() = business_id
        or public.current_staff_role(business_id) in ('owner', 'manager')
        or exists (
            select 1 from public.business_profiles bp
            where bp.id = business_id
              and (bp.id = auth.uid() or lower(trim(bp.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', ''))))
        )
        or (
            public.current_staff_role(business_id) in ('staff', 'limited')
            and staff_member_id = public.current_staff_member_id(business_id)
        )
    )
    with check (
        auth.uid() = business_id
        or public.current_staff_role(business_id) in ('owner', 'manager')
        or exists (
            select 1 from public.business_profiles bp
            where bp.id = business_id
              and (bp.id = auth.uid() or lower(trim(bp.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', ''))))
        )
        or (
            public.current_staff_role(business_id) in ('staff', 'limited')
            and staff_member_id = public.current_staff_member_id(business_id)
        )
    );

create policy "Allow appointment deletes"
    on public.appointments for delete to authenticated
    using (
        auth.uid() = business_id
        or public.current_staff_role(business_id) in ('owner', 'manager')
        or exists (
            select 1 from public.business_profiles bp
            where bp.id = business_id
              and (bp.id = auth.uid() or lower(trim(bp.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', ''))))
        )
    );

-- ============================================================================
-- 6. CLIENTS POLICIES
-- ============================================================================
alter table public.clients enable row level security;

drop policy if exists "Business owners can manage their clients" on public.clients;
drop policy if exists "Business owners can view clients" on public.clients;
drop policy if exists "Business owners and managers can view clients" on public.clients;
drop policy if exists "Business owners can insert clients" on public.clients;
drop policy if exists "Clients can insert own client profile" on public.clients;
drop policy if exists "Business owners can update clients" on public.clients;
drop policy if exists "Clients can update own client profile" on public.clients;
drop policy if exists "Business owners can delete clients" on public.clients;
drop policy if exists "Users and salon owners can view client records" on public.clients;
drop policy if exists "Allow client selects" on public.clients;
drop policy if exists "Allow client inserts" on public.clients;
drop policy if exists "Allow client updates" on public.clients;
drop policy if exists "Allow client deletes" on public.clients;

create policy "Allow client selects"
    on public.clients for select to authenticated
    using (
        auth.uid() = business_id
        or public.current_staff_role(business_id) in ('owner', 'manager')
        or auth.uid() = user_id
        or exists (
            select 1 from public.business_profiles bp
            where bp.id = business_id
              and (bp.id = auth.uid() or lower(trim(bp.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', ''))))
        )
    );

create policy "Allow client inserts"
    on public.clients for insert to anon, authenticated
    with check (
        business_id is not null
        and (
            auth.uid() = business_id
            or public.current_staff_role(business_id) in ('owner', 'manager', 'staff')
            or auth.uid() = user_id
            or exists (select 1 from public.business_profiles bp where bp.id = business_id)
        )
    );

create policy "Allow client updates"
    on public.clients for update to authenticated
    using (
        auth.uid() = business_id
        or public.current_staff_role(business_id) in ('owner', 'manager')
        or auth.uid() = user_id
    )
    with check (
        auth.uid() = business_id
        or public.current_staff_role(business_id) in ('owner', 'manager')
        or auth.uid() = user_id
    );

create policy "Allow client deletes"
    on public.clients for delete to authenticated
    using (
        auth.uid() = business_id
        or public.current_staff_role(business_id) in ('owner', 'manager')
    );

-- ============================================================================
-- 7. PAYMENT TRANSACTIONS POLICIES
-- ============================================================================
alter table public.payment_transactions enable row level security;

drop policy if exists "Business owners can view payment transactions" on public.payment_transactions;
drop policy if exists "Business owners can insert payment transactions" on public.payment_transactions;
drop policy if exists "Business owners can update payment transactions" on public.payment_transactions;
drop policy if exists "Business owners can delete payment transactions" on public.payment_transactions;
drop policy if exists "Allow payment selects" on public.payment_transactions;
drop policy if exists "Allow payment inserts" on public.payment_transactions;
drop policy if exists "Allow payment updates" on public.payment_transactions;
drop policy if exists "Allow payment deletes" on public.payment_transactions;

create policy "Allow payment selects"
    on public.payment_transactions for select to authenticated
    using (
        auth.uid() = business_id
        or public.current_staff_role(business_id) in ('owner', 'manager')
        or exists (
            select 1 from public.business_profiles bp
            where bp.id = business_id
              and (bp.id = auth.uid() or lower(trim(bp.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', ''))))
        )
    );

create policy "Allow payment inserts"
    on public.payment_transactions for insert to anon, authenticated
    with check (
        business_id is not null
        and (
            auth.uid() = business_id
            or public.current_staff_role(business_id) in ('owner', 'manager', 'staff')
            or exists (select 1 from public.business_profiles bp where bp.id = business_id)
        )
    );

create policy "Allow payment updates"
    on public.payment_transactions for update to authenticated
    using (
        auth.uid() = business_id
        or public.current_staff_role(business_id) in ('owner', 'manager')
    )
    with check (
        auth.uid() = business_id
        or public.current_staff_role(business_id) in ('owner', 'manager')
    );

create policy "Allow payment deletes"
    on public.payment_transactions for delete to authenticated
    using (
        auth.uid() = business_id
        or public.current_staff_role(business_id) in ('owner', 'manager')
    );

commit;
