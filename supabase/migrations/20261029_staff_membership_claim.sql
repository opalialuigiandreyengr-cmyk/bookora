-- Phase 1: allow an authenticated invitee to claim the matching staff profile.
create or replace function public.claim_staff_membership()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare claimed_id uuid;
begin
    if auth.role() <> 'authenticated' or coalesce(auth.jwt() ->> 'email', '') = '' then
        raise exception 'Authentication is required to claim staff access.' using errcode = '42501';
    end if;
    update public.staff_members
    set user_id = auth.uid(), status = 'active', updated_at = timezone('utc'::text, now())
    where id = (
        select id from public.staff_members
        where user_id is null
          and status in ('invited', 'active')
          and lower(trim(email)) = lower(trim(auth.jwt() ->> 'email'))
        order by created_at asc
        limit 1
    )
    returning id into claimed_id;
    return claimed_id;
end;
$$;

revoke all on function public.claim_staff_membership() from public;
grant execute on function public.claim_staff_membership() to authenticated;
