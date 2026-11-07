-- Repair deployed reminder triggers that still use a PL/pgSQL variable named
-- reminder_enabled. That name conflicts with notification_settings.reminder_enabled
-- and causes appointment inserts to fail with SQLSTATE 42702.
create or replace function public.queue_appointment_reminder_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  email_channel_is_enabled boolean;
  reminder_channel_is_enabled boolean;
  configured_lead_hours integer;
  appointment_starts_at timestamp;
begin
  select
    coalesce(settings.email_enabled, true),
    coalesce(settings.reminder_enabled, true),
    greatest(0, coalesce(settings.reminder_lead_hours, 24))
  into
    email_channel_is_enabled,
    reminder_channel_is_enabled,
    configured_lead_hours
  from public.notification_settings as settings
  where settings.business_id = new.business_id;

  if not coalesce(email_channel_is_enabled, true)
     or not coalesce(reminder_channel_is_enabled, true)
     or coalesce(new.customer_email, '') = ''
     or lower(coalesce(new.status, '')) in ('cancelled', 'no_show', 'completed') then
    return new;
  end if;

  appointment_starts_at := to_timestamp(
    new.appointment_date || ' ' || new.appointment_time,
    'YYYY-MM-DD HH12:MI AM'
  )::timestamp;

  delete from public.notification_events as event
  where event.appointment_id = new.id
    and event.event_type = 'reminder'
    and event.status = 'scheduled';

  insert into public.notification_events (
    business_id,
    appointment_id,
    event_type,
    channel,
    recipient,
    status,
    provider_message,
    scheduled_for
  )
  values (
    new.business_id,
    new.id,
    'reminder',
    'email',
    new.customer_email,
    'scheduled',
    'Queued using owner reminder lead time',
    appointment_starts_at - make_interval(hours => configured_lead_hours)
  );

  return new;
end;
$$;

revoke all on function public.queue_appointment_reminder_event() from public;
