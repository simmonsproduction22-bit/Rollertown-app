import { one, pageCtx, type SP } from "@/lib/ctx";
import { Badge, Card, Field, Flash, LinkButton, PageHeader, Table } from "@/components/ui";
import { dateFmt } from "@/lib/format";
import { apiKeyAction, webhookAction } from "@/app/actions/staff";
import { WEBHOOK_EVENTS } from "@/lib/services/webhooks";
import { can } from "@/lib/auth/roles";
import { cookies } from "next/headers";

export const metadata = { title: "API & export" };

const ENDPOINTS = [
  ["GET", "/api/v1/members", "List members (?status=active)"], ["GET", "/api/v1/members/{id}", "One member"],
  ["GET", "/api/v1/classes", "Upcoming class sessions (?from=&to=)"], ["GET", "/api/v1/bookings", "Class bookings (?session_id=)"],
  ["POST", "/api/v1/bookings", "Book a class {session_id, member_id} (write scope)"], ["GET", "/api/v1/payments", "Transactions"],
  ["GET", "/api/v1/checkins", "Check-ins (?since=)"], ["POST", "/api/v1/checkins", "Check a member in {member_id} (write scope)"],
  ["GET", "/api/v1/leads", "Leads"], ["POST", "/api/v1/leads", "Create a lead {first_name, email|phone} (write scope)"],
];

export default async function DevelopersPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { s, ctx } = await pageCtx("export.run");
  const [keys, hooks, deliveries] = await Promise.all([
    ctx.store.list("api_keys", { where: { gym_id: ctx.gym.id } }), ctx.store.list("webhook_endpoints", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("webhook_deliveries", { where: { gym_id: ctx.gym.id }, order: { column: "created_at", ascending: false }, limit: 10 }),
  ]);
  const owner = can(s.role, "developers.manage");
  const newKey = owner ? (await cookies()).get("gp_new_key")?.value : undefined;
  return (
    <>
      <PageHeader title="API & data export" subtitle="Your data is yours. Export everything anytime, free." />
      <Flash msg={one(sp.msg)} err={one(sp.err)} />
      {newKey && <div role="status" className="mb-4 rounded-lg border border-warn/50 bg-warn/10 p-3 text-sm">New API key: <code className="select-all break-all font-mono">{newKey}</code></div>}
      <Card title="One-click full export" action={<LinkButton href="/api/export">Download ZIP</LinkButton>}>
        <p className="text-sm text-muted">A ZIP with one CSV per table (members, memberships, packages, bookings, attendance, payments, splits, refunds, belts, fight records…) plus every signed waiver as a PDF. No fees, no request form.</p>
      </Card>
      {owner && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title="API keys">
            <Table head={["Name", "Prefix", "Scopes", "Last used", ""]}>{keys.map((k) => <tr key={k.id}><td className="td">{k.name}</td><td className="td font-mono text-xs">{k.key_prefix}…</td><td className="td">{k.scopes.join(", ")}</td><td className="td text-sm">{k.last_used_at ? dateFmt(k.last_used_at, ctx.gym.timezone) : "never"}</td><td className="td">{k.revoked_at ? <Badge tone="bad">revoked</Badge> : <form action={apiKeyAction}><input type="hidden" name="revoke" value={k.id} /><button className="text-xs text-bad underline">Revoke</button></form>}</td></tr>)}</Table>
            <form action={apiKeyAction} className="mt-4 flex flex-wrap items-end gap-2"><div className="flex-1"><Field label="New key name" name="name" required placeholder="Website, Zapier…" /></div><label className="flex min-h-11 items-center gap-1 text-sm"><input type="checkbox" name="scope" value="read" defaultChecked /> read</label><label className="flex min-h-11 items-center gap-1 text-sm"><input type="checkbox" name="scope" value="write" /> write</label><button className="min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg">Create</button></form>
            <p className="mt-2 text-xs text-muted">Keys are shown once and stored only as a SHA-256 hash. Send as <code>Authorization: Bearer gp_live_…</code>.</p>
          </Card>
          <Card title="Webhooks">
            <ul className="space-y-2 text-sm">{hooks.map((h) => <li key={h.id}><span className="font-mono text-xs">{h.url}</span><div className="text-xs text-muted">{h.events.join(", ")}</div></li>)}</ul>
            <form action={webhookAction} className="mt-4 space-y-2"><Field label="Endpoint URL (https)" name="url" type="url" required placeholder="https://example.com/hooks" /><fieldset className="flex flex-wrap gap-2 text-xs">{WEBHOOK_EVENTS.map((e) => <label key={e} className="flex items-center gap-1"><input type="checkbox" name="event" value={e} defaultChecked={["booking.created", "payment.succeeded", "checkin.created"].includes(e)} />{e}</label>)}</fieldset><button className="min-h-11 rounded-lg border border-line px-4 text-sm">Add endpoint</button></form>
            <p className="mt-2 text-xs text-muted">Each delivery is signed: <code>X-Signature: t=&lt;ts&gt;,v1=HMAC_SHA256(secret, &quot;ts.body&quot;)</code>.</p>
            <ul className="mt-3 space-y-1 text-xs text-muted">{deliveries.map((d, i) => <li key={d.id ?? i}>{d.event} → {d.status_code ?? "pending"} · {dateFmt(d.created_at, ctx.gym.timezone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</li>)}</ul>
          </Card>
        </div>
      )}
      <Card className="mt-6" title="REST API reference">
        <Table head={["Method", "Path", "Description"]}>{ENDPOINTS.map(([m, p, d]) => <tr key={m + p}><td className="td"><Badge tone={m === "GET" ? "ok" : "brand"}>{m}</Badge></td><td className="td font-mono text-xs">{p}</td><td className="td text-sm">{d}</td></tr>)}</Table>
        <p className="mt-3 text-xs text-muted">Responses: <code>{"{ success, data, error, meta: { total, page, limit } }"}</code>. Pagination: <code>?page=1&amp;limit=50</code> (max 200). Rate limit: 120 requests/min per key.</p>
      </Card>
    </>
  );
}
