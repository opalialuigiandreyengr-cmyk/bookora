-- Phase 6: queue SMS events when the owner enables SMS notifications.
create or replace function public.queue_appointment_notification_event()
returns trigger language plpgsql security definer set search_path = public
as $$
declare next_event text; owner_email text; staff_email text; staff_enabled boolean; sms_enabled boolean;
begin
  select coalesce(ns.staff_confirmation_enabled, true), coalesce(ns.sms_enabled, false)
    into staff_enabled, sms_enabled from public.notification_settings ns where ns.business_id = new.business_id;
  if tg_op = 'INSERT' then
    if coalesce(staff_enabled, true) then
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
    if coalesce(sms_enabled, false) and coalesce(new.customer_phone, '') <> '' then
      insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message)
      values (new.business_id, new.id, 'booking_confirmation', 'sms', new.customer_phone, 'scheduled', 'Queued SMS confirmation');
    end if;
    return new;
  end if;
  if lower(coalesce(new.status, '')) = 'cancelled' and lower(coalesce(old.status, '')) <> 'cancelled' then next_event := 'cancellation';
  elsif lower(coalesce(new.status, '')) = 'no_show' and lower(coalesce(old.status, '')) <> 'no_show' then next_event := 'no_show';
  elsif (new.appointment_date is distinct from old.appointment_date or new.appointment_time is distinct from old.appointment_time) and lower(coalesce(new.status, '')) <> 'cancelled' then next_event := 'reschedule';
  else return new;
  end if;
  insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message)
  values (new.business_id, new.id, next_event, 'email', coalesce(new.customer_email, ''), 'scheduled', 'Queued by appointment state change');
  if coalesce(sms_enabled, false) and coalesce(new.customer_phone, '') <> '' then
    insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message)
    values (new.business_id, new.id, next_event, 'sms', new.customer_phone, 'scheduled', 'Queued SMS appointment state change');
  end if;
  return new;
end;
$$;
drop trigger if exists appointments_queue_notification_event on public.appointments;
create trigger appointments_queue_notification_event after update of status, appointment_date, appointment_time on public.appointments for each row execute function public.queue_appointment_notification_event();
drop trigger if exists appointments_queue_staff_notification on public.appointments;
create trigger appointments_queue_staff_notification after insert on public.appointments for each row execute function public.queue_appointment_notification_event();
