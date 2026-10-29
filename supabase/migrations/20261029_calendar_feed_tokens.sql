-- Phase 8: secure one-way calendar subscription feed.
create table if not exists public.calendar_feed_tokens (
  id uuid default gen_random_uuid() primary key,
  business_id uuid references auth.users(id) on delete cascade not null unique,
  token text not null unique,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  rotated_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.calendar_feed_tokens enable row level security;
revoke all on public.calendar_feed_tokens from anon, authenticated;

create or replace function public.rotate_calendar_feed_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_token text;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  next_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.calendar_feed_tokens (business_id, token, rotated_at)
  values (auth.uid(), next_token, timezone('utc'::text, now()))
  on conflict (business_id) do update set token = excluded.token, rotated_at = excluded.rotated_at;
  return next_token;
end;
$$;

revoke all on function public.rotate_calendar_feed_token() from public;
grant execute on function public.rotate_calendar_feed_token() to authenticated;
