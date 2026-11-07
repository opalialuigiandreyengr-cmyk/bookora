-- ============================================================================
-- SAFE CLEANUP: Delete ONLY Test Account (nailspo / opalialuigiandrey.engr@gmail.com)
-- Test Business ID: 246fe0f0-b32c-4982-b8ed-77c828f05830
-- Protected Real Business ID: 2b6d8f52-44e7-42fd-a2e3-0a8d5a6d6ec8 (Nails.Qu)
-- ============================================================================

begin;

do $$
declare
    v_test_id constant uuid := '246fe0f0-b32c-4982-b8ed-77c828f05830';
    v_test_email constant text := 'opalialuigiandrey.engr@gmail.com';
    v_test_slug constant text := 'nailspo';
    v_real_id constant uuid := '2b6d8f52-44e7-42fd-a2e3-0a8d5a6d6ec8';
    v_tbl text;
begin
    -- Safety guard: never allow target ID to match the protected real business ID
    if v_test_id = v_real_id then
        raise exception 'Safety abort: test ID matches protected real business ID!';
    end if;

    -- 1. Delete storage bucket images (brand-assets, service-assets, booking-attachments)
    -- belonging to the test business folder or uploaded by the test account
    if to_regclass('storage.objects') is not null then
        -- Delete any appointment attachment files referenced by test appointments
        if to_regclass('public.appointments') is not null then
            delete from storage.objects
            where bucket_id = 'booking-attachments'
              and name in (
                  select peg_image_path from public.appointments
                  where business_id = v_test_id and peg_image_path is not null
                  union
                  select payment_receipt_path from public.appointments
                  where business_id = v_test_id and payment_receipt_path is not null
              );
        end if;

        -- Delete all files inside the test business folder across all buckets
        delete from storage.objects
        where (name like v_test_id::text || '/%' or owner = v_test_id or owner_id = v_test_id::text)
          and coalesce((storage.foldername(name))[1], '') <> v_real_id::text;
    end if;

    -- 2. Delete webhook deliveries and rate limits linked to test business
    if to_regclass('public.integration_webhook_deliveries') is not null
       and to_regclass('public.integration_webhook_endpoints') is not null then
        delete from public.integration_webhook_deliveries
        where endpoint_id in (
            select id from public.integration_webhook_endpoints where business_id = v_test_id
        );
    end if;

    if to_regclass('public.api_rate_limits') is not null
       and to_regclass('public.api_tokens') is not null then
        delete from public.api_rate_limits
        where token_id in (
            select id from public.api_tokens where business_id = v_test_id
        );
    end if;

    -- 3. Delete all child records in public tables where business_id = v_test_id
    foreach v_tbl in array array[
        'payment_transactions',
        'appointments',
        'client_memberships',
        'membership_plans',
        'clients',
        'class_sessions',
        'staff_service_assignments',
        'staff_members',
        'service_packages',
        'services',
        'service_categories',
        'block_time_events',
        'scheduling_settings',
        'notification_events',
        'notification_settings',
        'report_schedules',
        'integration_webhook_endpoints',
        'integration_webhook_events',
        'integration_connections',
        'api_tokens',
        'calendar_feed_tokens',
        'business_reviews'
    ]
    loop
        if to_regclass('public.' || v_tbl) is not null then
            execute format('delete from public.%I where business_id = $1 and business_id <> $2', v_tbl)
            using v_test_id, v_real_id;
        end if;
    end loop;

    -- 4. Delete security logs for test user if table exists
    if to_regclass('public.user_security_logs') is not null then
        delete from public.user_security_logs where user_id = v_test_id;
    end if;

    -- 5. Delete the test business profile (nailspo)
    if to_regclass('public.business_profiles') is not null then
        delete from public.business_profiles
        where id = v_test_id
          and id <> v_real_id;
    end if;

    -- 6. Delete test client auth users that belong ONLY to 'nailspo'
    -- (Never delete any user that owns a business_profile or matches the real business)
    delete from auth.users
    where id <> v_real_id
      and lower(coalesce(email, '')) <> 'nails.quim@gmail.com'
      and coalesce(raw_user_meta_data->>'client_slug', '') = v_test_slug
      and not exists (
          select 1 from public.business_profiles bp where bp.id = auth.users.id
      );

    -- 7. Delete the test business owner auth user (opalialuigiandrey.engr@gmail.com)
    delete from auth.users
    where (id = v_test_id or lower(email) = lower(v_test_email))
      and id <> v_real_id
      and lower(coalesce(email, '')) <> 'nails.quim@gmail.com';

    -- 8. Prevent ERR_HTTP2_PROTOCOL_ERROR on all remaining accounts:
    -- Strip duplicate 'business_profile' object or base64 data URLs from auth.users JWT metadata
    -- (Full business profile data remains safely stored in public.business_profiles)
    update auth.users
    set raw_user_meta_data = (
        raw_user_meta_data
        - 'business_profile'
        - case when coalesce(raw_user_meta_data->>'banner_url', '') like 'data:%' then 'banner_url' else '' end
        - case when coalesce(raw_user_meta_data->>'logo_url', '') like 'data:%' then 'logo_url' else '' end
        - case when coalesce(raw_user_meta_data->>'payment_receipt_url', '') like 'data:%' then 'payment_receipt_url' else '' end
    )
    where raw_user_meta_data is not null
      and (
          raw_user_meta_data ? 'business_profile'
          or coalesce(raw_user_meta_data->>'banner_url', '') like 'data:%'
          or coalesce(raw_user_meta_data->>'logo_url', '') like 'data:%'
          or coalesce(raw_user_meta_data->>'payment_receipt_url', '') like 'data:%'
      );
end $$;

commit;

-- ============================================================================
-- VERIFICATION: Confirm Nails.Qu is intact and nailspo is gone
-- ============================================================================
select
    bp.id,
    bp.business_name,
    bp.email,
    bp.slug,
    (select count(*) from public.appointments a where a.business_id = bp.id) as total_appointments,
    (select count(*) from public.clients c where c.business_id = bp.id) as total_clients
from public.business_profiles bp
order by bp.created_at asc;
