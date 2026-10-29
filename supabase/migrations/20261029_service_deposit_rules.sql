-- Phase 4: service-specific deposit rules.
alter table public.services add column if not exists deposit_type text not null default 'none';
alter table public.services add column if not exists deposit_amount numeric(12,2) not null default 0;
alter table public.services drop constraint if exists services_deposit_type_check;
alter table public.services add constraint services_deposit_type_check check (deposit_type in ('none', 'fixed', 'percentage'));
alter table public.services drop constraint if exists services_deposit_amount_check;
alter table public.services add constraint services_deposit_amount_check check (deposit_amount >= 0);

create or replace function public.get_public_booking_services(p_slug text, p_direct_service_id uuid default null)
returns table (id uuid, name text, description text, duration_minutes integer, price text, category_id uuid, image_url text, show_on_booking_page boolean, deposit_type text, deposit_amount numeric)
language sql security definer set search_path=public
as $$
    select services.id, services.name, services.description, services.duration_minutes, services.price, services.category_id, services.image_url, services.show_on_booking_page, services.deposit_type, services.deposit_amount
    from public.services join public.business_profiles profile on profile.id = services.business_id
    where profile.slug = trim(p_slug) and (services.show_on_booking_page = true or services.id = p_direct_service_id)
    order by services.created_at;
$$;
revoke all on function public.get_public_booking_services(text, uuid) from public;
grant execute on function public.get_public_booking_services(text, uuid) to anon, authenticated;
