# [ProductName]

All-inclusive gym management for martial arts gyms, MMA gyms and independent coaches. It's built to replace Mindbody, Zen Planner and Booksy.

- One monthly price with every feature. No add-on tiers and no sales call.
- One transparent transaction fee (`PLATFORM_FEE_BPS`, default 300 = 3%), shown on every receipt and report.
- No marketplace commissions, no "new client" cut, no paid listings.
- Free one-click data export and free card-on-file migration.

> **Build status: first draft, complete end to end.** Database, business logic, services, all pages, the REST API and webhooks are built. Every screen runs on seeded demo data with no keys set. See [What's working vs stubbed](#whats-working-vs-stubbed).

## Quick tour (demo mode)
```bash
npm install && npm run dev   # http://localhost:3000
```
- `/`: marketing site (why switch, martial arts, private coaching, one-plan pricing, FAQ, migration promise)
- `/login`: pick a role (owner, manager, front desk, head coach, staff coach, independent coach, member, parent)
- `/app`: owner dashboard; `/app/schedule` (day, week, coach and room views); `/app/members/[id]` (packages, attendance, belts, waivers, refunds, notes, SMS)
- `/app/coach`: coach dashboard; `/app/coaches`: owner view of every coach and the gym's share
- `/app/payments`, `/app/reports`, `/app/messages` (SMS inbox, lead pipeline, automations), `/app/ranks`, `/app/fight-team`, `/app/pos`, `/app/import`, `/app/settings`, `/app/developers`
- `/kiosk`: front-desk check-in (name search or QR scanner)
- `/m`: member PWA (QR code, waiver signing, bookings, packages, belt progress, family switcher); `/m/book`, `/m/privates`, `/m/pay`
- `/g/demo-mma` and `/g/demo-mma/coach/marcus-bell`: public booking with only an email
- `/onboarding`: gym setup wizard

## Stack

Next.js 15 (App Router) + TypeScript + Tailwind, Supabase (Postgres, Auth, RLS, Storage), Stripe Connect, and a Twilio-compatible SMS interface. Email goes through a Resend-compatible interface.

## Layout

```
supabase/migrations/   0001 core → 0009 invites (64 tables, all with RLS)
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
src/app/               pages: marketing, /login, /onboarding, /app/* (staff), /m/* (member PWA), /kiosk, /g/[slug] (public), /api/*
src/app/actions/       server actions (zod-validated, capability-checked, flash redirects)
src/components/        UI kit, charts, signature pad
tests/                 vitest: domain unit tests + service integration tests
scripts/               seed.ts, verify-schema.sh
```

## Setup

```bash
cd gym-platform
npm install
cp .env.example .env.local   # leave keys blank for demo mode
npm test                     # 72 tests
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

**Supabase Auth redirect URLs.** Add `${NEXT_PUBLIC_APP_URL}/auth/callback**` to the allowed redirect URLs. The trailing wildcard lets magic links carry `?next=/invite/...` back to the invite page. The callback only follows same-site paths.

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

**Working and tested (72 tests, plus 28 RLS checks on real Postgres 16):**
- **Schema and security**
  - Full schema: indexes, comments, CHECK constraints, and an exclusion constraint that stops a coach being double-booked.
  - Capacity trigger, append-only audit log, and RLS on all 64 tables.
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
- **Onboarding and team**
  - The setup wizard saves every step. It creates the gym, disciplines, and belt systems from templates (BJJ adult, BJJ kids, Muay Thai), each with editable requirements.
  - The first classes become weekly series, and sessions are created for the booking window right away. The cron keeps every series filled ahead after that.
  - Staff and coach invites work from onboarding or Settings → Roles. Each invite emails a one-time link that expires in 14 days. Only a SHA-256 hash of the token is stored, and an invite can only be accepted by someone signed in with the invited email.
  - Coach profiles are created at invite time, so splits and rent can be set before the coach accepts.
- **Data in and out**
  - CSV import mapping and validation for Mindbody, Zen Planner, Booksy and Gymdesk.
  - Outgoing webhooks signed with HMAC.
- **Seed data**
  - Demo MMA Academy: 2 locations, 5 rooms, 3 coaches (one independent), 40 members (28 adults and 12 kids with guardians), and 22 weekly classes.
  - About 1,100 bookings, 188 transactions, packages, one refund, a failed payment in dunning, and a card migration in progress.
  - A 5-fighter team with records, camps, weigh-ins and expiring documents, plus leads, threads and automations.

**Stubbed or partial:**
- Stripe, SMS and email run on stubs until keys are set. The Stripe stub declines any payment method ID containing `decline`.
- Supabase falls back to the in-memory demo store. In demo mode, waiver PDFs are generated on request and not uploaded to Storage.
- The public private-lesson booking charges a stub card in demo mode. Live mode still needs the Stripe Payment Element on the page; the server already creates the PaymentIntent.
- Memberships are billed per charge, not yet as Stripe Billing subscriptions.
- The kiosk QR input expects a USB or Bluetooth scanner, which types like a keyboard. There's no camera scanning yet.
- Rate limiting is in-memory per server instance (public forms and the API).
- Curriculum video upload UI isn't built; techniques take a URL.
- The demo store resets on server restart.

## Routes
| Route | Purpose |
|---|---|
| `GET/POST /api/v1/...` | Public REST API (Bearer API key, read/write scopes, 120 req/min, paginated `{success,data,error,meta}`) |
| `GET /api/export` | One-click ZIP of every table as CSV + all waiver PDFs (owner/manager) |
| `GET /api/waivers/[id]` | Signed waiver PDF (staff or the member/guardian) |
| `GET /api/certificates/[id]` | Belt certificate PDF |
| `POST /api/webhooks/stripe` | Stripe Connect reconciliation (signature verified) |
| `POST /api/webhooks/sms?gym=slug` | Twilio inbound SMS → two-way inbox (signature verified) |
| `GET /api/cron` | Sends due reminders, automation steps and payment retries, and creates upcoming class sessions (`Bearer $CRON_SECRET`) |
| `GET /invite/[token]` | Accept a staff or coach invite (magic-link sign-in with the invited email) |

## Verification done
- 72 vitest tests (domain unit tests + service integration tests on the demo store)
- `scripts/verify-schema.sh`: all migrations and 28 RLS checks on real Postgres 16, plus the full seed loaded under every constraint
- `next build` passes; every page returns 200 for the right roles and redirects for the wrong ones
- `tests/e2e/smoke.cjs` (Playwright): public email-only trial booking, owner partial refund, member class booking

## v2 priorities
1. **Live payments:** Stripe Payment Element on the public pages, Stripe Billing subscriptions for autopay, and full reconciliation in the Stripe webhook (charges, refunds, disputes, card-updater events).
2. **Auth hardening:** per-location staff scoping, a multi-gym switcher, and changing or removing roles from Settings → Roles.
3. **Lock down member writes:** column-level grants or RPCs, so a member can't change their own status or tags through the API.
4. **Shared rate limiting:** Redis/Upstash instead of in-memory limits, plus a CAPTCHA on public forms.
5. **Kiosk and PWA:** camera QR scanning, offline-tolerant kiosk, a service worker, and push notifications.
6. **Curriculum and testing:** video uploads to Storage, and online belt-testing registration and payment from the member app.
7. **CI:** Playwright suite (booking, checkout, refund, waiver re-sign, guardian flows) plus `scripts/verify-schema.sh` running on every PR.
8. **Accessibility pass:** axe audit with screen readers, and a light-theme toggle in the UI (tokens already exist).

## Product name ideas
1. **Matwork**
2. **Gi & Glove**
3. **Cornerman**
4. **Roundbell**
5. **Dojo Ledger**
