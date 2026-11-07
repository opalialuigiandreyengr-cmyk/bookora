-- Phase 6: queue appointment-state notifications for the future delivery worker.
create or replace function public.queue_appointment_notification_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    next_event text;
begin
    if lower(coalesce(new.status, '')) = 'cancelled'
       and lower(coalesce(old.status, '')) <> 'cancelled' then
        next_event := 'cancellation';
    elsif lower(coalesce(new.status, '')) = 'no_show'
       and lower(coalesce(old.status, '')) <> 'no_show' then
        next_event := 'no_show';
    elsif (new.appointment_date is distinct from old.appointment_date
       or new.appointment_time is distinct from old.appointment_time)
       and lower(coalesce(new.status, '')) <> 'cancelled' then
        next_event := 'reschedule';
    else
        return new;
    end if;

    insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message)
    values (new.business_id, new.id, next_event, 'email', coalesce(new.customer_email, ''), 'scheduled', 'Queued by appointment state change');
    return new;
end;
$$;

drop trigger if exists appointments_queue_notification_event on public.appointments;
create trigger appointments_queue_notification_event
    after update of status, appointment_date, appointment_time
    on public.appointments
    for each row execute function public.queue_appointment_notification_event();

revoke all on function public.queue_appointment_notification_event() from public;
