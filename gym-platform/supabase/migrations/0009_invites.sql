-- =============================================================================
-- 0009 — Staff and coach invites
-- gym_users.user_id is NOT NULL, so a pending invite can't live there. An invite
-- holds only the SHA-256 of a one-time token; the raw token is emailed once.
-- Acceptance runs server-side (service role) after checking the signed-in
-- user's email matches the invite, then inserts the gym_users row.
-- =============================================================================

create table public.gym_invites (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references public.gyms(id) on delete cascade,
  email        citext not null,
  role         app.staff_role not null check (role in ('manager', 'front_desk', 'head_coach', 'coach', 'independent_coach')),
  coach_id     uuid references public.coaches(id) on delete cascade,
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by   uuid references auth.users(id) on delete set null,
  expires_at   timestamptz not null default now() + interval '14 days',
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users(id) on delete set null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  check (role not in ('coach', 'head_coach', 'independent_coach') or coach_id is not null)
);
create index gym_invites_gym_idx on public.gym_invites(gym_id, created_at desc);
create unique index gym_invites_one_pending on public.gym_invites(gym_id, email)
  where accepted_at is null and revoked_at is null;
comment on table public.gym_invites is 'Pending staff/coach invites. token_hash = sha256(raw token); the raw token is never stored.';

alter table public.gym_invites enable row level security;
alter table public.gym_invites force row level security;

-- Managers see and manage their gym's invites. Invitees never read this table
-- directly; the accept flow uses the service role after verifying the token.
create policy gym_invites_manager_all on public.gym_invites for all to authenticated
  using (app.is_manager(gym_id)) with check (app.is_manager(gym_id));
