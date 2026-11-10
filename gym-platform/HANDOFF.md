# Handoff: [ProductName] gym platform

All-in-one gym software for martial arts, MMA, BJJ, Muay Thai and boxing gyms and independent coaches. It's meant to replace Mindbody, Zen Planner and Booksy with one monthly price, a transparent fee (default 3%), no marketplace cut, free data export and refunds that work.

- **Repo:** `simmonsproduction22-bit/Rollertown-app`, branch `claude/gracious-tesla-4eyc6n`, folder `gym-platform/`. Not merged to main yet; no pull request open.
- **Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind 3, Supabase (Postgres, Auth, RLS, Storage), Stripe Connect, Twilio-style SMS, Resend-style email, zod, vitest, Playwright.
- **Status:** a complete first draft. Every screen works in demo mode on seeded data with no keys. Nothing has been run against a real Supabase project or a real Stripe test account yet.

## Run it

```bash
cd gym-platform
npm install
npm run dev          # http://localhost:3000, demo mode when Supabase keys are blank
npm test             # 72 vitest tests
npm run typecheck
DATABASE_URL=postgres://... scripts/verify-schema.sh   # migrations + 28 RLS checks on an empty Postgres
```

Go to `/login` and pick a role. Key routes: `/app` (staff), `/m` (member phone app), `/kiosk`, `/g/demo-mma` (public booking), `/onboarding`.

## Done and verified

Verified by: 72 vitest tests, 28 row-level-security checks on real Postgres 16, the full seed loading under every constraint, `next build` passing (37 routes), and Playwright runs of trial booking, refunds, member booking and staff invites.

- **Database:** 64 tables in `supabase/migrations/0001`–`0009`, every one with RLS forced. Roles: owner, manager, front desk, head coach, staff coach, independent coach, member, guardian, anonymous storefront. Tests confirm gyms can't see each other's data. Capacity trigger, no-double-booking constraint for coaches, append-only audit log.
- **Money:** Stripe Connect separate charges and transfers. Splits in `src/lib/domain/splits.ts`: platform fee first, then the coach's share of the net minus per-session mat rent, then the gym gets the rest; always sums to the exact cent. Refunds reverse every party proportionally (largest remainder). Package refund policies, manager-only overrides written to the audit log, sibling discounts, one-per-member intro offers, package liability, dunning retries.
- **Scheduling:** recurring classes, waitlist with automatic promotion, late-cancel and no-show fees, timezone-aware private lesson slots with buffers and time off, partner and small-group privates, paid by credits or card.
- **Waivers and check-in:** versioned waivers with re-sign detection, guardians sign for minors, signed PDF per member. Kiosk name search, staff check-in, signed day-scoped QR codes, warnings for waiver, balance and pickup notes.
- **Martial arts:** rank systems (BJJ adult and kids, Muay Thai), attendance-based stripe and belt eligibility, promotions, belt testing events that auto-promote, PDF certificates, curriculum, fight team (records, camps, weigh-ins, expiring documents).
- **Growth and messaging:** leads pipeline, automations engine, two-way SMS inbox with STOP opt-out, retention alerts, review requests.
- **Reports:** revenue by party, attendance, growth and churn, MRR, coach payouts with rent, package liability, class fill.
- **Data in and out:** CSV import mapping for Mindbody, Zen Planner, Booksy and Gymdesk; one-click ZIP export of every table plus waiver PDFs; REST API (`/api/v1`, hashed API keys, scopes, pagination); outgoing webhooks signed with HMAC; Stripe and Twilio inbound webhooks with signature checks; cron route for reminders, automations, payment retries and creating upcoming class sessions.
- **Onboarding (newest work):** the wizard saves every step: gym, disciplines, belt systems from templates, first classes (sessions created for the booking window right away), Stripe Connect link, coach invites. Staff and coach invites also work from Settings → Roles: one-time link, 14-day expiry, only a SHA-256 of the token is stored, and only the invited email can accept.
- **Seed:** "Demo MMA Academy" with 2 locations, 3 coaches (one independent), 40 members including 12 kids with guardians, 22 weekly classes, about 1,100 bookings and 188 transactions.

## Stubbed or partial

