-- Phase 5/6: enforce the owner's cancellation notice window server-side.
create or replace function public.cancel_customer_appointment(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    target public.appointments%rowtype;
    notice_hours integer;
    appointment_start timestamp;
begin
    if auth.role() <> 'authenticated' then
        raise exception 'Authentication is required to cancel an appointment.' using errcode = '42501';
    end if;

    select * into target
    from public.appointments
    where id = p_appointment_id
      and lower(trim(customer_email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    for update;

    if not found then
        raise exception 'Appointment not found or access denied.' using errcode = '42501';
    end if;
    if lower(coalesce(target.status, '')) in ('cancelled', 'completed', 'no_show') then
        raise exception 'This appointment cannot be cancelled.' using errcode = '22023';
    end if;

    select greatest(0, coalesce(booking_cancellation_notice_hours, 24)) into notice_hours
    from public.business_profiles
    where id = target.business_id;

    appointment_start := to_timestamp(target.appointment_date || ' ' || target.appointment_time, 'YYYY-MM-DD HH12:MI AM')::timestamp;
    if coalesce(notice_hours, 24) > 0 and appointment_start < (now() at time zone 'UTC') + make_interval(hours => coalesce(notice_hours, 24)) then
        raise exception 'This appointment is inside the cancellation notice window.' using errcode = '22023';
    end if;

    update public.appointments set status = 'cancelled' where id = target.id;
end;
$$;

revoke all on function public.cancel_customer_appointment(uuid) from public;
grant execute on function public.cancel_customer_appointment(uuid) to authenticated;
