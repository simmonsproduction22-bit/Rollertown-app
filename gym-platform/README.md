# [ProductName]

All-inclusive gym management for martial arts gyms, MMA gyms and independent coaches. It's built to replace Mindbody, Zen Planner and Booksy.

- One monthly price with every feature. No add-on tiers and no sales call.
- One transparent transaction fee (`PLATFORM_FEE_BPS`, default 300 = 3%), shown on every receipt and report.
- No marketplace commissions, no "new client" cut, no paid listings.
- Free one-click data export and free card-on-file migration.

> **Build status: first pass, stopped at a clean point.** The database, business logic, services and seed data are done and tested. **The Next.js pages and UI have not been built yet.** See [Where this stopped](#where-this-stopped).

## Stack

Next.js 15 (App Router) + TypeScript + Tailwind, Supabase (Postgres, Auth, RLS, Storage), Stripe Connect, and a Twilio-compatible SMS interface. Email goes through a Resend-compatible interface.

## Layout

```
supabase/migrations/   0001 core → 0008 storage (63 tables, all with RLS)
supabase/test/         RLS regression tests + stubs for plain Postgres
supabase/seed.sql      generated demo data (npm run seed -- --sql)
src/lib/domain/        pure business rules (splits, refunds, policy, promotion, slots, pricing, liability, retention, dunning, recurrence)
src/lib/import/        CSV field-mapping presets (Mindbody, Zen Planner, Booksy, Gymdesk) + zod row validation
src/lib/data/          Store interface (repository pattern): SupabaseStore (RLS) + MemoryStore (demo mode)
src/lib/seed/          deterministic "Demo MMA Academy" generator
src/lib/services/      checkout, refunds, bookings, check-in, waivers, ranks, reports, comms, dunning, webhooks, notify
src/lib/payments/      PaymentsProvider: Stripe Connect implementation + test-mode stub
src/lib/messaging/     SMS (console | Twilio) and email (console | Resend)
src/lib/auth/          roles/capabilities, session (demo role cookie or Supabase Auth)
tests/                 vitest: domain unit tests + service integration tests
scripts/               seed.ts, verify-schema.sh
```

## Setup

```bash
cd gym-platform
npm install
cp .env.example .env.local   # leave keys blank for demo mode
npm test                     # 59 tests
npm run typecheck
```

**Demo mode.** If the Supabase keys are empty, every service runs against an in-memory copy of the seeded demo gym, so no accounts are needed.

**Supabase**
```bash
supabase start               # or link a hosted project
supabase db reset            # applies migrations + supabase/seed.sql
# or, against a hosted project with the service role key set:
npm run seed
```

**Verify the schema and RLS against any empty Postgres:**
```bash
DATABASE_URL=postgres://... scripts/verify-schema.sh
```

### Environment variables
See `.env.example`. It holds Supabase URL/anon/service keys, Stripe secret/publishable/webhook keys, `PLATFORM_FEE_BPS`, SMS and email provider keys, and `WEBHOOK_SIGNING_SECRET`, which is also used to sign member QR codes. Secrets are read only on the server through `src/lib/env.ts`.

## Stripe Connect

The money flow uses separate charges and transfers:
1. The client is charged on the **platform** account, with `transfer_group = txn_<id>`.
2. The gym's share is transferred to the gym's connected account, and the coach's share to the coach's connected account, using `source_transaction`.
3. The platform keeps only the platform fee.

**Setup**
1. Use test keys (`sk_test_…`) and enable Connect with Express accounts.
2. `payments().onboardingLink()` creates an account and returns the onboarding link for the gym or each coach.
3. Point a webhook at the app for `payment_intent.*`, `charge.refunded` and `account.updated` (the route is a v2 item).

Without a key, `stubPayments` acts like test mode: charges succeed unless the payment method ID contains `decline`.

### How splits work (`src/lib/domain/splits.ts`)
1. fee = total × fee bps
2. net = total − fee
3. coach share = net × coach bps − per-session mat rent (never below 0). The coach's bps comes from the product's `coach_split_bps`, falling back to the coach's default.
4. gym share = the rest

The lines always add up to the exact total.

Example: Marcus's $400 boxing pack has an 85% coach split. The platform gets $12.00, Marcus $329.80 and the gym $58.20. Flat monthly rent shows up as `mat_rent_charges` and is collected by offsetting the coach's payouts.

### How refunds work (`src/lib/services/refunds.ts`)
- Staff see a policy quote first. Package rules are `unused_prorated`, `full_if_unused` or `none`.
- Refunding more than the policy allows needs `override`. That's managers only, can be switched off in settings, and is written to the audit log.
- Every split is reversed in proportion to what it was originally paid, using a largest-remainder method so the reversals add up to the refund exactly. The platform fee is refunded proportionally too.
- Lesson credits are removed (or restored) to match the refund, and every change goes to `credit_ledger`.
- Free cancellations of card-paid privates refund automatically. Late cancels charge the gym's fee.

## What's working vs stubbed

**Working and tested (59 tests, plus RLS tests on real Postgres 16):**
- **Schema and security**
  - Full schema: indexes, comments, CHECK constraints, and an exclusion constraint that stops a coach being double-booked.
  - Capacity trigger, append-only audit log, and RLS on all 63 tables.
  - RLS covers staff, desk, manager, coach (staff or independent), member/guardian and anon storefront access. Tests confirm gyms can't see each other's data.
- **Money**
  - Revenue splits, refund reversal, cancellation policy and package refund quotes.
  - Sibling discount, intro offers limited to one per member, and package liability.
  - Dunning retry schedule.
- **Scheduling and booking**
  - Recurring classes and timezone-aware private-lesson slots with buffers, classes and time off.
  - Class booking with credits or membership, the waitlist with automatic promotion, late-cancel fees and staff overrides.
  - Private and partner/small-group lessons paid with credits or card.
- **Waivers and check-in**
  - Waiver versioning with re-sign detection, guardians signing for minors, and a signed PDF stored per member.
  - Check-in by kiosk, staff or signed day-scoped QR code, with warnings for waiver, balance and pickup notes.
- **Martial arts**
  - Rank systems for BJJ adult, BJJ kids and Muay Thai prajioud.
  - Attendance-based stripe and belt eligibility, promotions, testing results that auto-promote, and PDF certificates.
- **Growth and communication**
  - Leads pipeline, automations engine, two-way SMS inbox (inbound routing, STOP opt-out) and retention alerts.
  - Review requests.
  - Reports: revenue by party, attendance, growth and churn, MRR, coach payouts with rent, package liability, class fill.
- **Data in and out**
  - CSV import mapping and validation for Mindbody, Zen Planner, Booksy and Gymdesk.
  - Outgoing webhooks signed with HMAC.
- **Seed data**
  - Demo MMA Academy: 2 locations, 5 rooms, 3 coaches (one independent), 40 members (28 adults and 12 kids with guardians), and 22 weekly classes.
  - About 1,100 bookings, 188 transactions, packages, one refund, a failed payment in dunning, and a card migration in progress.
  - A 5-fighter team with records, camps, weigh-ins and expiring documents, plus leads, threads and automations.

**Stubbed until keys are added:** Stripe (stub provider), SMS and email (logged to the console), and Supabase (in-memory demo store). In demo mode, waiver PDFs aren't uploaded to Storage.

## Where this stopped

The stop came after `src/lib/services/dunning.ts`. Everything up to there typechecks, passes tests and is committed.

**Not built yet (next session, in this order):**
1. **Remaining services:**
   - import runner (persisting validated rows)
   - one-click export ZIP (CSVs plus waiver PDFs)
   - API key create/verify
   - coach dashboard aggregates
   - POS sale with stock decrement
   - member CRUD and profile aggregate
   - card-migration matching
   - fight record summaries
2. **App shell:** `src/app` layout, Tailwind theme (dark, high contrast), UI kit, demo role switcher, login.
3. **Pages:**
   - marketing and pricing, the onboarding wizard, and the owner dashboard
   - schedule (day, week, coach and room views)
   - members list and profile
   - coach dashboard and public coach page
   - payments, payouts and refunds
   - reports
   - inbox, automations and leads
   - ranks and curriculum
   - fight team
   - point of sale and import wizard
   - settings, and developers (API keys and webhooks)
   - kiosk, the member PWA, and the public gym booking page
4. **Routes:**
   - `/api/v1/*` public REST API
   - Stripe and SMS webhooks
   - cron endpoints for automations, reminders and dunning
   - `/api/export`

## v2 priorities (after the pages above)
1. Stripe webhook reconciliation, Stripe Billing subscriptions for autopay, and Stripe's card-updater webhooks.
2. Supabase Auth magic-link sign-in, invites by role, and per-location staff scoping.
3. Playwright end-to-end tests for booking, checkout and refunds.
4. Offline-capable kiosk, plus a PWA install and push notifications.
5. Lock down which member columns members can update, using column grants or RPCs.
6. Rate limiting on public routes (lead form, email-only booking).
7. Video uploads for curriculum, family billing roll-ups, and multi-gym owner switching.

## Product name ideas
1. **Matwork**
2. **Gi & Glove**
3. **Cornerman**
4. **Roundbell**
5. **Dojo Ledger**
