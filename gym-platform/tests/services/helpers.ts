import { MemoryStore } from "@/lib/data/memory-store";
import { stubPayments } from "@/lib/payments/stub";
import { DEMO_GYM_ID } from "@/lib/seed/constants";
import { generateDemoDataset } from "@/lib/seed/generate";
import { loadGym, type Ctx } from "@/lib/services/context";

export const NOW = new Date("2026-11-10T15:00:00Z");
const dataset = generateDemoDataset(NOW);

export async function makeCtx(now: Date = NOW): Promise<Ctx> {
  const store = new MemoryStore(dataset);
  const gym = await loadGym(store, DEMO_GYM_ID);
  return { store, gym, actor: { userId: null, label: "test", role: "owner" }, payments: stubPayments, now: () => now };
}
