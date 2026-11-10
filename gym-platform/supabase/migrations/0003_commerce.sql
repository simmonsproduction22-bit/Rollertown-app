-- =============================================================================
-- 0003 — Products, memberships, packages (entitlements), payments, splits,
--        refunds, payouts, mat rent, card migration, dunning, POS inventory
-- =============================================================================

create type app.product_kind as enum (
  'membership', 'class_pack', 'lesson_pack', 'intro', 'drop_in', 'retail', 'testing_fee', 'mat_rent'
);
create type app.billing_interval as enum ('week', 'month', 'year');
create type app.membership_status as enum ('active', 'frozen', 'past_due', 'cancelled', 'expired');
create type app.entitlement_status as enum ('active', 'exhausted', 'expired', 'refunded');
create type app.txn_status as enum ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded');
create type app.split_party as enum ('gym', 'coach', 'platform');
create type app.credits_action as enum ('restore', 'remove', 'none');

create table public.products (
  id                  uuid primary key default gen_random_uuid(),
  gym_id              uuid not null references public.gyms(id) on delete cascade,
  coach_id            uuid references public.coaches(id) on delete cascade,
  kind                app.product_kind not null,
  name                text not null,
  description         text,
  price_cents         integer not null check (price_cents >= 0),
  interval            app.billing_interval,
  class_credits       integer check (class_credits > 0),
  lesson_credits      integer check (lesson_credits > 0),
  unlimited_classes   boolean not null default false,
  lesson_type_id      uuid references public.lesson_types(id) on delete set null,
  expires_after_days  integer check (expires_after_days > 0),
  coach_split_bps     integer check (coach_split_bps between 0 and 10000),
  family_eligible     boolean not null default false,
  sibling_discount_bps integer not null default 0 check (sibling_discount_bps between 0 and 10000),
  max_per_member      integer,
  is_public           boolean not null default true,
  is_active           boolean not null default true,
  stripe_price_id     text,
  created_at          timestamptz not null default now(),
  check ((kind = 'membership') = (interval is not null))
);
create index products_gym_idx on public.products(gym_id, kind) where is_active;
comment on column public.products.coach_id is 'Set when a coach sells this product (their own packages). Revenue is split.';
comment on column public.products.coach_split_bps is 'Overrides coaches.default_coach_split_bps for this product.';

create table public.memberships (
  id                     uuid primary key default gen_random_uuid(),
  gym_id                 uuid not null references public.gyms(id) on delete cascade,
  member_id              uuid not null references public.members(id) on delete cascade,
  product_id             uuid not null references public.products(id) on delete restrict,
  family_id              uuid references public.families(id) on delete set null,
  status                 app.membership_status not null default 'active',
  price_cents            integer not null,
  discount_bps           integer not null default 0,
  started_on             date not null default current_date,
  current_period_end     date not null,
  cancel_at_period_end   boolean not null default false,
  cancelled_on           date,
  stripe_subscription_id text,
  failed_payment_count   integer not null default 0,
  created_at             timestamptz not null default now()
);
create index memberships_member_idx on public.memberships(member_id);
create index memberships_gym_status_idx on public.memberships(gym_id, status);

