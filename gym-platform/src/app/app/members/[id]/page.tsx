import Link from "next/link";
import { one, pageCtx, type SP } from "@/lib/ctx";
import { memberProfile } from "@/lib/services/people";
import { refundQuote } from "@/lib/services/refunds";
import { Badge, Bar, Belt, Card, Flash, PageHeader, Stat, Table } from "@/components/ui";
import { ago, dateFmt, dayTimeFmt, fullName, money } from "@/lib/format";
import { freezeAction, refundAction, reviewAction, saveMemberAction, sellAction, sendMessageAction, retryPaymentAction } from "@/app/actions/staff";
import { can } from "@/lib/auth/roles";
import { isMinor } from "@/lib/services/waivers";

export default async function MemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const { s, ctx } = await pageCtx("members.view");
  const p = await memberProfile(ctx, id);
  const tz = ctx.gym.timezone;
  const m = p.member;
  const here = `/app/members/${id}`;
  const pname = (pid: string | null) => p.products.find((x) => x.id === pid)?.name ?? "-";
  const canRefund = can(s.role, "payments.refund");
  const quotes = canRefund ? await Promise.all(p.transactions.filter((t) => ["succeeded", "partially_refunded"].includes(t.status)).slice(0, 12).map(async (t) => [t.id, await refundQuote(ctx, t.id)] as const)) : [];
  const quote = new Map(quotes);
  const sessions = await ctx.store.list("class_sessions", { where: { id: { in: p.bookings.slice(0, 15).map((b) => b.session_id) } } });
  const types = await ctx.store.list("class_types", { where: { gym_id: ctx.gym.id } });
  const sellable = p.products.filter((x) => x.is_active && x.kind !== "testing_fee" && x.kind !== "mat_rent");
  const minor = isMinor(m, new Date());

  return (
    <>
      <PageHeader title={fullName(m)} subtitle={<>{m.email ?? "no email"} · {m.phone ?? "no phone"} · member since {m.joined_on}{m.external_ref ? ` · imported ${m.external_ref}` : ""}</>}
        actions={<><Badge tone={m.status === "active" ? "ok" : m.status === "past_due" ? "bad" : "warn"}>{m.status.replace("_", " ")}</Badge>{minor && <Badge tone="brand">minor</Badge>}</>} />
      <Flash msg={one(sp.msg)} err={one(sp.err)} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Last visit" value={ago(m.last_attended_at)} />
        <Stat label="Visits (all time)" value={p.checkins.length} />
        <Stat label="Lifetime paid" value={money(p.transactions.filter((t) => t.status !== "failed").reduce((a, t) => a + t.total_cents - t.refunded_cents, 0))} />
        <Stat label="Waiver" value={p.waivers.ok ? "Signed" : p.waivers.needsResign ? "Re-sign" : "Missing"} tone={p.waivers.ok ? "ok" : "bad"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Memberships & packages">
            <ul className="space-y-4">
              {p.memberships.map((ms) => (
                <li key={ms.id} className="flex flex-wrap items-center justify-between gap-2">
                  <div><div className="font-medium">{pname(ms.product_id)} <Badge tone={ms.status === "active" ? "ok" : "warn"}>{ms.status}</Badge></div><div className="text-sm text-muted">{money(ms.price_cents)}/period{ms.discount_bps ? ` (sibling −${ms.discount_bps / 100}%)` : ""} · renews {ms.current_period_end}{ms.cancel_at_period_end ? " · cancels at period end" : ""}</div></div>
                  {ms.status === "active" && (
                    <form action={freezeAction} className="flex flex-wrap items-end gap-1 text-xs">
                      <input type="hidden" name="membershipId" value={ms.id} /><input type="hidden" name="back" value={here} />
                      <label>From<input type="date" name="startsOn" required className="input min-h-9 text-xs" /></label>
                      <label>To<input type="date" name="endsOn" required className="input min-h-9 text-xs" /></label>
                      <input name="reason" placeholder="Reason" className="input min-h-9 w-28 text-xs" aria-label="Hold reason" />
                      <button className="min-h-9 rounded border border-line px-2">Freeze</button>
                    </form>
                  )}
                </li>
              ))}
              {p.entitlements.map((e) => (
                <li key={e.id}>
                  <div className="flex justify-between text-sm"><span className="font-medium">{pname(e.product_id)} {e.migrated && <Badge>migrated</Badge>} <Badge tone={e.status === "active" ? "ok" : "neutral"}>{e.status}</Badge></span><span className="tabular-nums">{e.credits_total - e.credits_used} of {e.credits_total} left</span></div>
                  <Bar value={e.credits_total - e.credits_used} max={e.credits_total} tone={e.credits_total - e.credits_used <= 1 ? "warn" : "ok"} />
                  <div className="mt-1 text-xs text-muted">Paid {money(e.amount_paid_cents)}{e.expires_at ? ` · expires ${dateFmt(e.expires_at, tz)}` : ""}</div>
                </li>
              ))}
              {p.memberships.length + p.entitlements.length === 0 && <li className="text-sm text-muted">No plans yet.</li>}
            </ul>
            {can(s.role, "payments.sell") && (
              <form action={sellAction} className="mt-5 flex flex-wrap items-end gap-2 border-t border-line pt-4">
                <input type="hidden" name="memberId" value={m.id} /><input type="hidden" name="back" value={here} />
                <label className="min-w-56 flex-1"><span className="label">Sell (charges card on file)</span><select name="productId" className="input">{sellable.map((x) => <option key={x.id} value={x.id}>{x.name}: {money(x.price_cents)}</option>)}</select></label>
                <label><span className="label">Sibling #</span><input type="number" name="siblingIndex" defaultValue={0} min={0} max={6} className="input w-20" /></label>
                <button className="min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg">Charge</button>
              </form>
            )}
          </Card>

          <Card title="Payments & refunds">
            <Table head={["Date", "Item", "Amount", "Status", ""]}>
              {p.transactions.slice(0, 15).map((t) => {
                const q = quote.get(t.id);
                return (
                  <tr key={t.id}>
                    <td className="td whitespace-nowrap text-muted">{dateFmt(t.created_at, tz)}</td>
                    <td className="td">{t.description}<div className="text-xs text-muted">{t.receipt_number} · fee {money(t.platform_fee_cents)}</div></td>
                    <td className="td tabular-nums">{money(t.total_cents)}{t.refunded_cents > 0 && <div className="text-xs text-bad">−{money(t.refunded_cents)} refunded</div>}</td>
                    <td className="td"><Badge tone={t.status === "succeeded" ? "ok" : t.status === "failed" ? "bad" : "warn"}>{t.status.replace("_", " ")}</Badge>{t.failure_reason && <div className="text-xs text-bad">{t.failure_reason}</div>}</td>
                    <td className="td">
                      {q && q.refundable > 0 && (
                        <details><summary className="cursor-pointer text-sm font-semibold text-brand">Refund</summary>
                          <form action={refundAction} className="mt-2 w-64 space-y-2 text-xs">
                            <input type="hidden" name="transactionId" value={t.id} /><input type="hidden" name="back" value={here} />
                            <p className="text-muted">Policy: {q.rule}. Allows <strong className="text-fg">{money(q.policyAmount)}</strong> of {money(q.refundable)}.</p>
                            <input name="amount" placeholder={(q.policyAmount / 100).toFixed(2)} className="input min-h-9" aria-label="Refund amount (blank = policy amount)" />
                            <input name="reason" required minLength={3} placeholder="Reason (required)" className="input min-h-9" aria-label="Reason" />
                            <select name="credits" className="input min-h-9" aria-label="Credits"><option value="auto">Remove matching credits</option><option value="restore">Restore 1 credit</option><option value="none">Don&apos;t touch credits</option></select>
                            <label className="flex items-center gap-1"><input type="checkbox" name="override" /> Override policy (logged)</label>
                            <button className="min-h-9 w-full rounded bg-bad font-semibold text-white">Refund now</button>
                          </form>
                        </details>
                      )}
                      {t.status === "failed" && <form action={retryPaymentAction}><input type="hidden" name="transactionId" value={t.id} /><input type="hidden" name="back" value={here} /><button className="text-sm font-semibold text-brand">Retry</button></form>}
                    </td>
                  </tr>
                );
              })}
            </Table>
            {p.refunds.length > 0 && <p className="mt-3 text-xs text-muted">Refund history: {p.refunds.map((r) => `${money(r.amount_cents)} (${r.reason}${r.was_override ? ", override" : ""})`).join(" · ")}</p>}
          </Card>

          <Card title="Recent attendance">
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {p.bookings.slice(0, 14).map((b) => { const x = sessions.find((y) => y.id === b.session_id); return <li key={b.id} className="flex justify-between"><span>{types.find((t) => t.id === x?.class_type_id)?.name}</span><span className="text-muted">{x ? dayTimeFmt(x.starts_at, tz) : ""} · {b.status.replace("_", " ")}</span></li>; })}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Belts & progress">
            <ul className="space-y-4">
              {p.ranks.map((r) => (
                <li key={r.memberRank.id}>
                  <div className="text-xs text-muted">{r.systemName}</div><Belt color={r.rank.color} stripes={r.memberRank.stripes} name={r.rank.name} />
                  <div className="mt-1"><Bar value={r.eligibility.progress} max={1} tone={r.eligibility.eligible ? "ok" : "brand"} /></div>
                  <div className="mt-1 text-xs text-muted">{r.eligibility.eligible ? <span className="text-ok">Eligible for {r.eligibility.kind === "stripe" ? "next stripe" : r.eligibility.nextRankName}</span> : r.eligibility.kind === "none" ? "Top rank" : `${r.eligibility.classesNeeded} classes / ${r.eligibility.monthsNeeded} mo to ${r.eligibility.kind === "stripe" ? "next stripe" : r.eligibility.nextRankName}`}</div>
                </li>
              ))}
            </ul>
            <Link href={`/app/ranks?member=${m.id}`} className="mt-3 inline-block text-sm underline">Promote</Link>
          </Card>
          <Card title="Waivers">
            <ul className="space-y-2 text-sm">
              {p.waivers.signatures.map((w) => <li key={w.id} className="flex justify-between"><span>v{w.template_version} · {w.signer_name} ({w.signer_relationship})</span><a className="underline" href={`/api/waivers/${w.id}`}>PDF</a></li>)}
              {!p.waivers.ok && <li className="text-bad">Needs to sign: {p.waivers.missing.map((t) => `${t.title} v${t.version}`).join(", ")}</li>}
            </ul>
          </Card>
          {(p.guardians.length > 0 || p.children.length > 0 || m.pickup_notes) && (
            <Card title={minor ? "Guardians & pickup" : "Family"}>
              {m.pickup_notes && <p className="mb-2 rounded bg-warn/10 p-2 text-sm text-warn">Pickup: {m.pickup_notes}</p>}
              <ul className="space-y-1 text-sm">{p.guardians.map((g) => <li key={g.id}>{g.full_name} ({g.relationship}){g.can_pickup ? " · can pick up" : ""} · {g.phone ?? g.email}</li>)}{p.children.map((c) => <li key={c.id}><Link className="underline" href={`/app/members/${c.child_member_id}`}>Child profile</Link></li>)}</ul>
            </Card>
          )}
          <Card title="Messages">
            <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">{p.messages.map((x) => <li key={x.id} className={x.direction === "outbound" ? "ml-6 rounded-lg bg-brand/15 p-2" : "mr-6 rounded-lg bg-raised p-2"}>{x.body}</li>)}</ul>
            <form action={sendMessageAction} className="mt-3 flex gap-2"><input type="hidden" name="memberId" value={m.id} /><input type="hidden" name="back" value={here} /><input name="body" required maxLength={1600} placeholder="Text this member…" aria-label="Message" className="input" /><button className="min-h-11 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-fg">Send</button></form>
            <form action={reviewAction} className="mt-2"><input type="hidden" name="memberId" value={m.id} /><input type="hidden" name="back" value={here} /><button className="text-xs text-muted underline">Send Google review request</button></form>
          </Card>
          <Card title="Notes">
            <form action={saveMemberAction} className="space-y-2">
              {(["id", "firstName", "lastName", "email", "phone", "dateOfBirth", "status"] as const).map((k) => <input key={k} type="hidden" name={k} value={{ id: m.id, firstName: m.first_name, lastName: m.last_name, email: m.email ?? "", phone: m.phone ?? "", dateOfBirth: m.date_of_birth ?? "", status: m.status }[k]} />)}
              <input type="hidden" name="back" value={here} />
              <label className="block"><span className="label">Staff notes</span><textarea name="notes" defaultValue={m.notes ?? ""} rows={3} className="input py-2" /></label>
              <label className="block"><span className="label">Medical</span><textarea name="medicalNotes" defaultValue={m.medical_notes ?? ""} rows={2} className="input py-2" /></label>
              <label className="block"><span className="label">Pickup notes</span><input name="pickupNotes" defaultValue={m.pickup_notes ?? ""} className="input" /></label>
              <button className="min-h-11 rounded-lg border border-line px-4 text-sm">Save notes</button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
