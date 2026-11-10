import type { Store } from "@/lib/data/store";
import type { Gym } from "@/lib/data/types";
import { withDefaults } from "@/lib/domain/settings";
import type { PaymentsProvider } from "@/lib/payments/provider";
import { AppError } from "@/lib/result";

/** Everything a service needs. Built from a Session (UI) or an API key / webhook. */
export interface Ctx {
  readonly store: Store;
  readonly gym: Gym;
  readonly actor: { readonly userId: string | null; readonly label: string; readonly role: string };
  readonly payments: PaymentsProvider;
  readonly now: () => Date;
}

export async function loadGym(store: Store, gymId: string): Promise<Gym> {
  const gym = await store.get("gyms", gymId);
  if (!gym) throw new AppError("Gym not found", 404, "NOT_FOUND");
  return { ...gym, settings: withDefaults(gym.settings) };
}

export async function audit(ctx: Ctx, action: string, entity: string, entityId: string | null, details: Record<string, unknown> = {}): Promise<void> {
  await ctx.store.insert("audit_log", {
    gym_id: ctx.gym.id, actor_user_id: ctx.actor.userId, actor_label: ctx.actor.label, action, entity,
    entity_id: entityId, details, created_at: ctx.now().toISOString(),
  });
}

export async function mustGet<N extends Parameters<Store["get"]>[0]>(ctx: Ctx, table: N, id: string) {
  const row = await ctx.store.get(table, id);
  if (!row || (row as { gym_id?: string }).gym_id !== ctx.gym.id) throw new AppError(`${String(table).replace(/_/g, " ")} not found`, 404, "NOT_FOUND");
  return row;
}
