-- Phase 6: queue payment and deposit notifications after a transaction is paid.
create or replace function public.queue_payment_notification_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
        insert into public.notification_events (business_id, appointment_id, event_type, channel, recipient, status, provider_message)
        values (new.business_id, new.appointment_id, 'payment', 'email', coalesce(new.client_email, ''), 'scheduled', 'Queued after payment was marked paid');
    end if;
    return new;
end;
$$;

drop trigger if exists payment_transactions_queue_notification on public.payment_transactions;
create trigger payment_transactions_queue_notification
after insert or update of status on public.payment_transactions
for each row execute function public.queue_payment_notification_event();

revoke all on function public.queue_payment_notification_event() from public;
