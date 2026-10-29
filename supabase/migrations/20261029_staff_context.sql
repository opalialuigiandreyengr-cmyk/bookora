-- Resolve the signed-in staff member's business context without exposing memberships to anon clients.
create or replace function public.get_my_staff_context()
returns table (business_id uuid, staff_member_id uuid, role text, status text)
language sql stable security definer set search_path = public
as $$
  select staff.business_id, staff.id, staff.role, staff.status
  from public.staff_members staff
  where staff.user_id = auth.uid()
    and staff.status = 'active'
  order by staff.created_at asc
  limit 1;
$$;

revoke all on function public.get_my_staff_context() from public;
grant execute on function public.get_my_staff_context() to authenticated;
