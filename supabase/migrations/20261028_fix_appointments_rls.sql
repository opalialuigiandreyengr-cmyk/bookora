-- Fix appointments insert policy for public guest bookings
drop policy if exists "Public can insert appointments" on public.appointments;
create policy "Public can insert appointments"
    on public.appointments for insert to anon, authenticated
    with check (business_id is not null);

grant insert on public.appointments to anon, authenticated;

