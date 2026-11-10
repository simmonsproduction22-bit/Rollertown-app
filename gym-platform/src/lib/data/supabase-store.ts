import type { SupabaseClient } from "@supabase/supabase-js";
import { StoreError, type Insert, type Query, type Store } from "./store";
import type { TableName, Tables } from "./types";

type Builder = {
  eq(c: string, v: unknown): Builder; in(c: string, v: readonly unknown[]): Builder; gte(c: string, v: unknown): Builder;
  lte(c: string, v: unknown): Builder; gt(c: string, v: unknown): Builder; lt(c: string, v: unknown): Builder;
  neq(c: string, v: unknown): Builder; is(c: string, v: null): Builder; not(c: string, op: string, v: null): Builder;
  order(c: string, o: { ascending: boolean }): Builder; limit(n: number): Builder;
};

function applyQuery<B>(builder: B, query: Query<unknown> = {}): B {
  let b = builder as unknown as Builder;
  for (const [col, op] of Object.entries(query.where ?? {})) {
    if (op === undefined) continue;
    if (op !== null && typeof op === "object" && !Array.isArray(op)) {
      const o = op as Record<string, unknown>;
      if ("in" in o) b = b.in(col, o.in as unknown[]);
      else if ("gte" in o) b = b.gte(col, o.gte);
      else if ("lte" in o) b = b.lte(col, o.lte);
      else if ("gt" in o) b = b.gt(col, o.gt);
      else if ("lt" in o) b = b.lt(col, o.lt);
      else if ("neq" in o) b = b.neq(col, o.neq);
      else if ("isNull" in o) b = o.isNull ? b.is(col, null) : b.not(col, "is", null);
    } else {
      b = b.eq(col, op);
    }
  }
  if (query.order) b = b.order(query.order.column, { ascending: query.order.ascending ?? true });
  if (query.limit) b = b.limit(query.limit);
  return b as unknown as B;
}

function fail(table: string, error: { message: string; code?: string }): never {
  // Never leak SQL details to users; callers log + map codes.
  throw new StoreError(`${table}: ${error.message}`, error.code ?? "DB_ERROR");
}

/** Live store. Pass a client built from the user's session so RLS applies. */
export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  constructor(private readonly client: SupabaseClient) {}

  async list<N extends TableName>(table: N, query?: Query<Tables[N]>): Promise<Tables[N][]> {
    const { data, error } = await applyQuery(this.client.from(table).select("*"), query as Query<unknown>);
    if (error) fail(table, error);
    return (data ?? []) as Tables[N][];
  }

  async get<N extends TableName>(table: N, id: string): Promise<Tables[N] | null> {
    const { data, error } = await this.client.from(table).select("*").eq("id", id).maybeSingle();
    if (error) fail(table, error);
    return (data as Tables[N]) ?? null;
  }

  async first<N extends TableName>(table: N, query: Query<Tables[N]>): Promise<Tables[N] | null> {
    const rows = await this.list(table, { ...query, limit: 1 });
    return rows[0] ?? null;
  }

  async count<N extends TableName>(table: N, query?: Query<Tables[N]>): Promise<number> {
    const { count, error } = await applyQuery(this.client.from(table).select("*", { count: "exact", head: true }), { where: query?.where } as Query<unknown>);
    if (error) fail(table, error);
    return count ?? 0;
  }

  async insert<N extends TableName>(table: N, row: Insert<Tables[N]>): Promise<Tables[N]> {
    const { data, error } = await this.client.from(table).insert(row as never).select("*").single();
    if (error) fail(table, error);
    return data as Tables[N];
  }

  async insertMany<N extends TableName>(table: N, rows: readonly Insert<Tables[N]>[]): Promise<Tables[N][]> {
    if (rows.length === 0) return [];
    const { data, error } = await this.client.from(table).insert(rows as never).select("*");
    if (error) fail(table, error);
    return (data ?? []) as Tables[N][];
  }

  async update<N extends TableName>(table: N, id: string, patch: Partial<Tables[N]>): Promise<Tables[N]> {
    const { data, error } = await this.client.from(table).update(patch as never).eq("id", id).select("*").single();
    if (error) fail(table, error);
    return data as Tables[N];
  }

  async remove<N extends TableName>(table: N, id: string): Promise<void> {
    const { error } = await this.client.from(table).delete().eq("id", id);
    if (error) fail(table, error);
  }
}
