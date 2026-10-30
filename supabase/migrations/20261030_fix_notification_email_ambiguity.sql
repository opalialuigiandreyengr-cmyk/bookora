-- Fix reminder trigger updates failing with "column reference email_enabled is ambiguous".
-- The function variable names are intentionally different from table columns.
create or replace function public.queue_appointment_reminder_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  email_channel_enabled boolean;
  reminder_channel_enabled boolean;
  lead_hours integer;
  appointment_start timestamp;
begin
  select coalesce(ns.email_enabled, true), coalesce(ns.reminder_enabled, true), greatest(0, coalesce(ns.reminder_lead_hours, 24))
    into email_channel_enabled, reminder_channel_enabled, lead_hours
    from public.notification_settings ns
    where ns.business_id = new.business_id;

  if not coalesce(email_channel_enabled, true)
     or not coalesce(reminder_channel_enabled, true)
     or coalesce(new.customer_email, '') = ''
     or lower(coalesce(new.status, '')) in ('cancelled', 'no_show', 'completed') then
    return new;
  end if;

  appointment_start := to_timestamp(new.appointment_date || ' ' || new.appointment_time, 'YYYY-MM-DD HH12:MI AM')::timestamp;
  delete from public.notification_events
    where appointment_id = new.id and event_type = 'reminder' and status = 'scheduled';
  insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message, scheduled_for)
  values (new.business_id, new.id, 'reminder', 'email', new.customer_email, 'scheduled', 'Queued using owner reminder lead time', appointment_start - make_interval(hours => lead_hours));
  return new;
end;
$$;
