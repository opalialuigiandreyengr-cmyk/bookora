-- Phase 4: durable payment failure and retry state.
alter table public.payment_transactions add column if not exists retry_count integer not null default 0;
alter table public.payment_transactions add column if not exists last_retry_at timestamp with time zone;
alter table public.payment_transactions add column if not exists failure_reason text not null default '';
alter table public.payment_transactions drop constraint if exists payment_transactions_retry_count_check;
alter table public.payment_transactions add constraint payment_transactions_retry_count_check check (retry_count between 0 and 20);

create or replace function public.retry_payment_transaction(p_payment_id uuid)
returns public.payment_transactions
language plpgsql
security invoker
set search_path = public
as $$
declare result_row public.payment_transactions;
begin
    update public.payment_transactions
       set status = 'pending', retry_count = retry_count + 1, last_retry_at = timezone('utc'::text, now()), failure_reason = '', updated_at = timezone('utc'::text, now())
     where id = p_payment_id and business_id = auth.uid() and status = 'failed' and retry_count < 20
     returning * into result_row;
    if result_row.id is null then raise exception 'Payment is not eligible for retry.' using errcode = '42501'; end if;
    return result_row;
end;
$$;
revoke all on function public.retry_payment_transaction(uuid) from public;
grant execute on function public.retry_payment_transaction(uuid) to authenticated;
