-- Phase 7: owner preferences for scheduled reports.
create table if not exists public.report_schedules (
    business_id uuid references auth.users(id) on delete cascade primary key,
    recipient_email text not null default '',
    frequency text not null default 'weekly',
    send_day integer not null default 1,
    time_zone text not null default 'Asia/Manila',
    enabled boolean not null default false,
    last_sent_at timestamp with time zone,
    processing_started_at timestamp with time zone,
    updated_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint report_schedules_frequency_check check (frequency in ('weekly', 'monthly')),
    constraint report_schedules_send_day_check check (send_day between 1 and 28),
    constraint report_schedules_email_check check (recipient_email = '' or recipient_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
alter table public.report_schedules enable row level security;
alter table public.report_schedules add column if not exists time_zone text not null default 'Asia/Manila';
alter table public.report_schedules add column if not exists processing_started_at timestamp with time zone;
drop policy if exists "Owners can view report schedules" on public.report_schedules;
create policy "Owners can view report schedules" on public.report_schedules for select using (auth.uid() = business_id);
drop policy if exists "Owners can insert report schedules" on public.report_schedules;
create policy "Owners can insert report schedules" on public.report_schedules for insert with check (auth.uid() = business_id);
drop policy if exists "Owners can update report schedules" on public.report_schedules;
create policy "Owners can update report schedules" on public.report_schedules for update using (auth.uid() = business_id) with check (auth.uid() = business_id);
grant select, insert, update on public.report_schedules to authenticated;
