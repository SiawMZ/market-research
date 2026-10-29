import { getTableColumns, sql, type InferInsertModel, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { z } from "zod";
import type { Db } from "@/lib/db/client";

// ---------- HTTP ----------

const UA = "Mozilla/5.0 (compatible; market-dashboard/0.1; personal research)";

/** Fetch with timeout and retries. Throws on non-2xx after the last attempt. */
export async function fetchText(url: string, init: RequestInit = {}, attempts = 3): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "User-Agent": UA, Accept: "application/json, text/html", ...init.headers },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status} ${url}`);
      if (!res.ok) throw new FatalHttpError(`HTTP ${res.status} ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (err instanceof FatalHttpError) throw err;
      await sleep(1500 * 2 ** i);
    }
  }
  throw lastErr;
}

/** Fetch JSON and validate it, so a changed API fails loudly instead of writing junk. */
export async function fetchJson<T extends z.ZodTypeAny>(url: string, schema: T, init?: RequestInit): Promise<z.infer<T>> {
  const text = await fetchText(url, init);
  const parsed = schema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new Error(`Unexpected response shape from ${url}: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  }
  return parsed.data;
}

export class FatalHttpError extends Error {}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Dates ----------

/** "YYYY-MM-DD" in UTC. */
export const isoDate = (d: Date | number) => new Date(d).toISOString().slice(0, 10);
export const today = () => isoDate(Date.now());

// ---------- Batches ----------

/** Rows for one table, written with insert ... on conflict (target) do update. */
export type Batch = {
  label: string;
  table: PgTable;
  target: string[];
  rows: Record<string, unknown>[];
};

/** Type-checked constructor: rows must match the table's insert shape. */
export function batch<T extends PgTable>(
  label: string,
  table: T,
  target: (keyof InferInsertModel<T> & string)[],
  rows: InferInsertModel<T>[],
): Batch {
  return { label, table, target, rows: rows as Record<string, unknown>[] };
}

export type Collector = {
  name: string;
  description: string;
  run: () => Promise<Batch[]>;
};

export async function upsert(db: Db, b: Batch) {
  if (b.rows.length === 0) return;
  const cols = getTableColumns(b.table) as Record<string, { name: string }>;
  const set: Record<string, SQL> = {};
  for (const [key, col] of Object.entries(cols)) {
    if (!b.target.includes(key)) set[key] = sql.raw(`excluded."${col.name}"`);
  }
  const target = b.target.map((k) => cols[k]) as never;
  for (let i = 0; i < b.rows.length; i += 500) {
    const chunk = b.rows.slice(i, i + 500);
    const q = db.insert(b.table).values(chunk as never);
    await (Object.keys(set).length ? q.onConflictDoUpdate({ target, set }) : q.onConflictDoNothing({ target }));
  }
}