- **Stripe, SMS and email run on stubs until keys are set.** The Stripe stub declines any payment method ID containing `decline`.
- **Public card payments:** the server creates the PaymentIntent, but the Stripe Payment Element is not on the public booking pages yet.
- **Memberships** are billed one charge at a time, not as Stripe Billing subscriptions.
- **Stripe webhook** verifies signatures but doesn't yet fully reconcile charges, refunds, disputes or card-updater events.
- **Demo mode** keeps data in memory; it resets on server restart, and waiver PDFs are generated on request instead of stored.
- **Kiosk QR** expects a USB or Bluetooth scanner; there's no camera scanning.
- **Rate limiting** is in-memory per server instance.
- **Curriculum videos** take a URL; there's no upload UI.
- **Invite acceptance** is unit-tested but not yet run against a real Supabase project.

## Needs work, in priority order

1. **Lock down member writes (security).** Members can currently update every column of their own `members` row through the API, including `status` and `tags`. Fix with column-level grants or RPCs.
2. **Code and security review.** No dedicated review pass has been run over the finished code. One item seen in passing: some staff actions update rows by ID without checking `gym_id` in the app (for example `coachTermsAction` in `src/app/actions/staff.ts`). RLS blocks this in live mode, but the app should check too.
3. **First real run on Supabase and Stripe test mode.** Create a hosted project, run the migrations, set the keys, and go through sign-in, onboarding, invites, checkout and refunds end to end.
4. **Live payments:** Stripe Payment Element on `/g/[slug]` pages, Stripe Billing subscriptions for memberships, and full webhook reconciliation.
5. **Auth:** per-location staff scoping, a multi-gym switcher, and changing or removing roles in Settings → Roles.
6. **Shared rate limiting** (Redis or Upstash) and a CAPTCHA on public forms.
7. **Kiosk and phone app:** camera QR scanning, offline-tolerant kiosk, service worker, push notifications.
8. **Curriculum and testing:** video uploads to Storage; members register and pay for belt testing in the app.
9. **CI:** run vitest, typecheck, `scripts/verify-schema.sh` and a Playwright suite on every pull request. ESLint isn't configured yet (`npm run lint` prompts for setup).
10. **Accessibility:** axe audit and screen-reader pass; light-theme toggle (the theme tokens already exist).
11. **Pick a product name.** Everything still says `[ProductName]`. Ideas: Matwork, Gi & Glove, Cornerman, Roundbell, Dojo Ledger.

## Rules the code follows (keep these)

- **Secrets** live only in `.env.example` as blank placeholders and are read server-side through `src/lib/env.ts`. Never hardcode keys.
- **No fake testimonials** anywhere, including the marketing site.
- **Money** is integer cents. Split money with `allocate`/`applyBps` in `src/lib/domain/money.ts` so totals always match to the cent.
- **Data access** goes through the `Store` interface (`src/lib/data/store.ts`): `MemoryStore` in demo mode, `SupabaseStore` live with the user's JWT so RLS applies. `serviceStore()` (bypasses RLS) is only for public routes, webhooks, API keys and invite acceptance, always after explicit checks.
- **Business logic** lives in `src/lib/services/*` as functions taking a `Ctx` (store, gym, actor, payments, clock). Pure rules live in `src/lib/domain/*` with unit tests.
- **Server actions** use `runAction(capability, backUrl, fn)` from `src/lib/ctx.ts`: check permission, validate with zod, run, then redirect with a `?msg=` or `?err=` flash. `redirect()` must be called outside try/catch.
- **Permissions** are named capabilities in `src/lib/auth/roles.ts`, enforced in the app and again by RLS.
- **A new table** needs: a migration with RLS enabled and forced plus policies, a row type and entry in `Tables` (`src/lib/data/types.ts`), a place in `TABLE_ORDER` (`src/lib/seed/builder.ts`), demo defaults in `src/lib/data/defaults.ts`, secret columns excluded from export in `src/lib/services/data-io.ts`, and checks in `supabase/test/rls_test.sql`.
- **Tests** mock `server-only` at the top: `vi.mock("server-only", () => ({}))`. `tests/services/helpers.ts` gives a fresh demo-store `Ctx` at a fixed time.

## Supabase setup notes

- Run `supabase db reset` locally, or apply the migrations to a hosted project and run `npm run seed`.
- Under Auth → URL configuration, add `<NEXT_PUBLIC_APP_URL>/auth/callback**` to the redirect URLs so magic links can return to invite pages.
- Schedule `GET /api/cron` every 15 minutes with `Authorization: Bearer $CRON_SECRET`.
