-- =============================================================================
-- [ProductName] 0001 — Core tenancy: gyms, locations, rooms, people, roles
-- Every tenant-owned row carries gym_id. RLS (0007) isolates gyms from each
-- other; helper functions below are SECURITY DEFINER so policies stay cheap.
-- Money is always integer cents. Percentages are integer basis points (bps).
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists app;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type app.staff_role as enum (
  'owner', 'manager', 'front_desk', 'head_coach', 'coach',
  'independent_coach', 'member', 'guardian'
);
create type app.member_status as enum ('lead', 'trial', 'active', 'frozen', 'past_due', 'cancelled');
create type app.coach_employment as enum ('staff', 'independent');
create type app.rent_model as enum ('none', 'flat_monthly', 'per_hour', 'per_session');
create type app.room_kind as enum ('mat', 'cage', 'ring', 'bag_area', 'other');

-- -----------------------------------------------------------------------------
-- Gyms (the tenant). settings holds policies, notification timing, branding.
-- -----------------------------------------------------------------------------
create table public.gyms (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(name) between 2 and 120),
  slug               citext not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  timezone           text not null default 'America/New_York',
  currency           text not null default 'usd',
  email              citext,
  phone              text,
  website            text,
  google_review_url  text,
  logo_path          text,
  brand_color        text not null default '#e11d48',
  -- Platform transaction fee in bps. Defaults to 300 (3%). Shown at checkout.
  platform_fee_bps   integer not null default 300 check (platform_fee_bps between 0 and 1000),
  stripe_account_id  text unique,
  stripe_charges_enabled boolean not null default false,
  stripe_payouts_enabled boolean not null default false,
  onboarding_step    text not null default 'gym_info',
  is_public          boolean not null default true,
  -- Policies: cancellation window, late-cancel fee, refund rules, reminders.
  settings           jsonb not null default '{
    "cancellation": {"window_hours": 12, "late_cancel_fee_cents": 1500, "no_show_fee_cents": 2000, "late_cancel_consumes_credit": true},
    "refunds": {"package_refund_mode": "unused_prorated", "membership_refund_days": 7, "allow_staff_override": true},
    "reminders": {"class_hours_before": [24, 2], "private_hours_before": [24, 2], "channels": ["email", "sms"]},
    "retention": {"inactive_days": 10, "package_low_credits": 2, "membership_expiring_days": 14},
    "booking": {"open_days_ahead": 14, "waitlist_auto_promote": true, "require_waiver": true},
    "dunning": {"retry_days": [1, 3, 5, 7], "channels": ["email", "sms"]},
    "packages": {"default_expiration_days": 90}
  }'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.gyms is 'Tenant. One row per gym business (may have up to N locations).';
comment on column public.gyms.platform_fee_bps is 'Transparent platform transaction fee in basis points. No other fees.';

create table public.locations (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  name       text not null,
  address    text,
  city       text,
  region     text,
  postal     text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index locations_gym_idx on public.locations(gym_id);

create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  name        text not null,
  kind        app.room_kind not null default 'mat',
  capacity    integer check (capacity > 0),
  created_at  timestamptz not null default now()
);
create index rooms_gym_idx on public.rooms(gym_id);
comment on table public.rooms is 'Bookable spaces inside a location: Mat 1, Cage, Ring.';

-- -----------------------------------------------------------------------------
-- People. profiles mirrors auth.users. A person can belong to many gyms with
-- different roles via gym_users.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  email      citext,
  phone      text,
  avatar_path text,
  created_at timestamptz not null default now()
);

create table public.families (
  id                 uuid primary key default gen_random_uuid(),
  gym_id             uuid not null references public.gyms(id) on delete cascade,
  name               text not null,
  billing_member_id  uuid,
  created_at         timestamptz not null default now()
);
create index families_gym_idx on public.families(gym_id);

create table public.members (
  id                 uuid primary key default gen_random_uuid(),
  gym_id             uuid not null references public.gyms(id) on delete cascade,
  user_id            uuid references auth.users(id) on delete set null,
  family_id          uuid references public.families(id) on delete set null,
  home_location_id   uuid references public.locations(id) on delete set null,
  first_name         text not null,
  last_name          text not null,
  email              citext,
  phone              text,
  date_of_birth      date,
  status             app.member_status not null default 'active',
  emergency_contact  text,
  medical_notes      text,
  pickup_notes       text,
  notes              text,
  tags               text[] not null default '{}',
  stripe_customer_id text,
  external_ref       text,
  joined_on          date not null default current_date,
  last_attended_at   timestamptz,
  sms_opt_in         boolean not null default true,
  email_opt_in       boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (gym_id, email)
);
create index members_gym_status_idx on public.members(gym_id, status);
create index members_user_idx on public.members(user_id);
create index members_family_idx on public.members(family_id);
create index members_name_idx on public.members(gym_id, last_name, first_name);
comment on column public.members.external_ref is 'ID from the source system (Mindbody, Zen Planner, ...) after import.';

