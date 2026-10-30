-- Appointment duration is required by booking availability checks and calendar display.
-- Keep this idempotent so it is safe to apply to databases created from older schemas.
alter table public.appointments
  add column if not exists duration_minutes integer;

alter table public.appointments
  drop constraint if exists appointments_duration_positive_check;

alter table public.appointments
  add constraint appointments_duration_positive_check
  check (duration_minutes is null or duration_minutes > 0) not valid;
