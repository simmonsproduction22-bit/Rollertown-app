-- RLS regression tests. Run by scripts/verify-schema.sh. Fails loudly on any
-- isolation leak. Uses fixed UUIDs; everything runs in one rolled-back txn.
\o /dev/null
begin;
set local role postgres;

-- Every public table must have RLS enabled and forced, with >= 1 policy.
do $$ declare n int; begin
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relkind = 'r'
    and (not c.relrowsecurity or not c.relforcerowsecurity
         or not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname));
  if n > 0 then raise exception 'RLS FAIL: % tables without RLS/policies', n; end if;
  raise notice 'ok  RLS enabled + policies on every table';
end $$;
insert into auth.users(id) values
  ('00000000-0000-0000-0000-0000000000a1'), -- owner gym A
  ('00000000-0000-0000-0000-0000000000a2'), -- member gym A
  ('00000000-0000-0000-0000-0000000000a3'), -- independent coach gym A
  ('00000000-0000-0000-0000-0000000000b1'); -- owner gym B
insert into gyms(id, name, slug) values
  ('10000000-0000-0000-0000-00000000000a', 'Gym A', 'gym-a'),
  ('10000000-0000-0000-0000-00000000000b', 'Gym B', 'gym-b');
insert into gym_users(gym_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'owner'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'member'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a3', 'independent_coach');
insert into members(id, gym_id, user_id, first_name, last_name, email) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'Mia', 'Member', 'mia@example.com'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', null, 'Other', 'Person', 'other@example.com'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000b', null, 'Bob', 'GymB', 'bob@example.com');
insert into coaches(id, gym_id, user_id, display_name, slug, employment) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a3', 'Indie Coach', 'indie', 'independent');
insert into products(id, gym_id, coach_id, kind, name, price_cents, lesson_credits) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', 'lesson_pack', '5 privates', 40000, 5);
insert into entitlements(gym_id, member_id, product_id, coach_id, kind, credits_total, amount_paid_cents) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'lesson', 5, 40000);
insert into transactions(id, gym_id, member_id, description, subtotal_cents, total_cents, status) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000002', 'Gym membership', 15000, 15000, 'succeeded'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000003', 'Gym B thing', 5000, 5000, 'succeeded');
insert into audit_log(gym_id, action, entity) values ('10000000-0000-0000-0000-00000000000a', 'test', 'test');

create or replace function pg_temp.expect(label text, actual bigint, expected bigint) returns void language plpgsql as $$
begin
  if actual <> expected then raise exception 'RLS FAIL [%]: expected %, got %', label, expected, actual; end if;
  raise notice 'ok  %', label;
end $$;

-- Owner of gym A
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect('owner A sees only gym A members', (select count(*) from members), 2);
select pg_temp.expect('owner A sees only gym A transactions', (select count(*) from transactions), 1);
select pg_temp.expect('owner A sees audit log', (select count(*) from audit_log), 1);
select pg_temp.expect('owner A cannot see gym B member by id', (select count(*) from members where id = '20000000-0000-0000-0000-000000000003'), 0);

-- Member of gym A
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.expect('member sees only self', (select count(*) from members), 1);
select pg_temp.expect('member sees no other transactions', (select count(*) from transactions), 0);
select pg_temp.expect('member sees own package', (select count(*) from entitlements), 1);
select pg_temp.expect('member cannot read audit log', (select count(*) from audit_log), 0);
select pg_temp.expect('member cannot read api keys', (select count(*) from api_keys), 0);

-- Independent coach of gym A
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select pg_temp.expect('indie coach sees only own clients', (select count(*) from members), 1);
select pg_temp.expect('indie coach sees own product', (select count(*) from products where coach_id is not null), 1);
select pg_temp.expect('indie coach cannot see gym transactions', (select count(*) from transactions), 0);

-- Owner of gym B
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.expect('owner B sees only gym B members', (select count(*) from members), 1);
select pg_temp.expect('owner B sees no gym A packages', (select count(*) from entitlements), 0);
select pg_temp.expect('owner B sees no gym A audit', (select count(*) from audit_log), 0);

-- Cross-tenant write must fail
do $$ begin
  begin
    insert into members(gym_id, first_name, last_name) values ('10000000-0000-0000-0000-00000000000a', 'Evil', 'Insert');
    raise exception 'RLS FAIL: gym B owner inserted into gym A';
  exception when insufficient_privilege then raise notice 'ok  cross-tenant insert blocked';
  end;
end $$;

-- Anonymous storefront
reset request.jwt.claim.sub;
set local role anon;
select pg_temp.expect('anon sees public gyms', (select count(*) from gyms), 2);
select pg_temp.expect('anon sees public products', (select count(*) from products), 1);
select pg_temp.expect('anon sees no members', (select count(*) from members), 0);
select pg_temp.expect('anon sees no transactions', (select count(*) from transactions), 0);

-- Audit log is append-only
set local role postgres;
do $$ begin
  begin
    update audit_log set action = 'tampered';
    raise exception 'FAIL: audit log was mutable';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'ok  audit log immutable';
  end;
end $$;

-- Capacity trigger
insert into class_types(id, gym_id, name) values ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'Muay Thai');
insert into class_sessions(id, gym_id, class_type_id, starts_at, ends_at, capacity) values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-000000000001', now(), now() + interval '1 hour', 1);
insert into class_bookings(gym_id, session_id, member_id) values ('10000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');
do $$ begin
  begin
    insert into class_bookings(gym_id, session_id, member_id) values ('10000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002');
    raise exception 'FAIL: overbooked';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'CLASS_FULL' then raise; end if;
    raise notice 'ok  capacity enforced';
  end;
end $$;
rollback;
