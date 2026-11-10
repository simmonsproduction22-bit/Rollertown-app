import { one, pageCtx, type SP } from "@/lib/ctx";
import { Badge, Card, Flash, PageHeader, Table, Tabs } from "@/components/ui";
import { fullName, money } from "@/lib/format";
import { posAction, restockAction } from "@/app/actions/staff";

export const metadata = { title: "Point of sale" };

export default async function PosPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const tab = one(sp.tab) ?? "sell";
  const { ctx } = await pageCtx("pos.sell");
  const [items, members] = await Promise.all([
    ctx.store.list("inventory_items", { where: { gym_id: ctx.gym.id, is_active: true }, order: { column: "category" } }),
    ctx.store.list("members", { where: { gym_id: ctx.gym.id, status: "active" }, order: { column: "last_name" } }),
  ]);
  return (
    <>
      <PageHeader title="Point of sale" subtitle="Gear, apparel and drinks. Charge a member's card on file or take a walk-in card." />
      <Flash msg={one(sp.msg)} err={one(sp.err)} />
      <Tabs active={tab} tabs={[{ key: "sell", label: "Sell", href: "/app/pos" }, { key: "inventory", label: "Inventory", href: "/app/pos?tab=inventory" }]} />
      {tab === "sell" ? (
        <form action={posAction}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((i) => (
              <label key={i.id} className="rounded-xl border border-line bg-surface p-3">
                <input type="hidden" name="itemId" value={i.id} />
                <div className="font-semibold">{i.name}</div>
                <div className="text-sm text-muted">{money(i.price_cents)} · {i.stock} in stock</div>
                <span className="sr-only">Quantity of {i.name}</span>
                <input type="number" name="qty" min={0} max={i.stock} defaultValue={0} className="input mt-2 text-center text-lg" disabled={i.stock === 0} />
              </label>
            ))}
          </div>
          <Card className="mt-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-64 flex-1"><span className="label">Charge to</span><select name="memberId" className="input"><option value="">Walk-in (card present)</option>{members.map((m) => <option key={m.id} value={m.id}>{fullName(m)} (card on file)</option>)}</select></label>
              <button className="min-h-12 rounded-lg bg-brand px-8 text-base font-bold text-brand-fg">Charge</button>
            </div>
            <p className="mt-2 text-xs text-muted">{ctx.gym.platform_fee_bps / 100}% platform fee applies and is shown on the receipt.</p>
          </Card>
        </form>
      ) : (
        <Card>
          <Table head={["Item", "SKU", "Category", "Price", "Stock", "Restock"]}>
            {items.map((i) => (
              <tr key={i.id}>
                <td className="td font-medium">{i.name}</td><td className="td text-muted">{i.sku}</td><td className="td">{i.category}</td><td className="td">{money(i.price_cents)}</td>
                <td className="td">{i.stock} {i.stock <= i.low_stock_threshold && <Badge tone="warn">low</Badge>}</td>
                <td className="td"><form action={restockAction} className="flex gap-1"><input type="hidden" name="itemId" value={i.id} /><input name="qty" type="number" min={1} defaultValue={10} className="input min-h-9 w-20" aria-label={`Restock ${i.name}`} /><button className="rounded border border-line px-2 text-xs">Add</button></form></td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
