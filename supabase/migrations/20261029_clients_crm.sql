-- Phase 3: owner client records.
create table if not exists public.clients (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null,
    full_name text not null,
    email text not null default '',
    phone text not null default '',
    notes text not null default '',
    tags text[] not null default '{}',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.clients add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.clients add column if not exists business_slug text default '';
alter table public.clients add column if not exists notes text not null default '';
alter table public.clients add column if not exists tags text[] not null default '{}';
alter table public.clients alter column user_id drop not null;
alter table public.clients alter column business_slug set default '';

create unique index if not exists idx_clients_business_email on public.clients (business_id, lower(email)) where length(trim(email)) > 0;
create index if not exists idx_clients_business_id on public.clients (business_id);
alter table public.clients enable row level security;
drop policy if exists "Business owners can view clients" on public.clients;
create policy "Business owners can view clients" on public.clients for select to authenticated using (auth.uid() = business_id);
drop policy if exists "Business owners can insert clients" on public.clients;
create policy "Business owners can insert clients" on public.clients for insert to authenticated with check (auth.uid() = business_id);
drop policy if exists "Business owners can update clients" on public.clients;
create policy "Business owners can update clients" on public.clients for update to authenticated using (auth.uid() = business_id) with check (auth.uid() = business_id);
drop policy if exists "Business owners can delete clients" on public.clients;
create policy "Business owners can delete clients" on public.clients for delete to authenticated using (auth.uid() = business_id);
grant select, insert, update, delete on public.clients to authenticated;

create or replace function public.sync_client_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if length(trim(coalesce(new.customer_email, ''))) = 0 then return new; end if;
    update public.clients
       set full_name = coalesce(nullif(trim(new.customer_name), ''), full_name),
           phone = coalesce(nullif(trim(new.customer_phone), ''), phone),
           updated_at = timezone('utc'::text, now())
     where business_id = new.business_id
       and lower(trim(email)) = lower(trim(new.customer_email));
    if not found then
        insert into public.clients (business_id, full_name, email, phone)
        values (new.business_id, coalesce(nullif(trim(new.customer_name), ''), 'Client'), lower(trim(new.customer_email)), coalesce(new.customer_phone, ''));
    end if;
    return new;
end;
$$;

drop trigger if exists appointments_sync_client on public.appointments;
create trigger appointments_sync_client
    after insert or update of customer_name, customer_email, customer_phone on public.appointments
    for each row execute function public.sync_client_from_appointment();
revoke all on function public.sync_client_from_appointment() from public;
