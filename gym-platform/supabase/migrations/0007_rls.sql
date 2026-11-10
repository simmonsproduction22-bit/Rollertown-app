-- =============================================================================
-- 0007 — Row Level Security on EVERY table.
--
-- Access model (all policies are permissive, so they OR together):
--   * Staff (owner, manager, front_desk, head_coach, coach) read gym data.
--   * Desk (owner, manager, front_desk) write day-to-day operational tables.
--   * Managers (owner, manager) write configuration & see sensitive tables.
--   * Coaches (staff or independent) fully manage rows tied to their coach_id
--     and read the members who are their clients.
--   * Members / guardians read their own (and their children's) rows.
--   * Public (anon) can read the storefront: gym, schedule, coaches, products.
-- Public writes (lead forms, email-only bookings) go through server routes
-- that validate + rate-limit and then use the service role.
-- =============================================================================

-- 1. Enable RLS everywhere ---------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- 2. Generic gym-scoped policies --------------------------------------------
-- Config tables: staff read, managers write.
do $$
declare t text;
begin
  foreach t in array array[
    'locations','rooms','disciplines','class_types','class_series','rank_systems','ranks',
    'techniques','waiver_templates','lead_forms','automations','inventory_items',
    'testing_events','fight_events','import_jobs','mat_rent_charges'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (app.is_staff(gym_id))', t || '_staff_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (app.is_manager(gym_id)) with check (app.is_manager(gym_id))', t || '_manager_write', t);
  end loop;
end $$;

-- Operational tables: staff read, desk writes.
do $$
declare t text;
begin
  foreach t in array array[
    'members','families','guardians','class_sessions','class_bookings','check_ins',
    'private_bookings','private_booking_participants','memberships','membership_holds',
    'entitlements','credit_ledger','payment_methods','waiver_signatures','member_ranks',
    'promotions','testing_registrations','fighters','fights','weigh_ins','fight_camps',
    'fighter_documents','leads','message_threads','messages','automation_runs',
    'notifications_outbox','products','lesson_types','coach_availability','coach_time_off'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (app.is_staff(gym_id))', t || '_staff_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (app.is_desk(gym_id)) with check (app.is_desk(gym_id))', t || '_desk_write', t);
  end loop;
end $$;

-- Money tables: desk read/write (coaches see their own via coach policies).
do $$
declare t text;
begin
  foreach t in array array['transactions','transaction_items','splits','refunds','dunning_attempts'] loop
    execute format('create policy %I on public.%I for select to authenticated using (app.is_desk(gym_id))', t || '_desk_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app.is_desk(gym_id))', t || '_desk_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (app.is_desk(gym_id)) with check (app.is_desk(gym_id))', t || '_desk_update', t);
  end loop;
end $$;

-- Manager-only tables.
do $$
declare t text;
begin
  foreach t in array array['api_keys','webhook_endpoints','webhook_deliveries','payouts','card_migrations','card_migration_records'] loop
    execute format('create policy %I on public.%I for all to authenticated using (app.is_manager(gym_id)) with check (app.is_manager(gym_id))', t || '_manager_all', t);
  end loop;
end $$;

-- 3. Head coach / coach rank & fight-team management --------------------------
do $$
declare t text;
begin
  foreach t in array array['member_ranks','promotions','techniques','fights','weigh_ins','fight_camps','check_ins','class_bookings'] loop
    execute format($f$create policy %I on public.%I for all to authenticated
      using (app.has_role(gym_id, array['head_coach','coach']::app.staff_role[]))
      with check (app.has_role(gym_id, array['head_coach','coach']::app.staff_role[]))$f$, t || '_coach_write', t);
  end loop;
end $$;

-- 4. Tenancy tables -----------------------------------------------------------
create policy gyms_public_read on public.gyms for select to anon, authenticated using (is_public);
create policy gyms_member_read on public.gyms for select to authenticated
  using (exists (select 1 from public.gym_users gu where gu.gym_id = gyms.id and gu.user_id = auth.uid()));
create policy gyms_manager_update on public.gyms for update to authenticated
  using (app.is_manager(id)) with check (app.is_manager(id));
create policy gyms_owner_insert on public.gyms for insert to authenticated with check (auth.uid() is not null);
-- Creating a gym makes the creator its owner (see trigger below).

create policy profiles_self on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_staff_read on public.profiles for select to authenticated
  using (exists (
    select 1 from public.gym_users mine join public.gym_users theirs on theirs.gym_id = mine.gym_id
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id
      and mine.role in ('owner','manager','front_desk','head_coach','coach')));

create policy gym_users_self_read on public.gym_users for select to authenticated using (user_id = auth.uid());
create policy gym_users_staff_read on public.gym_users for select to authenticated using (app.is_staff(gym_id));
create policy gym_users_manager_write on public.gym_users for all to authenticated
  using (app.is_manager(gym_id)) with check (app.is_manager(gym_id) and (role <> 'owner' or app.has_role(gym_id, array['owner']::app.staff_role[])));

create policy coaches_staff_read on public.coaches for select to authenticated using (app.is_staff(gym_id));
create policy coaches_manager_write on public.coaches for all to authenticated
  using (app.is_manager(gym_id)) with check (app.is_manager(gym_id));
create policy coaches_self_update on public.coaches for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy coaches_self_read on public.coaches for select to authenticated using (user_id = auth.uid());

create policy audit_manager_read on public.audit_log for select to authenticated using (app.is_manager(gym_id));
create policy audit_staff_insert on public.audit_log for insert to authenticated
  with check (app.is_staff(gym_id) or gym_id in (select c.gym_id from public.coaches c where c.user_id = auth.uid()));

-- 5. Public storefront (anon) ------------------------------------------------
create policy locations_public on public.locations for select to anon, authenticated
  using (exists (select 1 from public.gyms g where g.id = gym_id and g.is_public));
create policy rooms_public on public.rooms for select to anon, authenticated
  using (exists (select 1 from public.gyms g where g.id = gym_id and g.is_public));
create policy disciplines_public on public.disciplines for select to anon, authenticated
  using (exists (select 1 from public.gyms g where g.id = gym_id and g.is_public));
create policy class_types_public on public.class_types for select to anon, authenticated
  using (exists (select 1 from public.gyms g where g.id = gym_id and g.is_public));
create policy class_sessions_public on public.class_sessions for select to anon, authenticated
  using (exists (select 1 from public.gyms g where g.id = gym_id and g.is_public));
create policy coaches_public on public.coaches for select to anon, authenticated
  using (is_active and exists (select 1 from public.gyms g where g.id = gym_id and g.is_public));
create policy lesson_types_public on public.lesson_types for select to anon, authenticated using (is_active);
create policy products_public on public.products for select to anon, authenticated using (is_active and is_public);
create policy availability_public on public.coach_availability for select to anon, authenticated using (true);
create policy waivers_public on public.waiver_templates for select to anon, authenticated using (is_current);
create policy rank_systems_public on public.rank_systems for select to anon, authenticated using (true);
create policy ranks_public on public.ranks for select to anon, authenticated using (true);

-- 6. Coach (staff or independent) self-service ------------------------------
do $$
declare t text;
begin
  foreach t in array array['lesson_types','products','coach_availability','coach_time_off','private_bookings','message_threads'] loop
    execute format('create policy %I on public.%I for all to authenticated using (coach_id in (select app.my_coach_ids())) with check (coach_id in (select app.my_coach_ids()))', t || '_own_coach', t);
  end loop;
  foreach t in array array['entitlements','transactions','splits','payouts','mat_rent_charges'] loop
    execute format('create policy %I on public.%I for select to authenticated using (coach_id in (select app.my_coach_ids()))', t || '_own_coach_read', t);
  end loop;
end $$;

create policy entitlements_coach_update on public.entitlements for update to authenticated
  using (coach_id in (select app.my_coach_ids())) with check (coach_id in (select app.my_coach_ids()));

-- Cross-table lookups go through SECURITY DEFINER helpers so policies never
-- reference each other in a cycle (which Postgres rejects as recursion).
create or replace function app.my_coach_booking_ids()
returns setof uuid language sql stable security definer set search_path = public, app as $$
  select b.id from public.private_bookings b where b.coach_id in (select app.my_coach_ids());
$$;
create or replace function app.my_member_booking_ids()
returns setof uuid language sql stable security definer set search_path = public, app as $$
  select p.booking_id from public.private_booking_participants p where p.member_id in (select app.my_member_ids());
$$;
create or replace function app.my_coach_client_ids()
returns setof uuid language sql stable security definer set search_path = public, app as $$
  select p.member_id from public.private_booking_participants p
    join public.private_bookings b on b.id = p.booking_id
    where b.coach_id in (select app.my_coach_ids())
  union
  select e.member_id from public.entitlements e where e.coach_id in (select app.my_coach_ids());
$$;

create policy pbp_own_coach on public.private_booking_participants for all to authenticated
  using (booking_id in (select app.my_coach_booking_ids()))
  with check (booking_id in (select app.my_coach_booking_ids()));

create policy messages_own_coach on public.messages for all to authenticated
  using (thread_id in (select id from public.message_threads where coach_id in (select app.my_coach_ids())))
  with check (thread_id in (select id from public.message_threads where coach_id in (select app.my_coach_ids())));

create policy refunds_own_coach_read on public.refunds for select to authenticated
  using (transaction_id in (select id from public.transactions where coach_id in (select app.my_coach_ids())));

-- A coach's clients: anyone with a private booking or a package with them.
create policy members_coach_clients on public.members for select to authenticated
  using (id in (select app.my_coach_client_ids()));

-- 7. Members & guardians ----------------------------------------------------
create policy members_self_read on public.members for select to authenticated using (id in (select app.my_member_ids()));
create policy members_self_update on public.members for update to authenticated
  using (id in (select app.my_member_ids())) with check (id in (select app.my_member_ids()));

do $$
declare t text;
begin
  foreach t in array array[
    'class_bookings','check_ins','memberships','entitlements','payment_methods','transactions',
    'waiver_signatures','member_ranks','promotions','testing_registrations','fighters'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (member_id in (select app.my_member_ids()))', t || '_self_read', t);
  end loop;
end $$;

-- Members can book/cancel their own classes, check in via QR, sign waivers,
-- register for testing. Business rules (capacity, policy) are enforced in the
-- server action AND by the capacity trigger below.
create policy class_bookings_self_insert on public.class_bookings for insert to authenticated
  with check (member_id in (select app.my_member_ids()));
create policy class_bookings_self_update on public.class_bookings for update to authenticated
  using (member_id in (select app.my_member_ids())) with check (member_id in (select app.my_member_ids()));
create policy check_ins_self_insert on public.check_ins for insert to authenticated
  with check (member_id in (select app.my_member_ids()) and method = 'qr');
create policy waiver_signatures_self_insert on public.waiver_signatures for insert to authenticated
  with check (member_id in (select app.my_member_ids()));
create policy testing_reg_self_insert on public.testing_registrations for insert to authenticated
  with check (member_id in (select app.my_member_ids()));

create policy guardians_self_read on public.guardians for select to authenticated
  using (guardian_user_id = auth.uid() or child_member_id in (select app.my_member_ids()));
create policy families_self_read on public.families for select to authenticated
  using (id in (select family_id from public.members where id in (select app.my_member_ids())));
create policy holds_self_read on public.membership_holds for select to authenticated
  using (membership_id in (select id from public.memberships where member_id in (select app.my_member_ids())));
create policy credit_ledger_self_read on public.credit_ledger for select to authenticated
  using (entitlement_id in (select id from public.entitlements where member_id in (select app.my_member_ids())));
create policy txn_items_self_read on public.transaction_items for select to authenticated
  using (transaction_id in (select id from public.transactions where member_id in (select app.my_member_ids())));
create policy refunds_self_read on public.refunds for select to authenticated
  using (transaction_id in (select id from public.transactions where member_id in (select app.my_member_ids())));
create policy pbp_self_read on public.private_booking_participants for select to authenticated
  using (member_id in (select app.my_member_ids()));
create policy private_bookings_self_read on public.private_bookings for select to authenticated
  using (id in (select app.my_member_booking_ids()));
create policy fights_self_read on public.fights for select to authenticated
  using (fighter_id in (select id from public.fighters where member_id in (select app.my_member_ids())));
create policy weigh_ins_self on public.weigh_ins for all to authenticated
  using (fighter_id in (select id from public.fighters where member_id in (select app.my_member_ids())))
  with check (fighter_id in (select id from public.fighters where member_id in (select app.my_member_ids())));
create policy fighter_docs_self on public.fighter_documents for all to authenticated
  using (fighter_id in (select id from public.fighters where member_id in (select app.my_member_ids())))
  with check (fighter_id in (select id from public.fighters where member_id in (select app.my_member_ids())));
create policy threads_self_read on public.message_threads for select to authenticated
  using (member_id in (select app.my_member_ids()));
create policy messages_self on public.messages for select to authenticated
  using (thread_id in (select id from public.message_threads where member_id in (select app.my_member_ids())));
create policy messages_self_insert on public.messages for insert to authenticated
  with check (direction = 'inbound' and channel = 'in_app'
    and thread_id in (select id from public.message_threads where member_id in (select app.my_member_ids())));
create policy techniques_member_read on public.techniques for select to authenticated
  using (gym_id in (select gym_id from public.members where id in (select app.my_member_ids())));
create policy testing_events_member_read on public.testing_events for select to authenticated
  using (gym_id in (select gym_id from public.members where id in (select app.my_member_ids())));

-- 8. Integrity triggers -----------------------------------------------------
-- Creating a gym grants the creator the owner role.
create or replace function app.grant_owner_on_gym_create()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if auth.uid() is not null then
    insert into public.gym_users (gym_id, user_id, role) values (new.id, auth.uid(), 'owner')
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger gyms_grant_owner after insert on public.gyms
  for each row execute function app.grant_owner_on_gym_create();

-- Capacity guard: a 'booked' row can't exceed session capacity. Overflow must
-- be inserted as 'waitlisted'. Serialized per session with an advisory lock.
create or replace function app.enforce_class_capacity()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare v_cap integer; v_booked integer;
begin
  if new.status <> 'booked' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'booked' then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.session_id::text));
  select capacity into v_cap from public.class_sessions where id = new.session_id;
  select count(*) into v_booked from public.class_bookings
    where session_id = new.session_id and status in ('booked','attended') and id <> new.id;
  if v_booked >= v_cap then
    raise exception 'CLASS_FULL' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger class_bookings_capacity before insert or update on public.class_bookings
  for each row execute function app.enforce_class_capacity();

-- Keep members.last_attended_at fresh for retention alerts.
create or replace function app.touch_last_attended()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  update public.members set last_attended_at = greatest(coalesce(last_attended_at, new.checked_in_at), new.checked_in_at)
  where id = new.member_id;
  return new;
end $$;
create trigger check_ins_touch_member after insert on public.check_ins
  for each row execute function app.touch_last_attended();

-- Audit log is append-only even for the service role path through PostgREST.
create or replace function app.block_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;
create trigger audit_log_immutable before update or delete on public.audit_log
  for each row execute function app.block_audit_mutation();

grant usage on schema app to anon, authenticated;
grant execute on all functions in schema app to anon, authenticated;
