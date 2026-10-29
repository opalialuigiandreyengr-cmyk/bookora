-- Phase 8: owner-configured, signed outbound webhook delivery.
create table if not exists public.integration_webhook_endpoints (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null,
    name text not null default 'Bookora webhook',
    url text not null,
    signing_secret text not null,
    events text[] not null default array['appointment.created', 'appointment.updated']::text[],
    active boolean not null default true,
    last_delivery_at timestamp with time zone,
    last_error text not null default '',
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    updated_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint integration_webhook_endpoint_url_check check (url ~* '^https://'),
    constraint integration_webhook_endpoint_name_check check (char_length(name) between 1 and 120),
    constraint integration_webhook_endpoint_secret_check check (char_length(signing_secret) between 16 and 256),
    constraint integration_webhook_endpoint_events_check check (cardinality(events) between 1 and 20)
);
create unique index if not exists idx_webhook_endpoints_business_url on public.integration_webhook_endpoints (business_id, url);
alter table public.integration_webhook_endpoints enable row level security;
drop policy if exists "Owners can view webhook endpoints" on public.integration_webhook_endpoints;
create policy "Owners can view webhook endpoints" on public.integration_webhook_endpoints for select to authenticated using (auth.uid() = business_id);
drop policy if exists "Owners can insert webhook endpoints" on public.integration_webhook_endpoints;
create policy "Owners can insert webhook endpoints" on public.integration_webhook_endpoints for insert to authenticated with check (auth.uid() = business_id);
drop policy if exists "Owners can update webhook endpoints" on public.integration_webhook_endpoints;
create policy "Owners can update webhook endpoints" on public.integration_webhook_endpoints for update to authenticated using (auth.uid() = business_id) with check (auth.uid() = business_id);
drop policy if exists "Owners can delete webhook endpoints" on public.integration_webhook_endpoints;
create policy "Owners can delete webhook endpoints" on public.integration_webhook_endpoints for delete to authenticated using (auth.uid() = business_id);
grant select, insert, update, delete on public.integration_webhook_endpoints to authenticated;

create table if not exists public.integration_webhook_deliveries (
    id uuid default gen_random_uuid() primary key,
    endpoint_id uuid references public.integration_webhook_endpoints(id) on delete cascade not null,
    business_id uuid references auth.users(id) on delete cascade not null,
    event_type text not null,
    payload jsonb not null default '{}'::jsonb,
    status text not null default 'pending',
    attempt_count integer not null default 0,
    next_attempt_at timestamp with time zone not null default timezone('utc'::text, now()),
    processing_started_at timestamp with time zone,
    response_status integer,
    response_body text not null default '',
    error_message text not null default '',
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint integration_webhook_delivery_status_check check (status in ('pending', 'processing', 'sent', 'failed')),
    constraint integration_webhook_delivery_attempt_check check (attempt_count between 0 and 5),
    constraint integration_webhook_delivery_event_check check (char_length(event_type) between 1 and 100),
    constraint integration_webhook_delivery_response_check check (char_length(response_body) <= 4000)
);
create index if not exists idx_webhook_deliveries_due on public.integration_webhook_deliveries (status, next_attempt_at);
create index if not exists idx_webhook_deliveries_business on public.integration_webhook_deliveries (business_id, created_at desc);
alter table public.integration_webhook_deliveries enable row level security;
drop policy if exists "Owners can view webhook deliveries" on public.integration_webhook_deliveries;
create policy "Owners can view webhook deliveries" on public.integration_webhook_deliveries for select to authenticated using (auth.uid() = business_id);
grant select on public.integration_webhook_deliveries to authenticated;
revoke insert, update, delete on public.integration_webhook_deliveries from anon, authenticated;

