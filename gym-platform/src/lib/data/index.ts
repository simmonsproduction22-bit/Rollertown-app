import "server-only";
import { isDemoMode } from "@/lib/env";
import { generateDemoDataset } from "@/lib/seed/generate";
import { MemoryStore } from "./memory-store";
import type { Store } from "./store";
import { SupabaseStore } from "./supabase-store";

const g = globalThis as unknown as { __demoStore?: MemoryStore };

/** Demo store survives hot reloads; resets on server restart or /api/demo/reset. */
export function demoStore(): MemoryStore {
  if (!g.__demoStore) g.__demoStore = new MemoryStore(generateDemoDataset());
  return g.__demoStore;
}

export function resetDemoStore(): void {
  g.__demoStore = new MemoryStore(generateDemoDataset());
}

/** Store scoped to the current user (RLS) in live mode. */
export async function userStore(): Promise<Store> {
  if (isDemoMode()) return demoStore();
  const { supabaseForUser } = await import("@/lib/supabase/server");
  return new SupabaseStore(await supabaseForUser());
}

/** Privileged store for public routes, webhooks and API-key requests. */
export async function serviceStore(): Promise<Store> {
  if (isDemoMode()) return demoStore();
  const { supabaseService } = await import("@/lib/supabase/server");
  return new SupabaseStore(supabaseService());
}
