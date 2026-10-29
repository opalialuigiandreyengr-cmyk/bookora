-- Phase 5: expose a published catalog plus one explicitly requested direct service.
create or replace function public.get_public_booking_services(p_slug text, p_direct_service_id uuid default null)
returns table (id uuid, name text, description text, duration_minutes integer, price text, category_id uuid, image_url text, show_on_booking_page boolean)
language sql
security definer
set search_path = public
as $$
    select services.id, services.name, services.description, services.duration_minutes, services.price, services.category_id, services.image_url, services.show_on_booking_page
    from public.services
    join public.business_profiles profile on profile.id = services.business_id
    where profile.slug = trim(p_slug)
      and (services.show_on_booking_page = true or services.id = p_direct_service_id)
    order by services.created_at;
$$;

revoke all on function public.get_public_booking_services(text, uuid) from public;
grant execute on function public.get_public_booking_services(text, uuid) to anon, authenticated;