create or replace function public.queue_outbound_webhook_event()
returns trigger language plpgsql security definer set search_path = public
as $$
declare event_name text; endpoint record; event_payload jsonb;
begin
  event_name := case when tg_op = 'INSERT' then 'appointment.created' else 'appointment.updated' end;
  event_payload := jsonb_build_object('id', new.id, 'business_id', new.business_id, 'customer_name', new.customer_name, 'customer_email', new.customer_email, 'service_names', new.service_names, 'appointment_date', new.appointment_date, 'appointment_time', new.appointment_time, 'duration_minutes', new.duration_minutes, 'status', new.status, 'staff_member_id', new.staff_member_id, 'location_name', new.location_name, 'meeting_url', coalesce(new.meeting_url, ''), 'updated_at', timezone('utc'::text, now()));
  for endpoint in select id, business_id from public.integration_webhook_endpoints where business_id = new.business_id and active and event_name = any(events) loop
    insert into public.integration_webhook_deliveries (endpoint_id, business_id, event_type, payload) values (endpoint.id, endpoint.business_id, event_name, event_payload);
  end loop;
  return new;
end;
$$;
drop trigger if exists appointments_queue_outbound_webhook on public.appointments;
create trigger appointments_queue_outbound_webhook after insert or update on public.appointments for each row execute function public.queue_outbound_webhook_event();
revoke all on function public.queue_outbound_webhook_event() from public;

create or replace function public.claim_outbound_webhook_deliveries(p_limit integer default 20)
returns table (id uuid, endpoint_id uuid, business_id uuid, event_type text, payload jsonb, url text, signing_secret text, attempt_count integer)
language plpgsql security definer set search_path = public
as $$
begin
  return query
  with candidates as (
    select delivery.id from public.integration_webhook_deliveries delivery
    where (delivery.status = 'pending' and delivery.next_attempt_at <= timezone('utc'::text, now()))
       or (delivery.status = 'processing' and delivery.processing_started_at < timezone('utc'::text, now()) - interval '10 minutes')
    order by delivery.created_at asc
    for update skip locked limit greatest(1, least(coalesce(p_limit, 20), 100))
  ), claimed as (
    update public.integration_webhook_deliveries delivery
    set status = 'processing', processing_started_at = timezone('utc'::text, now()), attempt_count = least(delivery.attempt_count + 1, 5)
    from candidates where delivery.id = candidates.id returning delivery.*
  )
  select claimed.id, claimed.endpoint_id, claimed.business_id, claimed.event_type, claimed.payload, endpoint.url, endpoint.signing_secret, claimed.attempt_count
  from claimed join public.integration_webhook_endpoints endpoint on endpoint.id = claimed.endpoint_id
  where endpoint.active;
end;
$$;
revoke all on function public.claim_outbound_webhook_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_outbound_webhook_deliveries(integer) to service_role;

create or replace function public.complete_outbound_webhook_delivery(p_delivery_id uuid, p_status text, p_response_status integer default null, p_response_body text default '', p_error_message text default '')
returns void language plpgsql security definer set search_path = public
as $$
declare delivery_row public.integration_webhook_deliveries;
begin
  select * into delivery_row from public.integration_webhook_deliveries where id = p_delivery_id for update;
  if delivery_row.id is null then return; end if;
  update public.integration_webhook_deliveries
  set status = case when p_status = 'sent' then 'sent' when delivery_row.attempt_count >= 5 then 'failed' else 'pending' end,
      next_attempt_at = case when p_status = 'sent' or delivery_row.attempt_count >= 5 then timezone('utc'::text, now()) else timezone('utc'::text, now()) + make_interval(mins => least(60, power(2, delivery_row.attempt_count)::integer * 2)) end,
      processing_started_at = null, response_status = p_response_status, response_body = left(coalesce(p_response_body, ''), 4000), error_message = left(coalesce(p_error_message, ''), 1000)
  where id = p_delivery_id;
  update public.integration_webhook_endpoints set last_delivery_at = timezone('utc'::text, now()), last_error = case when p_status = 'sent' then '' else left(coalesce(p_error_message, 'Delivery failed'), 1000) end, updated_at = timezone('utc'::text, now()) where id = delivery_row.endpoint_id;
end;
$$;
revoke all on function public.complete_outbound_webhook_delivery(uuid, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.complete_outbound_webhook_delivery(uuid, text, integer, text, text) to service_role;
