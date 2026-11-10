import { one, pageCtx, type SP } from "@/lib/ctx";
import { Badge, Bar, Card, Flash, PageHeader, Table, Tabs } from "@/components/ui";
import { dateFmt } from "@/lib/format";
import { importAction, matchCardsAction } from "@/app/actions/staff";
import { canonicalFields, type ImportEntity } from "@/lib/import/presets";

export const metadata = { title: "Import & migration" };
const SYSTEMS = [["mindbody", "Mindbody"], ["zen_planner", "Zen Planner"], ["booksy", "Booksy"], ["gymdesk", "Gymdesk"], ["generic", "Other CSV"]];
const STEPS = ["not_started", "requested", "export_in_progress", "received", "mapping", "completed"] as const;

export default async function ImportPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const tab = one(sp.tab) ?? "csv";
  const entity = (one(sp.entity) as ImportEntity) ?? "members";
  const { ctx } = await pageCtx("import.run");
  const [jobs, migs] = await Promise.all([
    ctx.store.list("import_jobs", { where: { gym_id: ctx.gym.id }, order: { column: "created_at", ascending: false } }),
    ctx.store.list("card_migrations", { where: { gym_id: ctx.gym.id } }),
  ]);
  const recs = migs[0] ? await ctx.store.list("card_migration_records", { where: { migration_id: migs[0].id } }) : [];
  return (
    <>
      <PageHeader title="Import & migration" subtitle="Bring members, memberships, packages and attendance from your old system. Free, including card-on-file." />
      <Flash msg={one(sp.msg)} err={one(sp.err)} />
      <Tabs active={tab} tabs={[{ key: "csv", label: "CSV import", href: "/app/import" }, { key: "cards", label: "Card-on-file migration", href: "/app/import?tab=cards" }]} />
      {tab === "csv" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2" title="1. Choose what you're importing">
            <nav className="mb-4 flex flex-wrap gap-2">{(Object.keys(canonicalFields) as ImportEntity[]).map((e) => <a key={e} href={`/app/import?entity=${e}`} className={`rounded-full border px-3 py-1 text-sm ${e === entity ? "border-brand bg-brand/15" : "border-line"}`}>{e}</a>)}</nav>
            <form action={importAction} className="space-y-4" encType="multipart/form-data">
              <input type="hidden" name="entity" value={entity} />
              <label className="block"><span className="label">2. Source system (sets field-mapping presets)</span><select name="system" className="input">{SYSTEMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label className="block"><span className="label">3. Upload CSV export</span><input type="file" name="file" accept=".csv,text/csv" className="input py-2" /></label>
              <label className="block"><span className="label">…or paste CSV</span><textarea name="csv" rows={4} className="input py-2 font-mono text-xs" placeholder={"First Name,Last Name,Email\nAna,Silva,ana@example.com"} /></label>
              <fieldset><legend className="label">4. Field mapping (leave blank to auto-detect from headers)</legend>
                <div className="grid gap-2 sm:grid-cols-2">{canonicalFields[entity].map((f) => <label key={f.key} className="text-sm"><span className="text-muted">{f.label}{f.required ? " *" : ""}</span><input name={`map_${f.key}`} placeholder="Column header in your file" className="input min-h-9" /></label>)}</div>
              </fieldset>
              <button className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-brand-fg">Validate & import</button>
              <p className="text-xs text-muted">Rows with problems are skipped and listed below with row numbers so you can fix and re-upload. Members are matched by email (re-importing updates instead of duplicating).</p>
            </form>
          </Card>
          <Card title="Where to find your export">
            <ul className="space-y-2 text-sm text-muted">
              <li><strong className="text-fg">Mindbody:</strong> Reports → Clients → Client Export; Sales → Pricing Options for packages.</li>
              <li><strong className="text-fg">Zen Planner:</strong> Reports → People → Export; Memberships report.</li>
              <li><strong className="text-fg">Booksy:</strong> Clients → Export to CSV.</li>
              <li><strong className="text-fg">Gymdesk:</strong> Members → Export.</li>
            </ul>
          </Card>
          <Card className="lg:col-span-3" title="Import history">
            <Table head={["Date", "Source", "Type", "Rows", "Imported", "Issues"]}>{jobs.map((j) => <tr key={j.id}><td className="td">{dateFmt(j.created_at, ctx.gym.timezone)}</td><td className="td">{j.source_system}</td><td className="td">{j.entity}</td><td className="td">{j.row_count}</td><td className="td">{j.imported_count}</td><td className="td text-xs text-muted">{(j.errors as { row: number; messages: string[] }[]).slice(0, 3).map((e) => `row ${e.row}: ${e.messages.join(", ")}`).join(" · ") || "-"}</td></tr>)}</Table>
          </Card>
        </div>
      ) : migs.map((m) => (
        <Card key={m.id} title={`From ${m.source_system.replace("_", " ")} (${m.source_processor ?? "processor"})`} action={<Badge tone={m.status === "completed" ? "ok" : "warn"}>{m.status.replace(/_/g, " ")}</Badge>}>
          <ol className="mb-5 grid gap-2 sm:grid-cols-6">{STEPS.map((st, i) => <li key={st} className={`rounded-lg p-2 text-center text-xs ${STEPS.indexOf(m.status as never) >= i ? "bg-ok/15 text-ok" : "bg-raised text-muted"}`}>{i + 1}. {st.replace(/_/g, " ")}</li>)}</ol>
          <div className="mb-2 flex justify-between text-sm"><span>{m.cards_imported} of {m.cards_expected} cards attached</span><span className="text-muted">{m.cards_unmatched} unmatched</span></div>
          <Bar value={m.cards_imported} max={m.cards_expected ?? 1} tone="ok" />
          <p className="mt-3 text-sm text-muted">{m.notes} Card numbers go processor → Stripe directly; we only store the resulting payment-method IDs.</p>
          <form action={matchCardsAction} className="mt-3"><input type="hidden" name="migrationId" value={m.id} /><button className="min-h-11 rounded-lg border border-line px-4 text-sm">Re-run email matching</button></form>
          <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Unmatched & pending ({recs.filter((r) => r.status !== "attached").length})</summary>
            <ul className="mt-2 space-y-1 text-sm">{recs.filter((r) => r.status !== "attached").map((r) => <li key={r.id}>{r.source_customer_id} · {r.email} · <Badge tone="warn">{r.status}</Badge></li>)}</ul>
          </details>
        </Card>
      ))}
    </>
  );
}
