-- Public booking links are scoped to the high-entropy appointment UUID included
-- in the customer's email. These functions expose only that one appointment and
-- keep guest changes inside server-side validation.

create or replace function public.get_public_booking_details(p_appointment_id uuid)
returns table (
  id uuid,
  business_id uuid,
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_note text,
  service_names text,
  total_price text,
  appointment_date text,
  appointment_time text,
  duration_minutes integer,
  status text,
  location_name text,
  meeting_url text,
  peg_image_path text,
  payment_receipt_path text,
  business_name text,
  business_logo_url text,
  business_location text,
  business_address text,
  business_country text,
  owner_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id, a.business_id, a.customer_name, a.customer_email, a.customer_phone,
    a.customer_note, a.service_names, a.total_price, a.appointment_date,
    a.appointment_time, a.duration_minutes, a.status, a.location_name,
    a.meeting_url, a.peg_image_path, a.payment_receipt_path,
    p.business_name, p.logo_url, coalesce(nullif(a.location_name, ''), p.city),
    p.address, p.country, p.owner_name
  from public.appointments a
  join public.business_profiles p on p.id = a.business_id
  where a.id = p_appointment_id;
$$;

create or replace function public.reschedule_public_appointment(
  p_appointment_id uuid,
  p_appointment_date text,
  p_appointment_time text
)
returns table (id uuid, appointment_date text, appointment_time text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.appointments%rowtype;
  incoming_start timestamp;
  incoming_end timestamp;
  existing_start timestamp;
  existing_end timestamp;
  minimum_notice integer;
begin
  if p_appointment_date !~ '^\d{4}-\d{2}-\d{2}$'
     or p_appointment_time !~ '^\d{1,2}:\d{2}\s*(AM|PM)$' then
    raise exception 'Enter a valid date and time.' using errcode = '22023';
  end if;

  select * into target from public.appointments where appointments.id = p_appointment_id for update;
  if not found then raise exception 'Booking not found.' using errcode = 'P0002'; end if;
  if lower(coalesce(target.status, '')) in ('cancelled', 'completed', 'no_show') then
    raise exception 'This booking cannot be rescheduled.' using errcode = '22023';
  end if;

  select greatest(0, coalesce(booking_min_notice_hours, 2)) into minimum_notice
  from public.business_profiles where id = target.business_id;
  incoming_start := to_timestamp(p_appointment_date || ' ' || p_appointment_time, 'YYYY-MM-DD HH12:MI AM')::timestamp;
  if incoming_start < (now() at time zone 'UTC') + make_interval(hours => coalesce(minimum_notice, 2)) then
    raise exception 'Choose a later appointment time.' using errcode = '22023';
  end if;
  incoming_end := incoming_start + make_interval(mins => greatest(coalesce(target.duration_minutes, 60) + coalesce(target.buffer_minutes, 0), 1));

  for existing_start, existing_end in
    select
      to_timestamp(a.appointment_date || ' ' || a.appointment_time, 'YYYY-MM-DD HH12:MI AM')::timestamp,
      to_timestamp(a.appointment_date || ' ' || a.appointment_time, 'YYYY-MM-DD HH12:MI AM')::timestamp
        + make_interval(mins => greatest(coalesce(a.duration_minutes, 60) + coalesce(a.buffer_minutes, 0), 1))
    from public.appointments a
    where a.business_id = target.business_id
      and a.id <> target.id
      and a.appointment_date = p_appointment_date
      and lower(coalesce(a.status, 'pending')) not in ('cancelled', 'canceled', 'declined', 'rejected')
  loop
    if incoming_start < existing_end and incoming_end > existing_start then
      raise exception 'That time is no longer available.' using errcode = '23P01';
    end if;
  end loop;

  update public.appointments
  set appointment_date = p_appointment_date, appointment_time = p_appointment_time
  where appointments.id = target.id;

  return query select target.id, p_appointment_date, p_appointment_time, target.status;
end;
$$;

create or replace function public.cancel_public_appointment(p_appointment_id uuid)
returns table (id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.appointments%rowtype;
  notice_hours integer;
  appointment_start timestamp;
begin
  select * into target from public.appointments where appointments.id = p_appointment_id for update;
  if not found then raise exception 'Booking not found.' using errcode = 'P0002'; end if;
  if lower(coalesce(target.status, '')) in ('cancelled', 'completed', 'no_show') then
    raise exception 'This booking cannot be cancelled.' using errcode = '22023';
  end if;

  select greatest(0, coalesce(booking_cancellation_notice_hours, 24)) into notice_hours
  from public.business_profiles where id = target.business_id;
  appointment_start := to_timestamp(target.appointment_date || ' ' || target.appointment_time, 'YYYY-MM-DD HH12:MI AM')::timestamp;
  if coalesce(notice_hours, 24) > 0 and appointment_start < (now() at time zone 'UTC') + make_interval(hours => coalesce(notice_hours, 24)) then
    raise exception 'This booking is inside the cancellation notice window.' using errcode = '22023';
  end if;

  update public.appointments set status = 'cancelled' where appointments.id = target.id;
  return query select target.id, 'cancelled'::text;
end;
$$;

revoke all on function public.get_public_booking_details(uuid) from public;
revoke all on function public.reschedule_public_appointment(uuid, text, text) from public;
revoke all on function public.cancel_public_appointment(uuid) from public;
grant execute on function public.get_public_booking_details(uuid) to anon, authenticated;
grant execute on function public.reschedule_public_appointment(uuid, text, text) to anon, authenticated;
grant execute on function public.cancel_public_appointment(uuid) to anon, authenticated;
