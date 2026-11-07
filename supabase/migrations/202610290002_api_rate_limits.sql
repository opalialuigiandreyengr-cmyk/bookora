-- Phase 8: atomic per-token API rate limiting.
create table if not exists public.api_rate_limits (
    token_id uuid references public.api_tokens(id) on delete cascade primary key,
    window_started_at timestamp with time zone not null default timezone('utc'::text, now()),
    request_count integer not null default 0 check (request_count >= 0),
    updated_at timestamp with time zone not null default timezone('utc'::text, now())
);
alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from anon, authenticated;

create or replace function public.consume_api_rate_limit(p_token_id uuid, p_limit integer default 120)
returns boolean language plpgsql security definer set search_path = public
as $$
declare current_count integer;
begin
    if p_limit < 1 then raise exception 'Rate limit must be positive.' using errcode = '22023'; end if;
    insert into public.api_rate_limits (token_id, window_started_at, request_count, updated_at)
    values (p_token_id, timezone('utc'::text, now()), 1, timezone('utc'::text, now()))
    on conflict (token_id) do update
    set window_started_at = case when timezone('utc'::text, now()) - api_rate_limits.window_started_at >= interval '1 minute' then timezone('utc'::text, now()) else api_rate_limits.window_started_at end,
        request_count = case when timezone('utc'::text, now()) - api_rate_limits.window_started_at >= interval '1 minute' then 1 else api_rate_limits.request_count + 1 end,
        updated_at = timezone('utc'::text, now())
    returning request_count into current_count;
    return coalesce(current_count, 0) <= p_limit;
end;
$$;
revoke all on function public.consume_api_rate_limit(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(uuid, integer) to service_role;
