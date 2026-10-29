-- Phase 2 closeout: no-show state and internal reason.
alter table public.appointments add column if not exists no_show_reason text not null default '';
alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check check (status in ('pending', 'approved', 'completed', 'cancelled', 'no_show')) not valid;
alter table public.appointments add constraint appointments_no_show_reason_check check (char_length(no_show_reason) <= 500) not valid;
