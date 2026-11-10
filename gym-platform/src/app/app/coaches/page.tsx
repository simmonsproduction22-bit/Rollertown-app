import Link from "next/link";
import { pageCtx } from "@/lib/ctx";
import { buildReports } from "@/lib/services/reports";
import { Badge, Card, PageHeader, Table } from "@/components/ui";
import { money } from "@/lib/format";
import { formatBps } from "@/lib/domain/money";

export const metadata = { title: "Coaches" };

export default async function CoachesPage() {
  const { ctx } = await pageCtx("reports.view");
  const r = await buildReports(ctx);
  return (
    <>
      <PageHeader title="Coaches" subtitle="All coach activity, their earnings and the gym's share." actions={<Link href="/app/settings?tab=coaches" className="text-sm underline">Edit splits & rent</Link>} />
      <Card>
        <Table head={["Coach", "Type", "Split", "Rent", "Sales", "Coach earned", "Gym share", "Rent due", ""]}>
          {r.coachPayouts.map(({ coach, earned, gymShare, rentDue, sales }) => (
            <tr key={coach.id}>
              <td className="td font-semibold">{coach.display_name}</td>
              <td className="td"><Badge tone={coach.employment === "independent" ? "brand" : "neutral"}>{coach.employment}</Badge></td>
              <td className="td">{formatBps(coach.default_coach_split_bps)} / {formatBps(10000 - coach.default_coach_split_bps)}</td>
              <td className="td text-muted">{coach.rent_model === "none" ? "-" : `${money(coach.rent_amount_cents)} ${coach.rent_model.replace("_", " ")}`}</td>
              <td className="td tabular-nums">{sales}</td>
              <td className="td tabular-nums">{money(earned)}</td>
              <td className="td tabular-nums">{money(gymShare)}</td>
              <td className="td tabular-nums">{money(rentDue)}</td>
              <td className="td"><Link className="underline" href={`/app/coach?coach=${coach.id}`}>Dashboard</Link></td>
            </tr>
          ))}
        </Table>
        <p className="mt-3 text-xs text-muted">Splits are calculated after the {formatBps(ctx.gym.platform_fee_bps)} platform fee. Refunds reverse each party proportionally.</p>
      </Card>
    </>
  );
}
