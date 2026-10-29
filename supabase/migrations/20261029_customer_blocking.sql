-- Phase 3: owner-controlled customer blocking.
alter table public.clients add column if not exists blocked boolean not null default false;
create index if not exists idx_clients_business_blocked on public.clients (business_id, blocked);

create or replace function public.reject_blocked_customer_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if exists (
        select 1 from public.clients
        where business_id = new.business_id
          and blocked = true
          and length(trim(coalesce(email, ''))) > 0
          and lower(trim(email)) = lower(trim(coalesce(new.customer_email, '')))
    ) then
        raise exception 'This customer is not eligible to book online.' using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists appointments_reject_blocked_customer on public.appointments;
create trigger appointments_reject_blocked_customer
before insert on public.appointments
for each row execute function public.reject_blocked_customer_booking();

revoke all on function public.reject_blocked_customer_booking() from public;
