-- Phase 7: dimensions needed for staff and location reporting.
alter table public.appointments add column if not exists staff_member_id uuid references public.staff_members(id) on delete set null;
alter table public.appointments add column if not exists location_name text not null default '';
create index if not exists idx_appointments_staff_member_id on public.appointments (staff_member_id);
