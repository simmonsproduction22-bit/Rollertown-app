import Link from "next/link";
import { one, pageCtx, type SP } from "@/lib/ctx";
import { Badge, Card, Field, Flash, PageHeader, Select, Table } from "@/components/ui";
import { ago, fullName } from "@/lib/format";
import { saveMemberAction } from "@/app/actions/staff";
import { isMinor } from "@/lib/services/waivers";

export const metadata = { title: "Members" };
const tone = { active: "ok", trial: "brand", lead: "brand", frozen: "warn", past_due: "bad", cancelled: "neutral" } as const;

export default async function MembersPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { ctx } = await pageCtx("members.view");
  const q = (one(sp.q) ?? "").toLowerCase();
  const status = one(sp.status) ?? "";
  const kids = one(sp.kids) === "1";
  const [members, ranks, mranks, memberships, products] = await Promise.all([
    ctx.store.list("members", { where: { gym_id: ctx.gym.id }, order: { column: "last_name" } }),
    ctx.store.list("ranks", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("member_ranks", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("memberships", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("products", { where: { gym_id: ctx.gym.id } }),
  ]);
  const now = new Date();
  const list = members.filter((m) => (!q || `${m.first_name} ${m.last_name} ${m.email ?? ""} ${m.phone ?? ""}`.toLowerCase().includes(q)) && (!status || m.status === status) && (!kids || isMinor(m, now)));
  return (
    <>
      <PageHeader title="Members" subtitle={`${members.length} people · ${members.filter((m) => m.status === "active").length} active · ${members.filter((m) => isMinor(m, now)).length} kids`} />
      <Flash msg={one(sp.msg)} err={one(sp.err)} />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Search name, email, phone" aria-label="Search members" className="input max-w-sm" />
        <select name="status" defaultValue={status} aria-label="Status" className="input max-w-[180px]"><option value="">All statuses</option>{Object.keys(tone).map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="kids" value="1" defaultChecked={kids} /> Kids only</label>
        <button className="min-h-11 rounded-lg border border-line px-4 text-sm">Filter</button>
      </form>
      <Card>
        <Table head={["Name", "Status", "Plan", "Rank", "Last visit", "Contact"]} empty={list.length ? undefined : "No members match."}>
          {list.map((m) => {
            const ms = memberships.find((x) => x.member_id === m.id && x.status !== "cancelled");
            const mr = mranks.find((x) => x.member_id === m.id);
            const rank = ranks.find((r) => r.id === mr?.rank_id);
            return (
              <tr key={m.id} className="hover:bg-raised/50">
                <td className="td"><Link href={`/app/members/${m.id}`} className="font-semibold hover:underline">{fullName(m)}</Link>{isMinor(m, now) && <span className="ml-2"><Badge tone="brand">kid</Badge></span>}</td>
                <td className="td"><Badge tone={tone[m.status]}>{m.status.replace("_", " ")}</Badge></td>
                <td className="td text-muted">{products.find((p) => p.id === ms?.product_id)?.name ?? "-"}</td>
                <td className="td">{rank ? <span className="inline-flex items-center gap-2"><span className="inline-block h-2.5 w-8 rounded-sm border border-line" style={{ background: rank.color }} />{rank.name}{mr?.stripes ? ` · ${mr.stripes}` : ""}</span> : "-"}</td>
                <td className="td text-muted">{ago(m.last_attended_at, now)}</td>
                <td className="td text-muted">{m.email ?? m.phone ?? "via guardian"}</td>
              </tr>
            );
          })}
        </Table>
      </Card>
      <Card className="mt-6" title="Add member">
        <form action={saveMemberAction} className="grid gap-3 sm:grid-cols-3">
          <Field label="First name" name="firstName" required /><Field label="Last name" name="lastName" required />
          <Field label="Email" name="email" type="email" /><Field label="Phone" name="phone" type="tel" />
          <Field label="Date of birth" name="dateOfBirth" type="date" />
          <Select label="Status" name="status" defaultValue="active">{Object.keys(tone).map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</Select>
          <div className="sm:col-span-3"><button className="min-h-11 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-fg">Save member</button></div>
        </form>
      </Card>
    </>
  );
}