alter table public.families
  add constraint families_billing_member_fk foreign key (billing_member_id)
  references public.members(id) on delete set null;

create table public.guardians (
  id                 uuid primary key default gen_random_uuid(),
  gym_id             uuid not null references public.gyms(id) on delete cascade,
  child_member_id    uuid not null references public.members(id) on delete cascade,
  guardian_member_id uuid references public.members(id) on delete set null,
  guardian_user_id   uuid references auth.users(id) on delete set null,
  full_name          text not null,
  relationship       text not null default 'parent',
  email              citext,
  phone              text,
  can_pickup         boolean not null default true,
  is_primary         boolean not null default false,
  created_at         timestamptz not null default now()
);
create index guardians_child_idx on public.guardians(child_member_id);
create index guardians_user_idx on public.guardians(guardian_user_id);

create table public.coaches (
  id                 uuid primary key default gen_random_uuid(),
  gym_id             uuid not null references public.gyms(id) on delete cascade,
  user_id            uuid references auth.users(id) on delete set null,
  display_name       text not null,
  slug               citext not null check (slug ~ '^[a-z0-9-]{2,60}$'),
  email              citext,
  phone              text,
  bio                text,
  specialties        text[] not null default '{}',
  photo_path         text,
  color              text not null default '#6366f1',
  employment         app.coach_employment not null default 'staff',
  -- Default share of private-lesson / coach-product revenue paid to the coach.
  default_coach_split_bps integer not null default 7000 check (default_coach_split_bps between 0 and 10000),
  rent_model         app.rent_model not null default 'none',
  rent_amount_cents  integer not null default 0 check (rent_amount_cents >= 0),
  stripe_account_id  text,
  stripe_payouts_enabled boolean not null default false,
  accepts_privates   boolean not null default true,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (gym_id, slug)
);
create index coaches_gym_idx on public.coaches(gym_id);
create index coaches_user_idx on public.coaches(user_id);
comment on column public.coaches.employment is 'staff = on payroll; independent = rents space and sells their own products.';

-- Role grants for a user inside a gym. One row per (gym, user, role).
create table public.gym_users (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        app.staff_role not null,
  coach_id    uuid references public.coaches(id) on delete cascade,
  member_id   uuid references public.members(id) on delete cascade,
  location_ids uuid[],
  invited_email citext,
  created_at  timestamptz not null default now(),
  unique (gym_id, user_id, role)
);
create index gym_users_user_idx on public.gym_users(user_id);
create index gym_users_gym_idx on public.gym_users(gym_id);

create table public.disciplines (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  name       text not null,
  slug       text not null,
  created_at timestamptz not null default now(),
  unique (gym_id, slug)
);

-- Immutable audit trail of sensitive actions (refunds, overrides, role changes).
create table public.audit_log (
  id          bigint generated always as identity primary key,
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  actor_user_id uuid,
  actor_label text,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  details     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index audit_log_gym_idx on public.audit_log(gym_id, created_at desc);
comment on table public.audit_log is 'Append-only. No update/delete policies exist.';

-- -----------------------------------------------------------------------------
-- Helper functions used by RLS. SECURITY DEFINER + fixed search_path.
-- -----------------------------------------------------------------------------
create or replace function app.has_role(p_gym uuid, p_roles app.staff_role[])
returns boolean language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from public.gym_users gu
    where gu.gym_id = p_gym and gu.user_id = auth.uid() and gu.role = any(p_roles)
  );
$$;

create or replace function app.is_staff(p_gym uuid)
returns boolean language sql stable security definer set search_path = public, app as $$
  select app.has_role(p_gym, array['owner','manager','front_desk','head_coach','coach']::app.staff_role[]);
$$;

create or replace function app.is_manager(p_gym uuid)
returns boolean language sql stable security definer set search_path = public, app as $$
  select app.has_role(p_gym, array['owner','manager']::app.staff_role[]);
$$;

create or replace function app.is_desk(p_gym uuid)
returns boolean language sql stable security definer set search_path = public, app as $$
  select app.has_role(p_gym, array['owner','manager','front_desk']::app.staff_role[]);
$$;

-- Coach rows the current user acts as (staff or independent).
create or replace function app.my_coach_ids()
returns setof uuid language sql stable security definer set search_path = public, app as $$
  select c.id from public.coaches c where c.user_id = auth.uid();
$$;

-- Member rows the current user may act for: themselves + children they guard.
create or replace function app.my_member_ids()
returns setof uuid language sql stable security definer set search_path = public, app as $$
  select m.id from public.members m where m.user_id = auth.uid()
  union
  select g.child_member_id from public.guardians g where g.guardian_user_id = auth.uid();
$$;

create or replace function app.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger gyms_touch before update on public.gyms
  for each row execute function app.touch_updated_at();
create trigger members_touch before update on public.members
  for each row execute function app.touch_updated_at();
