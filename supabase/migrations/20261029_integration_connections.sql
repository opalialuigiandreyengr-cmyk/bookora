-- Phase 8: owner-scoped integration connection state.
create table if not exists public.integration_connections (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null,
    provider text not null,
    status text not null default 'disconnected',
    external_account_label text not null default '',
    last_sync_at timestamp with time zone,
    error_message text not null default '',
    updated_at timestamp with time zone not null default timezone('utc'::text, now()),
    unique (business_id, provider),
    constraint integration_connections_provider_check check (provider in ('google_calendar', 'outlook_calendar', 'apple_calendar', 'zoom', 'webhooks', 'accounting')),
    constraint integration_connections_status_check check (status in ('connected', 'disconnected', 'error', 'pending')),
    constraint integration_connections_label_check check (char_length(external_account_label) <= 160),
    constraint integration_connections_error_check check (char_length(error_message) <= 1000)
);
alter table public.integration_connections enable row level security;
drop policy if exists "Owners can view integration connections" on public.integration_connections;
create policy "Owners can view integration connections" on public.integration_connections for select using (auth.uid() = business_id);
drop policy if exists "Owners can insert integration connections" on public.integration_connections;
create policy "Owners can insert integration connections" on public.integration_connections for insert with check (auth.uid() = business_id);
drop policy if exists "Owners can update integration connections" on public.integration_connections;
create policy "Owners can update integration connections" on public.integration_connections for update using (auth.uid() = business_id) with check (auth.uid() = business_id);
grant select, insert, update on public.integration_connections to authenticated;
