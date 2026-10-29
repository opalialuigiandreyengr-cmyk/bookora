-- Phase 9: recurring appointment series metadata.
alter table public.appointments add column if not exists recurrence_rule text not null default 'none';
alter table public.appointments add column if not exists recurrence_group_id uuid;
alter table public.appointments add constraint appointments_recurrence_rule_check check (recurrence_rule in ('none', 'weekly', 'biweekly')) not valid;
create index if not exists idx_appointments_recurrence_group_id on public.appointments (recurrence_group_id);
