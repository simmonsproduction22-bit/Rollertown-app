-- =============================================================================
-- 0006 — Reporting views. All views are security_invoker so the caller's RLS
-- applies (an independent coach only sees their own rows).
-- =============================================================================

-- Package liability: prepaid money not yet earned.
-- earned = amount_paid * credits_used / credits_total ; unearned = remainder.
create or replace view public.v_package_liability with (security_invoker = true) as
select
  e.gym_id,
  e.id               as entitlement_id,
  e.member_id,
  e.coach_id,
  e.product_id,
  e.kind,
  e.credits_total,
  e.credits_used,
  e.amount_paid_cents,
  (e.amount_paid_cents * e.credits_used / e.credits_total)                       as earned_cents,
  e.amount_paid_cents - (e.amount_paid_cents * e.credits_used / e.credits_total) as unearned_cents,
  e.expires_at,
  e.status
from public.entitlements e
where e.status = 'active';
comment on view public.v_package_liability is 'Deferred revenue per active package. Sum(unearned_cents) = package liability.';

-- Net coach earnings per transaction (after refund reversals).
create or replace view public.v_coach_earnings with (security_invoker = true) as
select
  s.gym_id,
  s.coach_id,
  t.id           as transaction_id,
  t.created_at,
  t.description,
  s.amount_cents,
  s.reversed_cents,
  s.amount_cents - s.reversed_cents as net_cents,
  s.payout_id
from public.splits s
join public.transactions t on t.id = s.transaction_id
where s.party = 'coach';

-- Monthly revenue by party, net of refunds.
create or replace view public.v_monthly_revenue with (security_invoker = true) as
select
  s.gym_id,
  date_trunc('month', t.created_at)::date as month,
  s.party,
  sum(s.amount_cents)                     as gross_cents,
  sum(s.reversed_cents)                   as reversed_cents,
  sum(s.amount_cents - s.reversed_cents)  as net_cents
from public.splits s
join public.transactions t on t.id = s.transaction_id
where t.status in ('succeeded', 'refunded', 'partially_refunded')
group by 1, 2, 3;

-- Attendance count per member (for promotion eligibility & retention).
create or replace view public.v_member_attendance with (security_invoker = true) as
select
  c.gym_id,
  c.member_id,
  count(*)                                         as total_checkins,
  count(*) filter (where c.checked_in_at > now() - interval '30 days') as last_30_days,
  max(c.checked_in_at)                             as last_checkin_at
from public.check_ins c
group by 1, 2;

-- Documents expiring within 30 days (medical, licenses).
create or replace view public.v_expiring_fighter_documents with (security_invoker = true) as
select d.*, (d.expires_on - current_date) as days_left
from public.fighter_documents d
where d.expires_on is not null and d.expires_on <= current_date + 30;
