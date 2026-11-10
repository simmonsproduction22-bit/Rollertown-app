import { defaultsFor } from "./defaults";
import { StoreError, type Insert, type Op, type Query, type Store, type Where } from "./store";
import type { TableName, Tables } from "./types";

export type Dataset = { [N in TableName]: Tables[N][] };

function matchOp(value: unknown, op: Op<unknown>): boolean {
  if (op !== null && typeof op === "object" && !Array.isArray(op)) {
    const o = op as Record<string, unknown>;
    if ("in" in o) return (o.in as unknown[]).includes(value);
    if ("gte" in o) return (value as never) >= (o.gte as never);
    if ("lte" in o) return (value as never) <= (o.lte as never);
    if ("gt" in o) return (value as never) > (o.gt as never);
    if ("lt" in o) return (value as never) < (o.lt as never);
    if ("neq" in o) return value !== o.neq;
    if ("isNull" in o) return o.isNull ? value == null : value != null;
  }
  return value === op;
}

function matches<T>(row: T, where?: Where<T>): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, op]) => op === undefined || matchOp((row as Record<string, unknown>)[k], op as Op<unknown>));
}

const clone = <T>(v: T): T => structuredClone(v);

/**
 * In-memory store for demo mode. Rows are cloned in and out so callers can
 * never mutate shared state by accident.
 */
export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private data: Dataset;
  private seq = 1;

  constructor(seed: Dataset) {
    this.data = clone(seed);
  }

  private rows<N extends TableName>(table: N): Tables[N][] {
    return (this.data[table] ?? []) as Tables[N][];
  }

  async list<N extends TableName>(table: N, query: Query<Tables[N]> = {}): Promise<Tables[N][]> {
    let out = this.rows(table).filter((r) => matches(r, query.where));
    if (query.order) {
      const { column, ascending = true } = query.order;
      out = [...out].sort((a, b) => {
        const av = a[column] as unknown as string | number;
        const bv = b[column] as unknown as string | number;
        if (av === bv) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av < bv ? -1 : 1) * (ascending ? 1 : -1);
      });
    }
    if (query.limit) out = out.slice(0, query.limit);
    return clone(out);
  }

  async get<N extends TableName>(table: N, id: string): Promise<Tables[N] | null> {
    const row = this.rows(table).find((r) => (r as { id?: unknown }).id === id);
    return row ? clone(row) : null;
  }

  async first<N extends TableName>(table: N, query: Query<Tables[N]>): Promise<Tables[N] | null> {
    const [row] = await this.list(table, { ...query, limit: 1 });
    return row ?? null;
  }

  async count<N extends TableName>(table: N, query: Query<Tables[N]> = {}): Promise<number> {
    return this.rows(table).filter((r) => matches(r, query.where)).length;
  }

  async insert<N extends TableName>(table: N, row: Insert<Tables[N]>): Promise<Tables[N]> {
    const idCol = table === "audit_log" || table === "credit_ledger" || table === "webhook_deliveries" ? this.seq++ : crypto.randomUUID();
    const full = { id: idCol, ...defaultsFor(table), ...clone(row) } as Tables[N];
    this.data = { ...this.data, [table]: [...this.rows(table), full] };
    return clone(full);
  }

  async insertMany<N extends TableName>(table: N, rows: readonly Insert<Tables[N]>[]): Promise<Tables[N][]> {
    const out: Tables[N][] = [];
    for (const r of rows) out.push(await this.insert(table, r));
    return out;
  }

  async update<N extends TableName>(table: N, id: string, patch: Partial<Tables[N]>): Promise<Tables[N]> {
    const current = this.rows(table).find((r) => (r as { id?: unknown }).id === id);
    if (!current) throw new StoreError(`${table} ${id} not found`, "NOT_FOUND");
    if (table === "audit_log") throw new StoreError("audit_log is append-only", "IMMUTABLE");
    const next = { ...current, ...clone(patch) } as Tables[N];
    this.data = { ...this.data, [table]: this.rows(table).map((r) => ((r as { id?: unknown }).id === id ? next : r)) };
    return clone(next);
  }

  async remove<N extends TableName>(table: N, id: string): Promise<void> {
    if (table === "audit_log") throw new StoreError("audit_log is append-only", "IMMUTABLE");
    this.data = { ...this.data, [table]: this.rows(table).filter((r) => (r as { id?: unknown }).id !== id) };
  }

  snapshot(): Dataset {
    return clone(this.data);
  }
}
