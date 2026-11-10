import { one, pageCtx, type SP } from "@/lib/ctx";
import { Card, Field, Flash, PageHeader, Select, Table, Tabs } from "@/components/ui";
import { coachTermsAction, settingsAction, waiverVersionAction } from "@/app/actions/staff";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { DEMO_USERS } from "@/lib/seed/constants";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const tab = one(sp.tab) ?? "policies";
  const { ctx } = await pageCtx("settings.manage");
  const g = ctx.gym;
  const st = g.settings;
  const tabs = ["policies", "coaches", "waivers", "roles", "branding"].map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), href: `/app/settings?tab=${k}` }));
  const [coaches, waivers, gymUsers] = await Promise.all([
    ctx.store.list("coaches", { where: { gym_id: g.id } }), ctx.store.list("waiver_templates", { where: { gym_id: g.id, is_current: true } }), ctx.store.list("gym_users", { where: { gym_id: g.id } }),
  ]);
  const Check = ({ name, label, on }: { name: string; label: string; on: boolean }) => <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name={name} defaultChecked={on} className="h-5 w-5" />{label}</label>;
  return (
    <>
      <PageHeader title="Settings" subtitle="Every change to policies, splits and roles is recorded in the audit log." />
      <Flash msg={one(sp.msg)} err={one(sp.err)} />
      <Tabs tabs={tabs} active={tab} />
      {(tab === "policies" || tab === "branding") && (
        <form action={settingsAction} className="grid gap-6 lg:grid-cols-2">
          <input type="hidden" name="back" value={`/app/settings?tab=${tab}`} />
          <div className={tab === "branding" ? "space-y-6 lg:col-span-2" : "hidden"} aria-hidden={tab !== "branding"}>
            <Card title="Branding"><div className="grid gap-3 sm:grid-cols-3"><Field label="Gym name" name="name" defaultValue={g.name} /><Field label="Brand color" name="brand_color" defaultValue={g.brand_color} type="color" /><Field label="Google review link" name="review_url" defaultValue={g.google_review_url ?? ""} type="url" /></div></Card>
          </div>
          <div className={tab === "policies" ? "contents" : "hidden"}>
            <Card title="Cancellation policy">
              <div className="grid gap-3 sm:grid-cols-3"><Field label="Free cancel window (hours)" name="window_hours" type="number" defaultValue={st.cancellation.window_hours} /><Field label="Late-cancel fee ($)" name="late_fee" defaultValue={(st.cancellation.late_cancel_fee_cents / 100).toFixed(2)} /><Field label="No-show fee ($)" name="no_show_fee" defaultValue={(st.cancellation.no_show_fee_cents / 100).toFixed(2)} /></div>
              <Check name="consumes" label="Late cancels use up the class/lesson credit" on={st.cancellation.late_cancel_consumes_credit} />
            </Card>
            <Card title="Refund rules">
              <Select label="Package refunds" name="refund_mode" defaultValue={st.refunds.package_refund_mode}><option value="unused_prorated">Refund unused sessions pro-rata</option><option value="full_if_unused">Full refund only if unused</option><option value="none">Non-refundable</option></Select>
              <div className="mt-3"><Field label="Membership refund window (days)" name="membership_refund_days" type="number" defaultValue={st.refunds.membership_refund_days} /></div>
              <Check name="allow_override" label="Managers can override policy (always logged)" on={st.refunds.allow_staff_override} />
            </Card>
            <Card title="Booking & packages">
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Booking opens (days ahead)" name="open_days" type="number" defaultValue={st.booking.open_days_ahead} /><Field label="Default package expiration (days)" name="expiration_days" type="number" defaultValue={st.packages.default_expiration_days} /></div>
              <Check name="auto_promote" label="Auto-promote waitlist when a spot opens" on={st.booking.waitlist_auto_promote} />
              <Check name="require_waiver" label="Require a signed waiver to book" on={st.booking.require_waiver} />
            </Card>
            <Card title="Reminders & retention">
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Class reminders (hours before, comma-separated)" name="class_hours" defaultValue={st.reminders.class_hours_before.join(",")} /><Field label="Private reminders (hours before)" name="private_hours" defaultValue={st.reminders.private_hours_before.join(",")} />
                <Field label="Alert after N days inactive" name="inactive_days" type="number" defaultValue={st.retention.inactive_days} /><Field label="Alert when credits ≤" name="low_credits" type="number" defaultValue={st.retention.package_low_credits} /><Field label="Expiring alert (days)" name="expiring_days" type="number" defaultValue={st.retention.membership_expiring_days} /></div>
            </Card>
            <Card title="Transaction fee">
              <p className="text-sm text-muted">Platform fee: <strong className="text-fg">{g.platform_fee_bps / 100}%</strong> per card payment. It&apos;s the only fee and is shown on every receipt.</p>
              <Select label="Who pays it?" name="fee_paid_by" defaultValue={st.fee_paid_by ?? "business"}><option value="business">Gym absorbs it (included in price)</option><option value="customer">Added at checkout as a visible line</option></Select>
            </Card>
          </div>
          <div className="lg:col-span-2"><button className="min-h-11 rounded-lg bg-brand px-6 font-semibold text-brand-fg">Save settings</button></div>
        </form>
      )}
      {tab === "coaches" && (
        <Card title="Coach splits & mat rent">
          <Table head={["Coach", "Type", "Coach %", "Rent model", "Rent $", ""]}>
            {coaches.map((c) => (
              <tr key={c.id}><td className="td font-medium">{c.display_name}</td><td colSpan={5} className="td">
                <form action={coachTermsAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="coachId" value={c.id} />
                  <select name="employment" defaultValue={c.employment} className="input min-h-9 w-36" aria-label="Type"><option value="staff">Staff</option><option value="independent">Independent</option></select>
                  <input name="split" type="number" min={0} max={100} defaultValue={c.default_coach_split_bps / 100} className="input min-h-9 w-20" aria-label="Coach percent" />
                  <select name="rent_model" defaultValue={c.rent_model} className="input min-h-9 w-40" aria-label="Rent model"><option value="none">No rent</option><option value="flat_monthly">Flat monthly</option><option value="per_hour">Per hour</option><option value="per_session">Per session</option></select>
                  <input name="rent_amount" defaultValue={(c.rent_amount_cents / 100).toFixed(2)} className="input min-h-9 w-24" aria-label="Rent amount" />
                  <button className="rounded border border-line px-3 py-1.5 text-xs">Save</button>
                </form>
              </td></tr>
            ))}
          </Table>
          <p className="mt-3 text-xs text-muted">Per-product splits override the coach default (set on each coach product). Rent is deducted from the coach&apos;s payout.</p>
        </Card>
      )}
      {tab === "waivers" && waivers.map((w) => (
        <Card key={w.id} title={`${w.title} (current: v${w.version})`}>
          <form action={waiverVersionAction} className="space-y-3"><input type="hidden" name="templateId" value={w.id} /><textarea name="body" defaultValue={w.body} rows={12} className="input py-2 text-sm" aria-label="Waiver text" /><button className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-brand-fg">Publish as v{w.version + 1} (members re-sign)</button></form>
        </Card>
      ))}
      {tab === "roles" && (
        <Card title="Team & roles">
          <Table head={["Person", "Role", "Can do"]}>
            {gymUsers.map((u) => <tr key={u.id}><td className="td">{Object.values(DEMO_USERS).find((d) => d.id === u.user_id)?.name ?? u.invited_email}</td><td className="td">{ROLE_LABELS[u.role]}</td><td className="td text-xs text-muted">{{ owner: "Everything, incl. API keys & export", manager: "Reports, refunds, policies, settings", front_desk: "Check-ins, bookings, sales, members", head_coach: "Schedule, belts, fight team, privates", coach: "Classes, belts, own privates", independent_coach: "Own clients, products, inbox & payouts only", member: "Own bookings & payments", guardian: "Children's accounts" }[u.role]}</td></tr>)}
          </Table>
          <p className="mt-3 text-xs text-muted">Enforced twice: in the app and by Postgres row-level security.</p>
        </Card>
      )}
    </>
  );
}
