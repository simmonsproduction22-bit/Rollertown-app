import { one, pageCtx, type SP } from "@/lib/ctx";
import { Badge, Card, Flash } from "@/components/ui";
import { dateFmt, money } from "@/lib/format";
import { memberBuyAction } from "@/app/actions/member";
import { payments } from "@/lib/payments/stripe";
import { env } from "@/lib/env";

export const metadata = { title: "Payments" };

export default async function PayPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { s, ctx } = await pageCtx("member.self");
  const tz = ctx.gym.timezone;
  const member = s.memberId ? await ctx.store.get("members", s.memberId) : null;
  const [products, txns, pm] = await Promise.all([
    ctx.store.list("products", { where: { gym_id: ctx.gym.id, is_active: true, is_public: true } }),
    s.memberId ? ctx.store.list("transactions", { where: { member_id: s.memberId }, order: { column: "created_at", ascending: false }, limit: 12 }) : Promise.resolve([]),
    s.memberId ? ctx.store.first("payment_methods", { where: { member_id: s.memberId, is_default: true } }) : Promise.resolve(null),
  ]);
  const updateUrl = (await payments().cardUpdateLink({ customerId: member?.stripe_customer_id ?? null, returnUrl: `${env.appUrl}/m/pay` })).url;
  const failed = txns.filter((t) => t.status === "failed");
  const fee = ctx.gym.platform_fee_bps / 100;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Payments</h1>
      <Flash msg={one(sp.msg)} err={one(sp.err)} />
      {(failed.length > 0 || one(sp.update)) && <div role="alert" className="rounded-xl border border-bad/50 bg-bad/10 p-4 text-sm"><strong>Payment didn&apos;t go through.</strong> Update your card and we&apos;ll retry automatically. <a href={updateUrl} className="font-semibold underline">Update card</a></div>}
      <Card title="Card on file" action={<a href={updateUrl} className="text-sm underline">Update</a>}>{pm ? <p>{pm.brand?.toUpperCase()} •••• {pm.last4} · exp {pm.exp_month}/{pm.exp_year}{pm.source === "migrated" && <span className="ml-2"><Badge>moved from old system</Badge></span>}</p> : <p className="text-sm text-muted">No card yet.</p>}</Card>
      <Card title="Buy">
        <ul className="divide-y divide-line">
          {products.filter((p) => !["testing_fee", "mat_rent", "retail"].includes(p.kind)).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-3">
              <div><div className="font-medium">{p.name}</div><div className="text-sm text-muted">{money(p.price_cents)}{p.interval ? `/${p.interval}` : ""}{p.expires_after_days ? ` · use within ${p.expires_after_days} days` : ""}</div></div>
              <form action={memberBuyAction}><input type="hidden" name="productId" value={p.id} /><button className="min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg">{p.price_cents === 0 ? "Claim" : "Buy"}</button></form>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Prices include a {fee}% transaction fee paid by {ctx.gym.name}. No other fees.</p>
      </Card>
      <Card title="Receipts">
        <ul className="divide-y divide-line text-sm">{txns.map((t) => <li key={t.id} className="flex justify-between py-2"><span>{dateFmt(t.created_at, tz)} · {t.description}<span className="block text-xs text-muted">{t.receipt_number}{t.refunded_cents ? ` · refunded ${money(t.refunded_cents)}` : ""}</span></span><span className="text-right">{money(t.total_cents)}<span className="block"><Badge tone={t.status === "succeeded" ? "ok" : t.status === "failed" ? "bad" : "warn"}>{t.status.replace("_", " ")}</Badge></span></span></li>)}</ul>
      </Card>
    </div>
  );
}
