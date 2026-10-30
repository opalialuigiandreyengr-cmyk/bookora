-- Keep the notification UI and queue behavior in sync. SMS and team email
-- remain visible as planned features, but are disabled until their providers
-- are ready. Client email follows the owner's channel and client toggles.
update public.notification_settings
set sms_enabled = false,
    staff_confirmation_enabled = false;

create or replace function public.queue_appointment_notification_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_event text;
  owner_email text;
  staff_email text;
  email_enabled boolean;
  customer_enabled boolean;
  staff_enabled boolean;
begin
  select coalesce(ns.email_enabled, true), coalesce(ns.customer_confirmation_enabled, true), coalesce(ns.staff_confirmation_enabled, false)
    into email_enabled, customer_enabled, staff_enabled
    from public.notification_settings ns
    where ns.business_id = new.business_id;

  if tg_op = 'INSERT' then
    if coalesce(email_enabled, true) and coalesce(customer_enabled, true) and coalesce(new.customer_email, '') <> '' then
      insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message)
      values (new.business_id, new.id, 'booking_confirmation', 'email', new.customer_email, 'scheduled', 'Queued by new appointment');
    end if;
    if coalesce(email_enabled, true) and coalesce(staff_enabled, false) then
      select u.email into owner_email from auth.users u where u.id = new.business_id;
      if coalesce(owner_email, '') <> '' then
        insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message)
        values (new.business_id, new.id, 'staff_notification', 'email', owner_email, 'scheduled', 'Queued by new appointment');
      end if;
      select sm.email into staff_email from public.staff_members sm where sm.id = new.staff_member_id and sm.business_id = new.business_id and sm.status = 'active' and coalesce(sm.email, '') <> '';
      if coalesce(staff_email, '') <> '' and lower(staff_email) <> lower(coalesce(owner_email, '')) then
        insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message)
        values (new.business_id, new.id, 'staff_notification', 'email', staff_email, 'scheduled', 'Queued for assigned staff member');
      end if;
    end if;
    return new;
  end if;

  if lower(coalesce(new.status, '')) = 'cancelled' and lower(coalesce(old.status, '')) <> 'cancelled' then
    next_event := 'cancellation';
  elsif lower(coalesce(new.status, '')) = 'no_show' and lower(coalesce(old.status, '')) <> 'no_show' then
    next_event := 'no_show';
  elsif (new.appointment_date is distinct from old.appointment_date or new.appointment_time is distinct from old.appointment_time) and lower(coalesce(new.status, '')) <> 'cancelled' then
    next_event := 'reschedule';
  else
    return new;
  end if;

  if coalesce(email_enabled, true) and coalesce(customer_enabled, true) and coalesce(new.customer_email, '') <> '' then
    insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message)
    values (new.business_id, new.id, next_event, 'email', new.customer_email, 'scheduled', 'Queued by appointment state change');
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_queue_notification_event on public.appointments;
create trigger appointments_queue_notification_event
after update of status, appointment_date, appointment_time on public.appointments
for each row execute function public.queue_appointment_notification_event();

drop trigger if exists appointments_queue_staff_notification on public.appointments;
create trigger appointments_queue_staff_notification
after insert on public.appointments
for each row execute function public.queue_appointment_notification_event();

create or replace function public.queue_appointment_reminder_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  email_enabled boolean;
  reminder_enabled boolean;
  lead_hours integer;
  appointment_start timestamp;
begin
  select coalesce(email_enabled, true), coalesce(reminder_enabled, true), greatest(0, coalesce(reminder_lead_hours, 24))
    into email_enabled, reminder_enabled, lead_hours
    from public.notification_settings
    where business_id = new.business_id;
  if not coalesce(email_enabled, true) or not coalesce(reminder_enabled, true) or coalesce(new.customer_email, '') = '' or lower(coalesce(new.status, '')) in ('cancelled', 'no_show', 'completed') then
    return new;
  end if;
  appointment_start := to_timestamp(new.appointment_date || ' ' || new.appointment_time, 'YYYY-MM-DD HH12:MI AM')::timestamp;
  delete from public.notification_events where appointment_id = new.id and event_type = 'reminder' and status = 'scheduled';
  insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message, scheduled_for)
  values (new.business_id, new.id, 'reminder', 'email', new.customer_email, 'scheduled', 'Queued using owner reminder lead time', appointment_start - make_interval(hours => lead_hours));
  return new;
end;
$$;
