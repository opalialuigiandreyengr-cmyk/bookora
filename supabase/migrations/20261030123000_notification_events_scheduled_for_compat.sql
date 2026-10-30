-- Older production databases may have notification_events without the reminder schedule column.
alter table public.notification_events
  add column if not exists scheduled_for timestamp with time zone;

create index if not exists idx_notification_events_due
  on public.notification_events (status, scheduled_for);
