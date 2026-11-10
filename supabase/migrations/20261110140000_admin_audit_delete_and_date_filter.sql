-- ==============================================================================
-- Add date-range filtering to Admin Audit & Security Logs + Admin Delete RPCs
-- ==============================================================================

drop function if exists public.admin_list_audit_logs(text, text, text, integer, integer);
create or replace function public.admin_list_audit_logs(
    p_search text default '',
    p_category text default 'all',
    p_severity text default 'all',
    p_limit integer default 60,
    p_offset integer default 0,
    p_date_from timestamp with time zone default null,
    p_date_to timestamp with time zone default null
)
returns table (
    id uuid,
    actor_user_id uuid,
    actor_email text,
    actor_role text,
    category text,
    action text,
    severity text,
    target_user_id uuid,
    target_business_id uuid,
    target_email text,
    summary text,
    before_state jsonb,
    after_state jsonb,
    metadata jsonb,
    created_at timestamp with time zone,
    total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_search text := lower(trim(coalesce(p_search, '')));
    v_limit integer := least(greatest(coalesce(p_limit, 60), 1), 200);
    v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
    if not public.is_platform_admin() then
        raise exception 'Platform admin privileges required.' using errcode = '42501';
    end if;

    return query
    with filtered as (
        select l.*
        from public.admin_audit_logs l
        where (coalesce(p_category, 'all') = 'all' or l.category = p_category)
          and (coalesce(p_severity, 'all') = 'all' or l.severity = p_severity)
          and (p_date_from is null or l.created_at >= p_date_from)
          and (p_date_to is null or l.created_at <= p_date_to)
          and (
              v_search = ''
              or lower(l.actor_email) like '%' || v_search || '%'
              or lower(l.target_email) like '%' || v_search || '%'
              or lower(l.action) like '%' || v_search || '%'
              or lower(l.summary) like '%' || v_search || '%'
          )
    )
    select
        f.id,
        f.actor_user_id,
        f.actor_email,
        f.actor_role,
        f.category,
        f.action,
        f.severity,
        f.target_user_id,
        f.target_business_id,
        f.target_email,
        f.summary,
        f.before_state,
        f.after_state,
        f.metadata,
        f.created_at,
        count(*) over() as total_count
    from filtered f
    order by f.created_at desc
    limit v_limit
    offset v_offset;
end;
$$;

revoke all on function public.admin_list_audit_logs(text, text, text, integer, integer, timestamp with time zone, timestamp with time zone) from public;
grant execute on function public.admin_list_audit_logs(text, text, text, integer, integer, timestamp with time zone, timestamp with time zone) to authenticated;

drop function if exists public.admin_list_user_security_logs(text, integer, integer);
create or replace function public.admin_list_user_security_logs(
    p_search text default '',
    p_limit integer default 60,
    p_offset integer default 0,
    p_date_from timestamp with time zone default null,
    p_date_to timestamp with time zone default null
)
returns table (
    id uuid,
    user_id uuid,
    user_email text,
    business_name text,
    action text,
    details text,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone,
    total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
    v_search text := lower(trim(coalesce(p_search, '')));
    v_limit integer := least(greatest(coalesce(p_limit, 60), 1), 200);
    v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
    if not public.is_platform_admin() then
        raise exception 'Platform admin privileges required.' using errcode = '42501';
    end if;

    return query
    with joined as (
        select
            usl.id,
            usl.user_id,
            coalesce(u.email, '')::text as user_email,
            coalesce(bp.business_name, '')::text as business_name,
            usl.action,
            coalesce(usl.details, '')::text as details,
            coalesce(usl.ip_address, '')::text as ip_address,
            coalesce(usl.user_agent, '')::text as user_agent,
            usl.created_at
        from public.user_security_logs usl
        left join auth.users u on u.id = usl.user_id
        left join public.business_profiles bp on bp.id = usl.user_id
        where (p_date_from is null or usl.created_at >= p_date_from)
          and (p_date_to is null or usl.created_at <= p_date_to)
          and (
              v_search = ''
              or lower(coalesce(u.email, '')) like '%' || v_search || '%'
              or lower(coalesce(bp.business_name, '')) like '%' || v_search || '%'
              or lower(usl.action) like '%' || v_search || '%'
              or lower(coalesce(usl.details, '')) like '%' || v_search || '%'
          )
    )
    select j.*, count(*) over() as total_count
    from joined j
    order by j.created_at desc
    limit v_limit
    offset v_offset;
end;
$$;

revoke all on function public.admin_list_user_security_logs(text, integer, integer, timestamp with time zone, timestamp with time zone) from public;
grant execute on function public.admin_list_user_security_logs(text, integer, integer, timestamp with time zone, timestamp with time zone) to authenticated;

-- Delete a single admin audit log entry (super_admin / admin only)
create or replace function public.admin_delete_audit_log(p_log_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_deleted integer := 0;
begin
    if not public.is_platform_admin(array['super_admin', 'admin']) then
        raise exception 'Admin privileges required to delete audit logs.' using errcode = '42501';
    end if;

    delete from public.admin_audit_logs
    where id = p_log_id;

    get diagnostics v_deleted = row_count;
    return v_deleted > 0;
end;
$$;

revoke all on function public.admin_delete_audit_log(uuid) from public;
grant execute on function public.admin_delete_audit_log(uuid) to authenticated;

-- Bulk delete / clear admin audit logs (by IDs or date range)
create or replace function public.admin_delete_audit_logs(
    p_log_ids uuid[] default null,
    p_date_from timestamp with time zone default null,
    p_date_to timestamp with time zone default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_deleted integer := 0;
begin
    if not public.is_platform_admin(array['super_admin', 'admin']) then
        raise exception 'Admin privileges required to delete audit logs.' using errcode = '42501';
    end if;

    if p_log_ids is not null and cardinality(p_log_ids) > 0 then
        delete from public.admin_audit_logs
        where id = any(p_log_ids);
    elsif p_date_from is not null or p_date_to is not null then
        delete from public.admin_audit_logs
        where (p_date_from is null or created_at >= p_date_from)
          and (p_date_to is null or created_at <= p_date_to);
    else
        delete from public.admin_audit_logs;
    end if;

    get diagnostics v_deleted = row_count;
    return v_deleted;
end;
$$;

revoke all on function public.admin_delete_audit_logs(uuid[], timestamp with time zone, timestamp with time zone) from public;
grant execute on function public.admin_delete_audit_logs(uuid[], timestamp with time zone, timestamp with time zone) to authenticated;

-- Delete a single user security log entry
create or replace function public.admin_delete_user_security_log(p_log_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_deleted integer := 0;
begin
    if not public.is_platform_admin(array['super_admin', 'admin']) then
        raise exception 'Admin privileges required to delete security logs.' using errcode = '42501';
    end if;

    delete from public.user_security_logs
    where id = p_log_id;

    get diagnostics v_deleted = row_count;
    return v_deleted > 0;
end;
$$;

revoke all on function public.admin_delete_user_security_log(uuid) from public;
grant execute on function public.admin_delete_user_security_log(uuid) to authenticated;
