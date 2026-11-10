-- =============================================================================
-- 0004 — Waivers, belts & ranks, curriculum, testing events, fight team
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Waivers (versioned). A new version marks old signatures as stale; members
-- are prompted to re-sign at next booking/check-in.
-- ---------------------------------------------------------------------------
create table public.waiver_templates (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  title       text not null,
  version     integer not null check (version > 0),
  body        text not null,
  is_current  boolean not null default true,
  required    boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (gym_id, title, version)
);
create unique index waiver_one_current_idx on public.waiver_templates(gym_id, title) where is_current;

create table public.waiver_signatures (
  id                  uuid primary key default gen_random_uuid(),
  gym_id              uuid not null references public.gyms(id) on delete cascade,
  template_id         uuid not null references public.waiver_templates(id) on delete restrict,
  template_version    integer not null,
  member_id           uuid not null references public.members(id) on delete cascade,
  signer_name         text not null,
  signer_relationship text not null default 'self' check (signer_relationship in ('self','parent','guardian')),
  signer_email        citext,
  signature_svg       text not null,
  ip_address          inet,
  user_agent          text,
  pdf_path            text,
  signed_at           timestamptz not null default now()
);
create index waiver_signatures_member_idx on public.waiver_signatures(member_id, signed_at desc);
comment on column public.waiver_signatures.pdf_path is 'Supabase Storage key in bucket "waivers": <gym_id>/<member_id>/<id>.pdf';

-- ---------------------------------------------------------------------------
-- Ranks
-- ---------------------------------------------------------------------------
create table public.rank_systems (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  discipline_id uuid references public.disciplines(id) on delete set null,
  name          text not null,
  style         text not null default 'custom' check (style in ('bjj','bjj_kids','muay_thai','karate','custom')),
  uses_stripes  boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.ranks (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  system_id       uuid not null references public.rank_systems(id) on delete cascade,
  name            text not null,
  color           text not null,
  sort_order      integer not null,
  max_stripes     integer not null default 4 check (max_stripes between 0 and 10),
  min_classes     integer not null default 0,
  min_months      integer not null default 0,
  classes_per_stripe integer,
  months_per_stripe  integer,
  requirements    text,
  unique (system_id, sort_order)
);
comment on column public.ranks.min_classes is 'Classes attended at the PREVIOUS rank before eligible for this one.';

create table public.member_ranks (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  system_id   uuid not null references public.rank_systems(id) on delete cascade,
  rank_id     uuid not null references public.ranks(id) on delete restrict,
  stripes     integer not null default 0,
  awarded_on  date not null default current_date,
  last_stripe_on date,
  unique (member_id, system_id)
);

create table public.promotions (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  system_id   uuid not null references public.rank_systems(id) on delete cascade,
  from_rank_id uuid references public.ranks(id),
  to_rank_id  uuid not null references public.ranks(id),
  from_stripes integer,
  to_stripes  integer not null default 0,
  awarded_by_coach_id uuid references public.coaches(id) on delete set null,
  testing_event_id uuid,
  notes       text,
  promoted_on date not null default current_date
);
create index promotions_member_idx on public.promotions(member_id, promoted_on desc);

create table public.techniques (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  discipline_id uuid references public.disciplines(id) on delete set null,
  rank_id     uuid references public.ranks(id) on delete set null,
  name        text not null,
  category    text,
  video_url   text check (video_url is null or video_url ~ '^https://'),
  notes       text,
  created_at  timestamptz not null default now()
);
create index techniques_rank_idx on public.techniques(rank_id);

create table public.testing_events (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  system_id   uuid references public.rank_systems(id) on delete set null,
  name        text not null,
  starts_at   timestamptz not null,
  location_id uuid references public.locations(id) on delete set null,
  fee_cents   integer not null default 0,
  capacity    integer,
  status      text not null default 'open' check (status in ('open','closed','completed')),
  created_at  timestamptz not null default now()
);

create table public.testing_registrations (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references public.gyms(id) on delete cascade,
  event_id       uuid not null references public.testing_events(id) on delete cascade,
  member_id      uuid not null references public.members(id) on delete cascade,
  target_rank_id uuid references public.ranks(id),
  transaction_id uuid references public.transactions(id) on delete set null,
  paid           boolean not null default false,
  result         text check (result in ('pass','fail','incomplete')),
  certificate_path text,
  created_at     timestamptz not null default now(),
  unique (event_id, member_id)
);

-- ---------------------------------------------------------------------------
-- Fight team
-- ---------------------------------------------------------------------------
create table public.fighters (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references public.gyms(id) on delete cascade,
  member_id      uuid not null unique references public.members(id) on delete cascade,
  nickname       text,
  disciplines    text[] not null default '{}',
  weight_class   text not null,
  walk_weight_lb numeric(5,1),
  height_in      numeric(4,1),
  reach_in       numeric(4,1),
  stance         text check (stance in ('orthodox','southpaw','switch')),
  is_pro         boolean not null default false,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

create table public.fight_events (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  name       text not null,
  promotion  text,
  event_date date not null,
  venue      text,
  city       text,
  weigh_in_at timestamptz,
  created_at timestamptz not null default now()
);
create index fight_events_gym_idx on public.fight_events(gym_id, event_date);

create table public.fights (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  fighter_id  uuid not null references public.fighters(id) on delete cascade,
  event_id    uuid references public.fight_events(id) on delete set null,
  event_name  text,
  fight_date  date not null,
  opponent    text not null,
  discipline  text not null default 'mma',
  level       text not null check (level in ('amateur','pro')),
  weight_class text,
  result      text check (result in ('win','loss','draw','nc')),
  method      text check (method in ('ko','tko','submission','decision_unanimous','decision_split','decision_majority','dq','other')),
  round       integer,
  time        text,
  notes       text
);
create index fights_fighter_idx on public.fights(fighter_id, fight_date desc);
comment on column public.fights.result is 'NULL = upcoming bout.';

create table public.weigh_ins (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  fighter_id  uuid not null references public.fighters(id) on delete cascade,
  weighed_on  date not null default current_date,
  weight_lb   numeric(5,1) not null check (weight_lb > 50 and weight_lb < 500),
  target_lb   numeric(5,1),
  is_official boolean not null default false,
  notes       text
);
create index weigh_ins_fighter_idx on public.weigh_ins(fighter_id, weighed_on desc);

create table public.fight_camps (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  fighter_id  uuid not null references public.fighters(id) on delete cascade,
  fight_id    uuid references public.fights(id) on delete set null,
  starts_on   date not null,
  ends_on     date not null,
  target_weight_lb numeric(5,1),
  plan        jsonb not null default '[]',
  created_at  timestamptz not null default now()
);
comment on column public.fight_camps.plan is 'Array of {week, focus, sessions:[...]} objects.';

create table public.fighter_documents (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  fighter_id  uuid not null references public.fighters(id) on delete cascade,
  kind        text not null check (kind in ('medical','license','bloodwork','eye_exam','id','other')),
  title       text not null,
  file_path   text,
  issued_on   date,
  expires_on  date,
  created_at  timestamptz not null default now()
);
create index fighter_documents_expiry_idx on public.fighter_documents(gym_id, expires_on);
