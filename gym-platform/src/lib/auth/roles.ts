import type { Role } from "@/lib/data/types";

export const STAFF_ROLES: readonly Role[] = ["owner", "manager", "front_desk", "head_coach", "coach"];
export const DESK_ROLES: readonly Role[] = ["owner", "manager", "front_desk"];
export const MANAGER_ROLES: readonly Role[] = ["owner", "manager"];
export const COACH_ROLES: readonly Role[] = ["head_coach", "coach", "independent_coach"];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner", manager: "Manager", front_desk: "Front Desk", head_coach: "Head Coach", coach: "Coach",
  independent_coach: "Independent Coach", member: "Member", guardian: "Parent / Guardian",
};

/** Capability → roles allowed. RLS is the backstop; this drives UI + actions. */
export const CAPABILITIES = {
  "dashboard.view": STAFF_ROLES,
  "members.view": STAFF_ROLES,
  "members.edit": DESK_ROLES,
  "schedule.manage": [...MANAGER_ROLES, "head_coach"],
  "bookings.manage": [...DESK_ROLES, "head_coach", "coach"],
  "checkin.kiosk": [...DESK_ROLES, "head_coach", "coach"],
  "payments.view": DESK_ROLES,
  "payments.refund": MANAGER_ROLES,
  "payments.sell": DESK_ROLES,
  "policy.override": MANAGER_ROLES,
  "reports.view": MANAGER_ROLES,
  "ranks.promote": ["owner", "manager", "head_coach", "coach"],
  "ranks.configure": [...MANAGER_ROLES, "head_coach"],
  "fightteam.view": STAFF_ROLES,
  "fightteam.edit": ["owner", "manager", "head_coach", "coach"],
  "messages.view": [...STAFF_ROLES, "independent_coach"],
  "leads.manage": DESK_ROLES,
  "settings.manage": MANAGER_ROLES,
  "developers.manage": ["owner"],
  "export.run": ["owner", "manager"],
  "import.run": MANAGER_ROLES,
  "pos.sell": DESK_ROLES,
  "coach.self": COACH_ROLES,
  "member.self": ["member", "guardian"],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: Role, cap: Capability): boolean {
  return (CAPABILITIES[cap] as readonly Role[]).includes(role);
}

/** Where each role lands after sign-in. */
export function homeFor(role: Role): string {
  if (role === "member" || role === "guardian") return "/m";
  if (role === "independent_coach") return "/app/coach";
  return "/app";
}
