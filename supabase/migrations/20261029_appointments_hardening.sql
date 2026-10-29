-- Phase 2 hardening: protect appointment writes and prevent overlapping bookings.

alter table public.appointments
    add constraint appointments_status_check
    check (status in ('pending', 'approved', 'completed', 'cancelled')) not valid;

alter table public.appointments
    add constraint appointments_duration_positive_check
    check (duration_minutes is null or duration_minutes > 0) not valid;

alter table public.appointments
    add constraint appointments_date_time_required_check
    check (length(trim(appointment_date)) > 0 and length(trim(appointment_time)) > 0) not valid;

drop policy if exists "Public can insert appointments" on public.appointments;
create policy "Public can insert appointments"
    on public.appointments for insert to anon, authenticated
    with check (
        business_id is not null
        and exists (
            select 1
            from public.business_profiles profile
            where profile.id = business_id
              and profile.slug is not null
              and length(trim(profile.slug)) > 0
        )
    );

create or replace function public.prevent_appointment_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    incoming_start timestamp;
    incoming_end timestamp;
    existing_start timestamp;
    existing_end timestamp;
begin
    if lower(coalesce(new.status, 'approved')) in ('cancelled', 'canceled', 'declined', 'rejected') then
        return new;
    end if;

    -- Serialize appointment writes for this business so concurrent requests
    -- cannot both pass the overlap scan before either transaction commits.
    perform pg_advisory_xact_lock(
        hashtextextended(coalesce(new.business_id::text, ''), 0)
    );

    begin
        incoming_start := to_timestamp(new.appointment_date || ' ' || new.appointment_time, 'YYYY-MM-DD HH12:MI AM')::timestamp;
    exception when others then
        raise exception 'Appointment date and time must be valid.' using errcode = '22007';
    end;
    incoming_end := incoming_start + make_interval(mins => greatest(coalesce(new.duration_minutes, 60) + coalesce(new.buffer_minutes, 0), 1));

    for existing_start, existing_end in
        select
            to_timestamp(a.appointment_date || ' ' || a.appointment_time, 'YYYY-MM-DD HH12:MI AM')::timestamp,
            to_timestamp(a.appointment_date || ' ' || a.appointment_time, 'YYYY-MM-DD HH12:MI AM')::timestamp
                + make_interval(mins => greatest(coalesce(a.duration_minutes, 60) + coalesce(a.buffer_minutes, 0), 1))
        from public.appointments a
        where a.business_id = new.business_id
          and a.appointment_date = new.appointment_date
          and a.id is distinct from new.id
          and lower(coalesce(a.status, 'approved')) not in ('cancelled', 'canceled', 'declined', 'rejected')
    loop
        if incoming_start < existing_end and incoming_end > existing_start then
            raise exception 'This appointment overlaps an existing booking.' using errcode = '23P01';
        end if;
    end loop;

    return new;
end;
$$;

drop trigger if exists appointments_prevent_overlap on public.appointments;
create trigger appointments_prevent_overlap
    before insert or update of business_id, appointment_date, appointment_time, duration_minutes, buffer_minutes, status
    on public.appointments
    for each row execute function public.prevent_appointment_overlap();

revoke all on function public.prevent_appointment_overlap() from public;
