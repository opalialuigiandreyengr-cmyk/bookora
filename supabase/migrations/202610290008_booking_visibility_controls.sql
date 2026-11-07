-- Phase 5: owner-controlled public booking visibility.
alter table public.business_profiles add column if not exists booking_show_price boolean not null default true;
alter table public.business_profiles add column if not exists booking_show_duration boolean not null default true;
alter table public.business_profiles add column if not exists booking_show_hours boolean not null default true;
alter table public.business_profiles add column if not exists booking_show_staff boolean not null default true;
alter table public.business_profiles add column if not exists booking_show_reviews boolean not null default true;
alter table public.business_profiles add column if not exists booking_allow_customer_login boolean not null default true;
