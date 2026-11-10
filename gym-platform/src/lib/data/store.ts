import type { TableName, Tables } from "./types";

/** Filter operators supported by both the demo store and Supabase. */
export type Op<V> = V | { in: readonly V[] } | { gte: V } | { lte: V } | { gt: V } | { lt: V } | { neq: V } | { isNull: boolean };
export type Where<T> = { [K in keyof T]?: Op<T[K]> };

export interface Query<T> {
  readonly where?: Where<T>;
  readonly order?: { readonly column: keyof T & string; readonly ascending?: boolean };
  readonly limit?: number;
}

export type Insert<T> = Partial<T>;

/**
 * Repository over every table. Implementations: MemoryStore (demo mode) and
 * SupabaseStore (live, RLS enforced by the caller's JWT).
 */
export interface Store {
  readonly kind: "memory" | "supabase";
  list<N extends TableName>(table: N, query?: Query<Tables[N]>): Promise<Tables[N][]>;
  get<N extends TableName>(table: N, id: string): Promise<Tables[N] | null>;
  first<N extends TableName>(table: N, query: Query<Tables[N]>): Promise<Tables[N] | null>;
  count<N extends TableName>(table: N, query?: Query<Tables[N]>): Promise<number>;
  insert<N extends TableName>(table: N, row: Insert<Tables[N]>): Promise<Tables[N]>;
  insertMany<N extends TableName>(table: N, rows: readonly Insert<Tables[N]>[]): Promise<Tables[N][]>;
  update<N extends TableName>(table: N, id: string, patch: Partial<Tables[N]>): Promise<Tables[N]>;
  remove<N extends TableName>(table: N, id: string): Promise<void>;
}

export class StoreError extends Error {
  constructor(message: string, readonly code: string = "STORE_ERROR") {
    super(message);
    this.name = "StoreError";
  }
}
