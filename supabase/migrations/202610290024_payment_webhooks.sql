-- Phase 4: provider-neutral signed webhook intake foundation.
alter table public.payment_transactions add column if not exists provider text not null default '';
alter table public.payment_transactions add column if not exists provider_reference text not null default '';
create unique index if not exists idx_payment_provider_reference on public.payment_transactions (business_id, provider, provider_reference) where length(trim(provider_reference)) > 0;
