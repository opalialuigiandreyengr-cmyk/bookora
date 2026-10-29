-- Phase 1: enforce staff calendar permissions at the database boundary.
create or replace function public.current_staff_role(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
    select case
        when auth.uid() = p_business_id then 'owner'
        else coalesce((select staff.role from public.staff_members staff where staff.business_id = p_business_id and staff.user_id = auth.uid() and staff.status = 'active' limit 1), '')
    end;
$$;

create or replace function public.current_staff_member_id(p_business_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select staff.id from public.staff_members staff
    where staff.business_id = p_business_id and staff.user_id = auth.uid() and staff.status = 'active'
    order by staff.created_at asc limit 1;
$$;

revoke all on function public.current_staff_role(uuid) from public;
revoke all on function public.current_staff_member_id(uuid) from public;
grant execute on function public.current_staff_role(uuid) to authenticated;
grant execute on function public.current_staff_member_id(uuid) to authenticated;

drop policy if exists "Business owners can view own appointments" on public.appointments;
create policy "Business owners and staff can view appointments"
    on public.appointments for select to authenticated
    using (
        public.current_staff_role(business_id) in ('owner', 'manager')
        or (public.current_staff_role(business_id) in ('staff', 'limited') and staff_member_id = public.current_staff_member_id(business_id))
    );

drop policy if exists "Business owners can update own appointments" on public.appointments;
create policy "Business owners and staff can update appointments"
    on public.appointments for update to authenticated
    using (
        public.current_staff_role(business_id) in ('owner', 'manager')
        or (public.current_staff_role(business_id) in ('staff', 'limited') and staff_member_id = public.current_staff_member_id(business_id))
    )
    with check (
        public.current_staff_role(business_id) in ('owner', 'manager')
        or (public.current_staff_role(business_id) in ('staff', 'limited') and staff_member_id = public.current_staff_member_id(business_id))
    );

drop policy if exists "Business owners can delete own appointments" on public.appointments;
create policy "Owners and managers can delete appointments"
    on public.appointments for delete to authenticated
    using (public.current_staff_role(business_id) in ('owner', 'manager'));

drop policy if exists "Business owners can view clients" on public.clients;
create policy "Business owners and managers can view clients"
    on public.clients for select to authenticated
    using (public.current_staff_role(business_id) in ('owner', 'manager'));
