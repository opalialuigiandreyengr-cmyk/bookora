create table if not exists public.block_time_events (
  id uuid default gen_random_uuid() primary key,
  business_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  event_date date not null,
  start_time text not null,
  duration_minutes integer not null default 60,
  personal_event boolean not null default false,
  notes text not null default '',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint block_time_duration_check check (duration_minutes between 5 and 1440)
);

create index if not exists idx_block_time_events_business_date on public.block_time_events (business_id, event_date, start_time);
alter table public.block_time_events enable row level security;
drop policy if exists "Owners can view block time" on public.block_time_events;
create policy "Owners can view block time" on public.block_time_events for select to authenticated using (auth.uid() = business_id);
drop policy if exists "Owners can manage block time" on public.block_time_events;
create policy "Owners can manage block time" on public.block_time_events for all to authenticated using (auth.uid() = business_id) with check (auth.uid() = business_id);
grant select, insert, update, delete on public.block_time_events to authenticated;

create or replace function public.get_public_booked_times(
    p_business_id uuid,
    p_appointment_date text
)
returns table (appointment_time text, duration_minutes integer, buffer_minutes integer)
language sql security definer set search_path = public stable
as $$
    select a.appointment_time, a.duration_minutes, coalesce(a.buffer_minutes, 0)
    from public.appointments a
    where a.business_id = p_business_id
      and a.appointment_date = p_appointment_date
      and lower(coalesce(a.status, 'pending')) not in ('cancelled', 'canceled', 'declined', 'rejected')
    union all
    select b.start_time, b.duration_minutes, 0
    from public.block_time_events b
    where b.business_id = p_business_id
      and b.event_date::text = p_appointment_date;
$$;

revoke all on function public.get_public_booked_times(uuid, text) from public;
grant execute on function public.get_public_booked_times(uuid, text) to anon, authenticated;
