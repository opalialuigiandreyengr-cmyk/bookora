-- Store uploaded booking attachment paths on the appointment record.
-- Keep this idempotent for databases created from older schemas.
alter table public.appointments
  add column if not exists peg_image_path text;

alter table public.appointments
  add column if not exists payment_receipt_path text;
