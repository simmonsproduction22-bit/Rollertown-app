/** Fixed IDs so demo sessions and docs can reference known rows. */
export const DEMO_GYM_ID = "d0000000-0000-4000-8000-000000000001";
export const DEMO_LOCATION_ID = "d0000000-0000-4000-8000-000000000010";
export const DEMO_LOCATION_2_ID = "d0000000-0000-4000-8000-000000000011";

export const DEMO_USERS = {
  owner: { id: "d0000000-0000-4000-8000-0000000000a1", name: "Dana Reyes", email: "owner@demo-mma.test" },
  manager: { id: "d0000000-0000-4000-8000-0000000000a2", name: "Sam Whitaker", email: "manager@demo-mma.test" },
  front_desk: { id: "d0000000-0000-4000-8000-0000000000a3", name: "Jordan Lee", email: "desk@demo-mma.test" },
  head_coach: { id: "d0000000-0000-4000-8000-0000000000a4", name: "Rafael Costa", email: "rafael@demo-mma.test" },
  coach: { id: "d0000000-0000-4000-8000-0000000000a5", name: "Nina Okafor", email: "nina@demo-mma.test" },
  independent_coach: { id: "d0000000-0000-4000-8000-0000000000a6", name: "Marcus Bell", email: "marcus@demo-mma.test" },
  member: { id: "d0000000-0000-4000-8000-0000000000a7", name: "Alex Morgan", email: "alex.morgan@demo-mma.test" },
  guardian: { id: "d0000000-0000-4000-8000-0000000000a8", name: "Priya Shah", email: "priya.shah@demo-mma.test" },
} as const;

export const DEMO_COACH_IDS = {
  rafael: "d0000000-0000-4000-8000-0000000000c1",
  nina: "d0000000-0000-4000-8000-0000000000c2",
  marcus: "d0000000-0000-4000-8000-0000000000c3",
} as const;

export const DEMO_MEMBER_ID = "d0000000-0000-4000-8000-0000000000e1";
export const DEMO_GUARDIAN_MEMBER_ID = "d0000000-0000-4000-8000-0000000000e2";

export const ADULT_NAMES: readonly [string, string][] = [
  ["Alex", "Morgan"], ["Priya", "Shah"], ["Diego", "Ramirez"], ["Keisha", "Brown"], ["Tom", "Novak"], ["Lena", "Fischer"],
  ["Omar", "Haddad"], ["Grace", "Kim"], ["Ethan", "Walsh"], ["Sofia", "Rossi"], ["Malik", "Johnson"], ["Hannah", "Cole"],
  ["Ryo", "Tanaka"], ["Ava", "Martinez"], ["Chris", "Dunn"], ["Zoe", "Patel"], ["Luis", "Ortega"], ["Maya", "Green"],
  ["Ben", "Carter"], ["Isabel", "Cruz"], ["Kwame", "Mensah"], ["Nora", "Lindqvist"], ["Jake", "Harper"], ["Elena", "Petrova"],
  ["Tyler", "Brooks"], ["Fatima", "Ali"], ["Sean", "O'Brien"], ["Mei", "Chen"],
];

export const KID_NAMES: readonly [string, string][] = [
  ["Arjun", "Shah"], ["Leela", "Shah"], ["Mateo", "Ramirez"], ["Lucia", "Ramirez"], ["Jaden", "Brown"], ["Emma", "Novak"],
  ["Noah", "Kim"], ["Aria", "Walsh"], ["Liam", "Johnson"], ["Mila", "Cole"], ["Kai", "Tanaka"], ["Ivy", "Martinez"],
];
