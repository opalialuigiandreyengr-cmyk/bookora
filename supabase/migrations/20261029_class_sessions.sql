-- Phase 9: classes and group sessions.
create table if not exists public.class_sessions (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null,
    name text not null,
    description text not null default '',
    session_date date not null,
    start_time text not null,
    duration_minutes integer not null default 60,
    capacity integer not null default 10,
    enrolled_count integer not null default 0,
    staff_member_id uuid references public.staff_members(id) on delete set null,
    status text not null default 'scheduled' check (status in ('scheduled', 'full', 'cancelled', 'completed')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint class_sessions_duration_check check (duration_minutes between 5 and 1440),
    constraint class_sessions_capacity_check check (capacity between 1 and 500),
    constraint class_sessions_enrolled_check check (enrolled_count between 0 and capacity)
);
create index if not exists idx_class_sessions_business_date on public.class_sessions (business_id, session_date, start_time);
alter table public.class_sessions enable row level security;
drop policy if exists "Owners can view class sessions" on public.class_sessions;
create policy "Owners can view class sessions" on public.class_sessions for select to authenticated using (auth.uid() = business_id);
drop policy if exists "Owners can manage class sessions" on public.class_sessions;
create policy "Owners can manage class sessions" on public.class_sessions for all to authenticated using (auth.uid() = business_id) with check (auth.uid() = business_id);
grant select, insert, update, delete on public.class_sessions to authenticated;
