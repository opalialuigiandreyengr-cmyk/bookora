-- Phase 4: prevent refund transactions from exceeding collected payments.
create or replace function public.validate_payment_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    collected numeric;
begin
    if new.transaction_type = 'refund' and new.appointment_id is not null and new.status <> 'failed' then
        select coalesce(sum(case when transaction_type = 'refund' then -amount else amount end), 0)
        into collected
        from public.payment_transactions
        where business_id = new.business_id
          and appointment_id = new.appointment_id
          and status = 'paid'
          and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
        if new.amount > greatest(0, collected) then
            raise exception 'Refund exceeds the collected amount for this appointment.' using errcode = '22023';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists payment_transactions_validate_refund on public.payment_transactions;
create trigger payment_transactions_validate_refund
before insert or update of amount, appointment_id, transaction_type, status
on public.payment_transactions
for each row execute function public.validate_payment_transaction();

revoke all on function public.validate_payment_transaction() from public;
