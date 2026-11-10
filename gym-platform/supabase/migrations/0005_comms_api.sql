-- =============================================================================
-- 0005 — Messaging, leads, automations, notifications outbox, imports,
--        public API keys, webhooks
-- =============================================================================

create type app.lead_stage as enum ('new', 'contacted', 'trial_booked', 'trial_done', 'joined', 'lost');

create table public.leads (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  first_name      text not null,
  last_name       text,
  email           citext,
  phone           text,
  interest        text,
  source          text not null default 'web_form',
  stage           app.lead_stage not null default 'new',
  owner_coach_id  uuid references public.coaches(id) on delete set null,
  member_id       uuid references public.members(id) on delete set null,
  trial_session_id uuid references public.class_sessions(id) on delete set null,
  lost_reason     text,
  notes           text,
  created_at      timestamptz not null default now(),
  stage_changed_at timestamptz not null default now()
);
create index leads_gym_stage_idx on public.leads(gym_id, stage);

create table public.lead_forms (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  name        text not null,
  fields      jsonb not null default '["first_name","last_name","email","phone","interest"]',
  thank_you   text not null default 'Thanks! We''ll text you shortly to set up your free trial.',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Two-way SMS / email / in-app threads. coach_id set = a coach's own inbox.
create table public.message_threads (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  coach_id        uuid references public.coaches(id) on delete cascade,
  member_id       uuid references public.members(id) on delete cascade,
  lead_id         uuid references public.leads(id) on delete cascade,
  contact_name    text not null,
  contact_phone   text,
  contact_email   citext,
  last_message_at timestamptz not null default now(),
  unread_count    integer not null default 0,
  is_archived     boolean not null default false
);
create index message_threads_gym_idx on public.message_threads(gym_id, last_message_at desc);
create index message_threads_phone_idx on public.message_threads(gym_id, contact_phone);

create table public.messages (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references public.gyms(id) on delete cascade,
  thread_id    uuid not null references public.message_threads(id) on delete cascade,
  direction    text not null check (direction in ('inbound','outbound')),
  channel      text not null check (channel in ('sms','email','in_app')),
  body         text not null check (length(body) between 1 and 1600),
  status       text not null default 'sent' check (status in ('queued','sent','delivered','failed','received')),
  provider_id  text,
  sent_by_user uuid,
  automation_id uuid,
  created_at   timestamptz not null default now()
);
create index messages_thread_idx on public.messages(thread_id, created_at);

create table public.automations (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  name        text not null,
  trigger     text not null check (trigger in (
    'lead_created','trial_booked','trial_attended','trial_no_join',
    'inactive','package_low','membership_expiring','promotion_eligible',
    'payment_failed','session_completed','birthday')),
  steps       jsonb not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
comment on column public.automations.steps is 'Array of {delay_hours, channel: sms|email, template}. Templates support {{first_name}}, {{gym_name}}, {{link}}.';

create table public.automation_runs (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  member_id     uuid references public.members(id) on delete cascade,
  lead_id       uuid references public.leads(id) on delete cascade,
  step_index    integer not null default 0,
  next_run_at   timestamptz,
  status        text not null default 'running' check (status in ('running','completed','stopped')),
  created_at    timestamptz not null default now()
);
create index automation_runs_due_idx on public.automation_runs(next_run_at) where status = 'running';

-- Scheduled outbound notifications (reminders, receipts, dunning, reviews).
create table public.notifications_outbox (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  channel       text not null check (channel in ('sms','email')),
  to_address    text not null,
  subject       text,
  body          text not null,
  category      text not null check (category in ('reminder','receipt','dunning','review_request','automation','alert','waiver','other')),
  ref_id        uuid,
  send_after    timestamptz not null default now(),
  sent_at       timestamptz,
  status        text not null default 'queued' check (status in ('queued','sent','failed','cancelled')),
  error         text,
  created_at    timestamptz not null default now()
);
create index outbox_due_idx on public.notifications_outbox(send_after) where status = 'queued';

create table public.import_jobs (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  source_system text not null check (source_system in ('mindbody','zen_planner','booksy','gymdesk','generic')),
  entity        text not null check (entity in ('members','memberships','packages','attendance')),
  file_name     text,
  mapping       jsonb not null default '{}',
  status        text not null default 'draft' check (status in ('draft','validated','importing','completed','failed')),
  row_count     integer not null default 0,
  imported_count integer not null default 0,
  error_count   integer not null default 0,
  errors        jsonb not null default '[]',
  created_by    uuid,
  created_at    timestamptz not null default now()
);

-- Public REST API keys. Only a SHA-256 hash is stored; the key is shown once.
create table public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references public.gyms(id) on delete cascade,
  name         text not null,
  key_prefix   text not null,
  key_hash     text not null unique,
  scopes       text[] not null default '{read}',
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create table public.webhook_endpoints (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  url         text not null check (url ~ '^https://'),
  events      text[] not null default '{booking.created,payment.succeeded,checkin.created}',
  secret      text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.webhook_deliveries (
  id          bigint generated always as identity primary key,
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  event       text not null,
  payload     jsonb not null,
  status_code integer,
  attempt     integer not null default 1,
  delivered_at timestamptz,
  created_at  timestamptz not null default now()
);
create index webhook_deliveries_ep_idx on public.webhook_deliveries(endpoint_id, created_at desc);
