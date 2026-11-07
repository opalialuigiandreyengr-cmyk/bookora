-- Phase 6: owner recovery for failed notification delivery.
create or replace function public.retry_notification_event(p_event_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare changed boolean; affected integer;
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  update public.notification_events
     set status = 'scheduled', provider_message = 'Retry requested by owner', processing_started_at = null
   where id = p_event_id
     and business_id = auth.uid()
     and status = 'failed'
     and attempt_count < 5;
  get diagnostics affected = row_count;
  changed := affected > 0;
  return changed;
end;
$$;
revoke all on function public.retry_notification_event(uuid) from public;
grant execute on function public.retry_notification_event(uuid) to authenticated;
