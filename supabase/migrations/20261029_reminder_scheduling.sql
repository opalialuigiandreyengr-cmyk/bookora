-- Phase 6: schedule reminder events using the owner's configured lead time.
alter table public.notification_events add column if not exists scheduled_for timestamp with time zone;
create index if not exists idx_notification_events_due on public.notification_events (status, scheduled_for);

create or replace function public.queue_appointment_reminder_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    reminder_enabled boolean;
    lead_hours integer;
    appointment_start timestamp;
begin
    select coalesce(reminder_enabled, true), greatest(0, coalesce(reminder_lead_hours, 24))
    into reminder_enabled, lead_hours
    from public.notification_settings
    where business_id = new.business_id;
    if coalesce(reminder_enabled, true) = false or coalesce(new.customer_email, '') = '' or lower(coalesce(new.status, '')) in ('cancelled', 'no_show', 'completed') then
        return new;
    end if;
    appointment_start := to_timestamp(new.appointment_date || ' ' || new.appointment_time, 'YYYY-MM-DD HH12:MI AM')::timestamp;
    delete from public.notification_events where appointment_id = new.id and event_type = 'reminder' and status = 'scheduled';
    insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message, scheduled_for)
    values (new.business_id, new.id, 'reminder', 'email', new.customer_email, 'scheduled', 'Queued using owner reminder lead time', appointment_start - make_interval(hours => lead_hours));
    return new;
end;
$$;

drop trigger if exists appointments_queue_reminder_event on public.appointments;
create trigger appointments_queue_reminder_event
after insert or update of appointment_date, appointment_time, status
on public.appointments for each row execute function public.queue_appointment_reminder_event();

revoke all on function public.queue_appointment_reminder_event() from public;
