-- Phase 4: owner payment ledger.
create table if not exists public.payment_transactions (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null,
    appointment_id uuid references public.appointments(id) on delete set null,
    client_name text not null default '',
    client_email text not null default '',
    amount numeric(12,2) not null check (amount >= 0),
    currency text not null default 'PHP',
    transaction_type text not null default 'payment' check (transaction_type in ('deposit', 'payment', 'refund', 'adjustment')),
    method text not null default 'cash' check (method in ('cash', 'card', 'bank_transfer', 'e_wallet', 'other')),
    status text not null default 'paid' check (status in ('pending', 'paid', 'failed', 'refunded')),
    note text not null default '',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_payment_transactions_business_id on public.payment_transactions (business_id, created_at desc);
create index if not exists idx_payment_transactions_appointment_id on public.payment_transactions (appointment_id);
alter table public.payment_transactions enable row level security;
drop policy if exists "Business owners can view payment transactions" on public.payment_transactions;
create policy "Business owners can view payment transactions" on public.payment_transactions for select to authenticated using (auth.uid() = business_id);
drop policy if exists "Business owners can insert payment transactions" on public.payment_transactions;
create policy "Business owners can insert payment transactions" on public.payment_transactions for insert to authenticated with check (auth.uid() = business_id);
drop policy if exists "Business owners can update payment transactions" on public.payment_transactions;
create policy "Business owners can update payment transactions" on public.payment_transactions for update to authenticated using (auth.uid() = business_id) with check (auth.uid() = business_id);
drop policy if exists "Business owners can delete payment transactions" on public.payment_transactions;
create policy "Business owners can delete payment transactions" on public.payment_transactions for delete to authenticated using (auth.uid() = business_id);
grant select, insert, update, delete on public.payment_transactions to authenticated;
