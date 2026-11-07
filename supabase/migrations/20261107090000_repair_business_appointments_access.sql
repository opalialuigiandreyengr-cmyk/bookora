-- Repair business-app access to the appointments table.
--
-- Guest booking inserts are intentionally broader, but business users need
-- table privileges in addition to RLS policies to load their own calendar.
-- This migration is safe to run repeatedly and does not grant anon read
-- access to operational appointments.

alter table public.appointments enable row level security;

grant select, insert, update, delete on table public.appointments to authenticated;
grant insert on table public.appointments to anon;
revoke select, update, delete on table public.appointments from anon;

drop policy if exists "Business owners can view own appointments" on public.appointments;
create policy "Business owners can view own appointments"
    on public.appointments for select to authenticated
    using (auth.uid() = business_id);

drop policy if exists "Business owners can update own appointments" on public.appointments;
create policy "Business owners can update own appointments"
    on public.appointments for update to authenticated
    using (auth.uid() = business_id)
    with check (auth.uid() = business_id);

drop policy if exists "Business owners can delete own appointments" on public.appointments;
create policy "Business owners can delete own appointments"
    on public.appointments for delete to authenticated
    using (auth.uid() = business_id);
