-- Phase 6: owner-visible notification delivery history.
create table if not exists public.notification_events (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references auth.users(id) on delete cascade not null,
    appointment_id uuid references public.appointments(id) on delete set null,
    event_type text not null,
    channel text not null,
    recipient text not null default '',
    status text not null,
    provider_message text not null default '',
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint notification_events_type_check check (event_type in ('booking_confirmation', 'reminder', 'staff_notification', 'cancellation', 'reschedule', 'payment', 'no_show')),
    constraint notification_events_channel_check check (channel in ('email', 'sms')),
    constraint notification_events_status_check check (status in ('sent', 'failed', 'scheduled', 'processing')),
    constraint notification_events_message_check check (char_length(provider_message) <= 2000)
);

alter table public.notification_events add column if not exists attempt_count integer not null default 0;
alter table public.notification_events add column if not exists processing_started_at timestamp with time zone;
alter table public.notification_events drop constraint if exists notification_events_status_check;
alter table public.notification_events add constraint notification_events_status_check check (status in ('sent', 'failed', 'scheduled', 'processing'));

create index if not exists idx_notification_events_business_created on public.notification_events (business_id, created_at desc);
alter table public.notification_events enable row level security;

drop policy if exists "Owners can view notification events" on public.notification_events;
create policy "Owners can view notification events"
    on public.notification_events for select using (auth.uid() = business_id);

grant select on public.notification_events to authenticated;
