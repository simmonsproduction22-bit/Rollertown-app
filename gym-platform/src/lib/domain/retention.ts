export type AlertKind = "inactive" | "package_low" | "membership_expiring" | "promotion_eligible" | "payment_failed" | "document_expiring";

export interface RetentionAlert {
  readonly kind: AlertKind;
  readonly memberId: string;
  readonly title: string;
  readonly detail: string;
  readonly severity: "info" | "warn" | "bad";
}

export interface RetentionInput {
  readonly now: Date;
  readonly settings: { inactive_days: number; package_low_credits: number; membership_expiring_days: number };
  readonly members: readonly { id: string; name: string; status: string; lastAttendedAt: Date | null }[];
  readonly packages: readonly { memberId: string; name: string; creditsTotal: number; creditsUsed: number; status: string; expiresAt: Date | null }[];
  readonly memberships: readonly { memberId: string; name: string; status: string; currentPeriodEnd: Date; cancelAtPeriodEnd: boolean }[];
  readonly eligible: readonly { memberId: string; label: string }[];
  readonly failedPayments: readonly { memberId: string; amount: string }[];
}

const DAY = 86_400_000;

export function computeRetentionAlerts(input: RetentionInput): RetentionAlert[] {
  const { now, settings } = input;
  const name = (id: string) => input.members.find((m) => m.id === id)?.name ?? "Member";
  const alerts: RetentionAlert[] = [];

  for (const m of input.members) {
    if (m.status !== "active" || !m.lastAttendedAt) continue;
    const days = Math.floor((now.getTime() - m.lastAttendedAt.getTime()) / DAY);
    if (days >= settings.inactive_days) {
      alerts.push({ kind: "inactive", memberId: m.id, title: `${m.name} hasn't attended in ${days} days`, detail: "Send a check-in text.", severity: days >= settings.inactive_days * 2 ? "bad" : "warn" });
    }
  }
  for (const p of input.packages) {
    if (p.status !== "active") continue;
    const left = p.creditsTotal - p.creditsUsed;
    if (left <= settings.package_low_credits) {
      alerts.push({ kind: "package_low", memberId: p.memberId, title: `${name(p.memberId)}: ${left} credit${left === 1 ? "" : "s"} left`, detail: `${p.name} is almost used up. Offer a renewal.`, severity: "info" });
    }
    if (p.expiresAt && p.expiresAt.getTime() - now.getTime() < settings.membership_expiring_days * DAY && left > 0) {
      const d = Math.max(0, Math.ceil((p.expiresAt.getTime() - now.getTime()) / DAY));
      alerts.push({ kind: "membership_expiring", memberId: p.memberId, title: `${name(p.memberId)}: ${left} credits expire in ${d} days`, detail: p.name, severity: "warn" });
    }
  }
  for (const ms of input.memberships) {
    if (ms.status !== "active" || !ms.cancelAtPeriodEnd) continue;
    const d = Math.ceil((ms.currentPeriodEnd.getTime() - now.getTime()) / DAY);
    if (d <= settings.membership_expiring_days) {
      alerts.push({ kind: "membership_expiring", memberId: ms.memberId, title: `${name(ms.memberId)}'s membership ends in ${d} days`, detail: `${ms.name}: set to cancel. Reach out.`, severity: "warn" });
    }
  }
  for (const e of input.eligible) {
    alerts.push({ kind: "promotion_eligible", memberId: e.memberId, title: `${name(e.memberId)} is eligible for promotion`, detail: e.label, severity: "info" });
  }
  for (const f of input.failedPayments) {
    alerts.push({ kind: "payment_failed", memberId: f.memberId, title: `${name(f.memberId)}: payment of ${f.amount} failed`, detail: "Dunning in progress. Card update link sent.", severity: "bad" });
  }
  const rank = { bad: 0, warn: 1, info: 2 } as const;
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
