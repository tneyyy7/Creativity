-- Security P0 hardening — 2026-06-10
-- Closes three confirmed prod holes found during the live RLS audit:
--   P0-1  any authenticated user could self-grant Pro by writing public.subscriptions
--   P0-2  any authenticated user could self-grant admin / self-unban via public.profiles
--   P0-3  public.subscriptions was world-readable, leaking stripe/lemon customer ids
-- Also hardens SECURITY DEFINER helpers with a fixed search_path.
-- All statements are idempotent so re-applying (e.g. via GitHub auto-deploy) is safe.

begin;

-- ---------------------------------------------------------------------------
-- P0-1 + P0-3: subscriptions are written ONLY by webhooks (service-role, which
-- bypasses RLS) and read ONLY by their owner. Drop the client write + public
-- read policies and remove the underlying table grants.
-- ---------------------------------------------------------------------------
drop policy if exists "Allow users to insert own subscription"   on public.subscriptions;
drop policy if exists "Allow users to update own subscription"   on public.subscriptions;
drop policy if exists "Allow public read of subscription status" on public.subscriptions;
-- "Allow users to read own subscription" (USING auth.uid()=user_id) is kept.
revoke insert, update, delete on public.subscriptions from authenticated, anon;

-- ---------------------------------------------------------------------------
-- P0-2: lock privileged profile columns. The "Users can update own profile"
-- policy (USING auth.uid()=id) intentionally lets users edit their own row, but
-- RLS cannot restrict *which columns* change. A BEFORE trigger pins the
-- privileged fields to their previous values for everyone except admins and the
-- service-role backend (auth.uid() IS NULL). admin_role keeps its existing
-- dedicated guard too; we pin it here as belt-and-suspenders.
-- ---------------------------------------------------------------------------
create or replace function public.protect_privileged_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role backend (no JWT) and admins may set privileged fields.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_admin    := false;
    new.is_banned   := false;
    new.is_verified := false;
    new.admin_role  := null;
  elsif tg_op = 'UPDATE' then
    new.is_admin    := old.is_admin;
    new.is_banned   := old.is_banned;
    new.is_verified := old.is_verified;
    new.admin_role  := old.admin_role;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_privileged_profile_fields on public.profiles;
create trigger trg_protect_privileged_profile_fields
  before insert or update on public.profiles
  for each row execute function public.protect_privileged_profile_fields();

-- ---------------------------------------------------------------------------
-- P2-1: pin search_path on the SECURITY DEFINER helpers that were missing it.
-- ---------------------------------------------------------------------------
-- Privilege-decision helpers used inside RLS policies. The broader set of
-- SECURITY DEFINER functions (counter triggers, admin RPCs) still needs the same
-- treatment but is tracked separately as P2 (each must be tested — some call
-- extension functions unqualified and could break under a pinned search_path).
alter function public.is_user_pro(uuid)        set search_path = public;
alter function public.has_role(admin_role_type) set search_path = public;
alter function public.is_admin()               set search_path = public;

commit;
