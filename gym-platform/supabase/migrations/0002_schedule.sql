-- =============================================================================
-- 0002 — Classes, bookings, waitlists, check-ins, private lessons
-- =============================================================================

create type app.booking_status as enum (
  'booked', 'waitlisted', 'cancelled', 'late_cancelled', 'attended', 'no_show'
);
create type app.checkin_method as enum ('kiosk', 'qr', 'staff', 'api');
create type app.private_status as enum ('pending_payment', 'confirmed', 'cancelled', 'late_cancelled', 'completed', 'no_show');

create table public.class_types (
  id                  uuid primary key default gen_random_uuid(),
  gym_id              uuid not null references public.gyms(id) on delete cascade,
  discipline_id       uuid references public.disciplines(id) on delete set null,
  name                text not null,
  description         text,
  color               text not null default '#e11d48',
  default_capacity    integer not null default 30 check (default_capacity > 0),
  duration_min        integer not null default 60 check (duration_min between 15 and 300),
  is_kids             boolean not null default false,
  age_min             integer,
  age_max             integer,
  allow_drop_in       boolean not null default true,
  drop_in_price_cents integer not null default 2500,
  allow_trial         boolean not null default true,
  requires_rank_order integer,
  created_at          timestamptz not null default now()
);
create index class_types_gym_idx on public.class_types(gym_id);
comment on column public.class_types.requires_rank_order is 'Minimum rank order to book (e.g. Competition Team).';

-- A recurring rule. Sessions are materialized from series for N weeks ahead.
create table public.class_series (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  class_type_id uuid not null references public.class_types(id) on delete cascade,
  location_id   uuid references public.locations(id) on delete set null,
  room_id       uuid references public.rooms(id) on delete set null,
  coach_id      uuid references public.coaches(id) on delete set null,
  weekday       smallint not null check (weekday between 0 and 6),
  start_time    time not null,
  duration_min  integer not null check (duration_min between 15 and 300),
  capacity      integer not null check (capacity > 0),
  starts_on     date not null default current_date,
  ends_on       date,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index class_series_gym_idx on public.class_series(gym_id);
comment on column public.class_series.weekday is '0 = Sunday … 6 = Saturday, in gym timezone.';

create table public.class_sessions (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  series_id     uuid references public.class_series(id) on delete set null,
  class_type_id uuid not null references public.class_types(id) on delete cascade,
  location_id   uuid references public.locations(id) on delete set null,
  room_id       uuid references public.rooms(id) on delete set null,
  coach_id      uuid references public.coaches(id) on delete set null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  capacity      integer not null check (capacity > 0),
  is_cancelled  boolean not null default false,
  notes         text,
  created_at    timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (series_id, starts_at)
);
create index class_sessions_gym_time_idx on public.class_sessions(gym_id, starts_at);
create index class_sessions_coach_idx on public.class_sessions(coach_id, starts_at);
create index class_sessions_room_idx on public.class_sessions(room_id, starts_at);

create table public.class_bookings (
  id               uuid primary key default gen_random_uuid(),
  gym_id           uuid not null references public.gyms(id) on delete cascade,
  session_id       uuid not null references public.class_sessions(id) on delete cascade,
  member_id        uuid not null references public.members(id) on delete cascade,
  status           app.booking_status not null default 'booked',
  waitlist_position integer,
  is_trial         boolean not null default false,
  is_drop_in       boolean not null default false,
  entitlement_id   uuid,
  membership_id    uuid,
  source           text not null default 'app',
  cancelled_at     timestamptz,
  fee_cents        integer not null default 0,
  created_at       timestamptz not null default now(),
  unique (session_id, member_id)
);
create index class_bookings_member_idx on public.class_bookings(member_id, created_at desc);
create index class_bookings_session_idx on public.class_bookings(session_id, status);

create table public.check_ins (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  session_id    uuid references public.class_sessions(id) on delete set null,
  location_id   uuid references public.locations(id) on delete set null,
  method        app.checkin_method not null,
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid
);
create index check_ins_gym_time_idx on public.check_ins(gym_id, checked_in_at desc);
create index check_ins_member_idx on public.check_ins(member_id, checked_in_at desc);
comment on table public.check_ins is 'Attendance source of truth. Feeds promotion eligibility & retention.';

-- ---------------------------------------------------------------------------
-- Private lessons
-- ---------------------------------------------------------------------------
create table public.coach_availability (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  coach_id    uuid not null references public.coaches(id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),
  start_time  time not null,
  end_time    time not null,
  location_id uuid references public.locations(id) on delete set null,
  check (end_time > start_time)
);
create index coach_availability_coach_idx on public.coach_availability(coach_id, weekday);

create table public.coach_time_off (
  id        uuid primary key default gen_random_uuid(),
  gym_id    uuid not null references public.gyms(id) on delete cascade,
  coach_id  uuid not null references public.coaches(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  reason    text,
  check (ends_at > starts_at)
);
create index coach_time_off_coach_idx on public.coach_time_off(coach_id, starts_at);

create table public.lesson_types (
  id                 uuid primary key default gen_random_uuid(),
  gym_id             uuid not null references public.gyms(id) on delete cascade,
  coach_id           uuid references public.coaches(id) on delete cascade,
  name               text not null,
  description        text,
  duration_min       integer not null check (duration_min in (30, 45, 60, 90)),
  price_cents        integer not null check (price_cents >= 0),
  max_participants   integer not null default 1 check (max_participants between 1 and 8),
  per_person_price_cents integer,
  buffer_before_min  integer not null default 0 check (buffer_before_min between 0 and 60),
  buffer_after_min   integer not null default 10 check (buffer_after_min between 0 and 60),
  room_kinds         app.room_kind[] not null default '{mat}',
  is_intro           boolean not null default false,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);
create index lesson_types_coach_idx on public.lesson_types(coach_id);
comment on column public.lesson_types.per_person_price_cents is 'For partner/small-group privates. Price per participant.';

create table public.private_bookings (
  id               uuid primary key default gen_random_uuid(),
  gym_id           uuid not null references public.gyms(id) on delete cascade,
  coach_id         uuid not null references public.coaches(id) on delete cascade,
  lesson_type_id   uuid not null references public.lesson_types(id) on delete restrict,
  room_id          uuid references public.rooms(id) on delete set null,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  status           app.private_status not null default 'confirmed',
  booked_by_email  citext,
  booked_by_name   text,
  notes            text,
  entitlement_id   uuid,
  transaction_id   uuid,
  cancelled_at     timestamptz,
  reminder_sent_at timestamptz,
  created_at       timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index private_bookings_coach_time_idx on public.private_bookings(coach_id, starts_at);
create index private_bookings_gym_time_idx on public.private_bookings(gym_id, starts_at);

-- No double-booking a coach: exclusion constraint over active bookings.
create extension if not exists btree_gist;
alter table public.private_bookings add constraint private_bookings_no_overlap
  exclude using gist (coach_id with =, tstzrange(starts_at, ends_at) with &&)
  where (status in ('pending_payment', 'confirmed'));

create table public.private_booking_participants (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  booking_id uuid not null references public.private_bookings(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  price_cents integer not null default 0,
  unique (booking_id, member_id)
);
create index pbp_member_idx on public.private_booking_participants(member_id);
