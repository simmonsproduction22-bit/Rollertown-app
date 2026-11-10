import type { Dataset } from "@/lib/data/memory-store";
import { makeRng, SeedBuilder } from "./builder";
import { seedComms } from "./comms";
import { seedCommerce } from "./commerce";
import { seedGym } from "./gym";
import { seedMartialArts } from "./martial";
import { seedSchedule } from "./schedule";

/**
 * Builds the complete "Demo MMA Academy" dataset. Deterministic for a given
 * seed; dates are relative to `now` so the demo always looks current.
 */
export function generateDemoDataset(now: Date = new Date(), seed = 42): Dataset {
  const b = new SeedBuilder(makeRng(seed), now);
  const gs = seedGym(b);
  const sch = seedSchedule(b, gs);
  seedCommerce(b, gs, sch);
  seedMartialArts(b, gs);
  seedComms(b, gs, sch);
  return b.data;
}
