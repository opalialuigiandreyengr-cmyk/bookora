-- Phase 8: owner-managed meeting links for remote appointments.
alter table public.appointments add column if not exists meeting_url text not null default '';
alter table public.appointments drop constraint if exists appointments_meeting_url_check;
alter table public.appointments add constraint appointments_meeting_url_check check (meeting_url = '' or (char_length(meeting_url) <= 2048 and meeting_url ~* '^https://'));
