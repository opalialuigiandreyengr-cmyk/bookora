-- Phase 8: owner-managed scoped API and webhook credentials.
create extension if not exists pgcrypto;

create table if not exists public.api_tokens (
  id uuid default gen_random_uuid() primary key,
  business_id uuid references auth.users(id) on delete cascade not null,
  token_hash text not null unique,
  token_prefix text not null,
  scopes text[] not null default array['webhooks:write']::text[],
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  last_used_at timestamp with time zone,
  revoked_at timestamp with time zone,
  constraint api_tokens_scopes_check check (scopes <@ array['webhooks:write', 'api:read', 'api:write']::text[])
);
create index if not exists idx_api_tokens_business on public.api_tokens (business_id, created_at desc);
alter table public.api_tokens enable row level security;
drop policy if exists "Owners can view API tokens" on public.api_tokens;
create policy "Owners can view API tokens" on public.api_tokens for select to authenticated using (auth.uid() = business_id);
grant select on public.api_tokens to authenticated;

create or replace function public.issue_api_token(p_scopes text[] default array['webhooks:write']::text[])
returns table (id uuid, token text, token_prefix text, scopes text[])
language plpgsql security definer set search_path = public
as $$
declare raw_token text; next_scopes text[];
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  next_scopes := coalesce(p_scopes, array['webhooks:write']::text[]);
  if next_scopes = '{}'::text[] or not (next_scopes <@ array['webhooks:write', 'api:read', 'api:write']::text[]) then raise exception 'Invalid API token scope.' using errcode = '22023'; end if;
  raw_token := 'bo_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  return query insert into public.api_tokens (business_id, token_hash, token_prefix, scopes)
    values (auth.uid(), encode(digest(raw_token, 'sha256'), 'hex'), left(raw_token, 11), next_scopes)
    returning api_tokens.id, raw_token, api_tokens.token_prefix, api_tokens.scopes;
end;
$$;
revoke all on function public.issue_api_token(text[]) from public;
grant execute on function public.issue_api_token(text[]) to authenticated;

create or replace function public.revoke_api_token(p_token_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.api_tokens set revoked_at = timezone('utc'::text, now()) where id = p_token_id and business_id = auth.uid() and revoked_at is null;
end;
$$;
revoke all on function public.revoke_api_token(uuid) from public;
grant execute on function public.revoke_api_token(uuid) to authenticated;

create table if not exists public.integration_webhook_events (
  id uuid default gen_random_uuid() primary key,
  business_id uuid references auth.users(id) on delete cascade not null,
  api_token_id uuid references public.api_tokens(id) on delete set null,
  event_type text not null,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (business_id, idempotency_key)
);
alter table public.integration_webhook_events enable row level security;
drop policy if exists "Owners can view webhook events" on public.integration_webhook_events;
create policy "Owners can view webhook events" on public.integration_webhook_events for select to authenticated using (auth.uid() = business_id);
grant select on public.integration_webhook_events to authenticated;
revoke insert, update, delete on public.integration_webhook_events from anon, authenticated;
