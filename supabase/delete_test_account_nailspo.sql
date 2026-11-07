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
    r record;
begin
    -- Safety guard: never allow target ID to match the protected real business ID
    if v_test_id = v_real_id then
        raise exception 'Safety abort: test ID matches protected real business ID!';
    end if;

    -- 1. Unlink storage.objects ownership from test user so auth.users deletion succeeds
    if to_regclass('storage.objects') is not null then
        begin
            update storage.objects
            set owner = null, owner_id = null
            where (owner = v_test_id or owner_id = v_test_id::text)
              and coalesce(owner::text, '') <> v_real_id::text;
        exception when others then
            null;
        end;
    end if;

    -- 2. Dynamically delete records for v_test_id from every public table that has a business_id column
    -- (Child join tables like staff_service_assignments cascade automatically)
    for r in
        select c.table_name
        from information_schema.columns c
        join information_schema.tables t
          on t.table_schema = c.table_schema
         and t.table_name = c.table_name
        where c.table_schema = 'public'
          and c.column_name = 'business_id'
          and t.table_type = 'BASE TABLE'
        order by
            case c.table_name
                when 'payment_transactions' then 1
                when 'appointments' then 2
                when 'client_memberships' then 3
                when 'clients' then 4
                when 'class_sessions' then 5
                when 'staff_members' then 6
                when 'service_packages' then 7
                when 'services' then 8
                when 'service_categories' then 9
                else 10
            end
    loop
        execute format('delete from public.%I where business_id = $1 and business_id <> $2', r.table_name)
        using v_test_id, v_real_id;
    end loop;

    -- 3. Dynamically delete records for v_test_id from any public table with a user_id column (except staff_members)
    for r in
        select c.table_name
        from information_schema.columns c
        join information_schema.tables t
          on t.table_schema = c.table_schema
         and t.table_name = c.table_name
        where c.table_schema = 'public'
          and c.column_name = 'user_id'
          and c.table_name <> 'business_profiles'
          and t.table_type = 'BASE TABLE'
    loop
        execute format('delete from public.%I where user_id = $1 and user_id <> $2', r.table_name)
        using v_test_id, v_real_id;
    end loop;

    -- 4. Delete the test business profile (nailspo)
    if to_regclass('public.business_profiles') is not null then
        delete from public.business_profiles
        where id = v_test_id
          and id <> v_real_id;
    end if;

    -- 5. Delete test client auth users that belong ONLY to 'nailspo'
    -- (Never delete any user that owns a business_profile or matches the real business)
    delete from auth.users
    where id <> v_real_id
      and lower(coalesce(email, '')) <> 'nails.quim@gmail.com'
      and coalesce(raw_user_meta_data->>'client_slug', '') = v_test_slug
      and not exists (
          select 1 from public.business_profiles bp where bp.id = auth.users.id
      );

    -- 6. Delete the test business owner auth user (opalialuigiandrey.engr@gmail.com)
    delete from auth.users
    where (id = v_test_id or lower(email) = lower(v_test_email))
      and id <> v_real_id
      and lower(coalesce(email, '')) <> 'nails.quim@gmail.com';

    -- 7. Prevent ERR_HTTP2_PROTOCOL_ERROR on all remaining accounts:
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