create table public.membership_holds (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  starts_on     date not null,
  ends_on       date not null,
  reason        text,
  fee_cents     integer not null default 0,
  created_at    timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index membership_holds_m_idx on public.membership_holds(membership_id);

-- Prepaid credits: class packs, lesson packs, intro offers. The unused share of
-- amount_paid_cents is deferred revenue (package liability).
create table public.entitlements (
  id                uuid primary key default gen_random_uuid(),
  gym_id            uuid not null references public.gyms(id) on delete cascade,
  member_id         uuid not null references public.members(id) on delete cascade,
  product_id        uuid not null references public.products(id) on delete restrict,
  coach_id          uuid references public.coaches(id) on delete set null,
  transaction_id    uuid,
  kind              text not null check (kind in ('class', 'lesson')),
  credits_total     integer not null check (credits_total > 0),
  credits_used      integer not null default 0 check (credits_used >= 0),
  amount_paid_cents integer not null check (amount_paid_cents >= 0),
  purchased_at      timestamptz not null default now(),
  expires_at        timestamptz,
  status            app.entitlement_status not null default 'active',
  migrated          boolean not null default false,
  check (credits_used <= credits_total)
);
create index entitlements_member_idx on public.entitlements(member_id, status);
create index entitlements_gym_idx on public.entitlements(gym_id, status);
create index entitlements_coach_idx on public.entitlements(coach_id) where coach_id is not null;

create table public.credit_ledger (
  id             bigint generated always as identity primary key,
  gym_id         uuid not null references public.gyms(id) on delete cascade,
  entitlement_id uuid not null references public.entitlements(id) on delete cascade,
  delta          integer not null,
  reason         text not null check (reason in ('purchase','booking','cancel_restore','late_cancel','refund_restore','refund_remove','expire','adjustment','import')),
  ref_id         uuid,
  created_at     timestamptz not null default now()
);
create index credit_ledger_ent_idx on public.credit_ledger(entitlement_id);

create table public.payment_methods (
  id                 uuid primary key default gen_random_uuid(),
  gym_id             uuid not null references public.gyms(id) on delete cascade,
  member_id          uuid not null references public.members(id) on delete cascade,
  stripe_payment_method_id text,
  brand              text,
  last4              text check (last4 ~ '^[0-9]{4}$'),
  exp_month          smallint,
  exp_year           smallint,
  is_default         boolean not null default true,
  source             text not null default 'new' check (source in ('new', 'migrated', 'updater')),
  created_at         timestamptz not null default now()
);
create index payment_methods_member_idx on public.payment_methods(member_id);
comment on table public.payment_methods is 'Card metadata only. Card numbers never touch our servers (Stripe vaults them).';

create table public.transactions (
  id                    uuid primary key default gen_random_uuid(),
  gym_id                uuid not null references public.gyms(id) on delete cascade,
  member_id             uuid references public.members(id) on delete set null,
  coach_id              uuid references public.coaches(id) on delete set null,
  product_id            uuid references public.products(id) on delete set null,
  membership_id         uuid references public.memberships(id) on delete set null,
  description           text not null,
  subtotal_cents        integer not null check (subtotal_cents >= 0),
  discount_cents        integer not null default 0,
  platform_fee_cents    integer not null default 0,
  total_cents           integer not null check (total_cents >= 0),
  refunded_cents        integer not null default 0 check (refunded_cents >= 0),
  status                app.txn_status not null default 'pending',
  payer_email           citext,
  stripe_payment_intent_id text unique,
  stripe_charge_id      text,
  transfer_group        text,
  failure_reason        text,
  attempt_count         integer not null default 1,
  next_retry_at         timestamptz,
  receipt_number        text,
  created_at            timestamptz not null default now(),
  check (refunded_cents <= total_cents)
);
create index transactions_gym_time_idx on public.transactions(gym_id, created_at desc);
create index transactions_member_idx on public.transactions(member_id, created_at desc);
create index transactions_coach_idx on public.transactions(coach_id, created_at desc);
create index transactions_retry_idx on public.transactions(next_retry_at) where status = 'failed';
comment on column public.transactions.platform_fee_cents is 'The one transparent platform fee (gyms.platform_fee_bps). Shown on receipts.';

create table public.transaction_items (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references public.gyms(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  product_id     uuid references public.products(id) on delete set null,
  inventory_item_id uuid,
  name           text not null,
  quantity       integer not null default 1 check (quantity > 0),
  unit_price_cents integer not null
);
create index transaction_items_txn_idx on public.transaction_items(transaction_id);

-- How each transaction's money is divided. Sum(amount) = total_cents.
create table public.splits (
  id                 uuid primary key default gen_random_uuid(),
  gym_id             uuid not null references public.gyms(id) on delete cascade,
  transaction_id     uuid not null references public.transactions(id) on delete cascade,
  party              app.split_party not null,
  coach_id           uuid references public.coaches(id) on delete set null,
  amount_cents       integer not null check (amount_cents >= 0),
  reversed_cents     integer not null default 0 check (reversed_cents >= 0),
  stripe_transfer_id text,
  payout_id          uuid,
  created_at         timestamptz not null default now(),
  check (reversed_cents <= amount_cents),
  check ((party = 'coach') = (coach_id is not null))
);
create index splits_txn_idx on public.splits(transaction_id);
create index splits_coach_idx on public.splits(coach_id) where coach_id is not null;

create table public.refunds (
  id               uuid primary key default gen_random_uuid(),
  gym_id           uuid not null references public.gyms(id) on delete cascade,
  transaction_id   uuid not null references public.transactions(id) on delete cascade,
  amount_cents     integer not null check (amount_cents > 0),
  reason           text not null,
  credits_action   app.credits_action not null default 'none',
  credits_changed  integer not null default 0,
  policy_applied   text,
  was_override     boolean not null default false,
  stripe_refund_id text,
  created_by       uuid,
  created_at       timestamptz not null default now()
);
create index refunds_txn_idx on public.refunds(transaction_id);
create index refunds_gym_idx on public.refunds(gym_id, created_at desc);

create table public.payouts (
  id                uuid primary key default gen_random_uuid(),
  gym_id            uuid not null references public.gyms(id) on delete cascade,
  party             app.split_party not null,
  coach_id          uuid references public.coaches(id) on delete set null,
  amount_cents      integer not null,
  status            text not null default 'scheduled' check (status in ('scheduled','in_transit','paid','failed')),
  arrival_date      date,
  stripe_payout_id  text,
  created_at        timestamptz not null default now()
);
create index payouts_gym_idx on public.payouts(gym_id, arrival_date desc);

create table public.mat_rent_charges (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references public.gyms(id) on delete cascade,
  coach_id       uuid not null references public.coaches(id) on delete cascade,
  period_start   date not null,
  period_end     date not null,
  model          app.rent_model not null,
  units          numeric(8,2) not null default 1,
  amount_cents   integer not null check (amount_cents >= 0),
  status         text not null default 'pending' check (status in ('pending','collected','failed','waived')),
  collected_from text not null default 'payout_offset' check (collected_from in ('payout_offset','card')),
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (coach_id, period_start, period_end)
);
comment on column public.mat_rent_charges.collected_from is 'payout_offset = deducted from the coach''s split before transfer.';

create table public.dunning_attempts (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references public.gyms(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  attempt        integer not null,
  channel        text not null check (channel in ('email','sms','retry')),
  outcome        text not null default 'sent',
  created_at     timestamptz not null default now()
);
create index dunning_txn_idx on public.dunning_attempts(transaction_id);

-- Card-on-file migration from the gym's previous processor (Stripe-to-Stripe
-- PAN copy or processor export). Tracks progress per gym.
create table public.card_migrations (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  source_system   text not null check (source_system in ('mindbody','zen_planner','booksy','gymdesk','other')),
  source_processor text,
  status          text not null default 'not_started' check (status in ('not_started','requested','export_in_progress','received','mapping','completed','failed')),
  requested_at    timestamptz,
  completed_at    timestamptz,
  cards_expected  integer,
  cards_imported  integer not null default 0,
  cards_unmatched integer not null default 0,
  notes           text,
  created_at      timestamptz not null default now()
);
create index card_migrations_gym_idx on public.card_migrations(gym_id);

create table public.card_migration_records (
  id                 uuid primary key default gen_random_uuid(),
  gym_id             uuid not null references public.gyms(id) on delete cascade,
  migration_id       uuid not null references public.card_migrations(id) on delete cascade,
  source_customer_id text not null,
  stripe_customer_id text,
  stripe_payment_method_id text,
  email              citext,
  matched_member_id  uuid references public.members(id) on delete set null,
  status             text not null default 'pending' check (status in ('pending','matched','unmatched','attached','error')),
  error              text
);
create index cmr_migration_idx on public.card_migration_records(migration_id, status);

create table public.inventory_items (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  name        text not null,
  sku         text,
  category    text not null default 'gear',
  price_cents integer not null check (price_cents >= 0),
  stock       integer not null default 0,
  low_stock_threshold integer not null default 3,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index inventory_gym_idx on public.inventory_items(gym_id);
