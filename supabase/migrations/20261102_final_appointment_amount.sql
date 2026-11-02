alter table public.appointments
  add column if not exists final_total_amount numeric(12,2),
  add column if not exists final_amount_note text not null default '',
  add column if not exists final_amount_sent_at timestamp with time zone;

alter table public.appointments
  drop constraint if exists appointments_final_total_amount_check;

alter table public.appointments
  add constraint appointments_final_total_amount_check
  check (final_total_amount is null or final_total_amount >= 0) not valid;
