-- Prevent concurrent appointment inserts/updates from bypassing the overlap check.

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

    -- Serialize appointment writes per business. This closes the race where
    -- two simultaneous requests both pass the overlap scan before commit.
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

revoke all on function public.prevent_appointment_overlap() from public;
