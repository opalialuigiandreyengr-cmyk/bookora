-- ============================================================================
-- Migration: Add Booking Fee & Reservation Deposit to business_profiles
-- ============================================================================

alter table public.business_profiles
    add column if not exists booking_fee_enabled boolean default false;

alter table public.business_profiles
    add column if not exists booking_fee_type text default 'fixed';

alter table public.business_profiles
    add column if not exists booking_fee_amount numeric default 0;

alter table public.business_profiles
    add column if not exists booking_fee_note text default '';

