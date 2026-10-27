-- Allow signed-in customers to retrieve their own appointments across devices.
-- The email supplied by the client must also match the authenticated account.
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
