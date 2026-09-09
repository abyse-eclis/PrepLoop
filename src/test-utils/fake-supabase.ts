/**
 * A latency-simulating fake of the Supabase client used only in tests.
 *
 * Every query resolves after `latencyMs` and is recorded with its start/end
 * time, so a test can measure how many *sequential* round-trips (stages) a
 * data loader performs. Two queries started in the same `Promise.all()` land
 * in the same stage; a query that waits for another to finish lands one stage
 * deeper. The stage depth is what dominates page latency on a remote database.
 */

export interface RecordedQuery {
  table: string;
  select: string;
  start: number;
  end: number;
  stage: number;
}

export interface FakeSupabaseStats {
  queries: RecordedQuery[];
  authCalls: number;
  /** Deepest sequential chain of queries. */
  depth(): number;
  reset(): void;
}

type Row = Record<string, unknown>;
type TableData = (ctx: { select: string; filters: Array<[string, unknown]> }) => Row[];

export interface FakeSupabaseOptions {
  latencyMs?: number;
  tables?: Record<string, Row[] | TableData>;
  userId?: string;
}

class FakeQuery implements PromiseLike<{ data: unknown; error: null; count: number | null }> {
  private isSingle = false;
  private head = false;
  private promise: Promise<{ data: unknown; error: null; count: number | null }> | null = null;
  private filters: Array<[string, unknown]> = [];
  private selectCols = "*";

  constructor(
    private readonly table: string,
    private readonly opts: Required<Pick<FakeSupabaseOptions, "latencyMs">> & {
      tables: Record<string, Row[] | TableData>;
    },
    private readonly stats: FakeSupabaseStats & { queries: RecordedQuery[] }
  ) {}

  select(cols?: string, options?: { head?: boolean }) {
    if (typeof cols === "string") this.selectCols = cols;
    if (options?.head) this.head = true;
    return this;
  }
  insert() {
    return this;
  }
  upsert() {
    return this;
  }
  update() {
    return this;
  }
  delete() {
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push([col, value]);
    return this;
  }
  neq() {
    return this;
  }
  in(col: string, value: unknown) {
    this.filters.push([col, value]);
    return this;
  }
  lte() {
    return this;
  }
  gte() {
    return this;
  }
  lt() {
    return this;
  }
  gt() {
    return this;
  }
  not() {
    return this;
  }
  is() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  maybeSingle() {
    this.isSingle = true;
    return this;
  }
  single() {
    this.isSingle = true;
    return this;
  }

  private run() {
    if (this.promise) return this.promise;
    const start = performance.now();
    const record: RecordedQuery = {
      table: this.table,
      select: this.selectCols,
      start,
      end: 0,
      stage: 0,
    };
    // A query's stage is one deeper than the deepest query that had already
    // finished when this one started.
    let deepestFinished = 0;
    for (const q of this.stats.queries) {
      if (q.end > 0 && q.end <= start) deepestFinished = Math.max(deepestFinished, q.stage);
    }
    record.stage = deepestFinished + 1;
    this.stats.queries.push(record);

    this.promise = new Promise((resolve) => {
      setTimeout(() => {
        record.end = performance.now();
        const source = this.opts.tables[this.table];
        let rows: Row[] = [];
        if (typeof source === "function") {
          rows = source({ select: this.selectCols, filters: this.filters });
        } else if (Array.isArray(source)) {
          rows = source;
        }
        const data = this.head ? null : this.isSingle ? (rows[0] ?? null) : rows;
        resolve({ data, error: null, count: rows.length });
      }, this.opts.latencyMs);
    });
    return this.promise;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: null; count: number | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

export function createFakeSupabase(options: FakeSupabaseOptions = {}) {
  const latencyMs = options.latencyMs ?? 20;
  const tables = options.tables ?? {};
  const userId = options.userId ?? "user-1";

  const stats: FakeSupabaseStats = {
    queries: [],
    authCalls: 0,
    depth() {
      return this.queries.reduce((max, q) => Math.max(max, q.stage), 0);
    },
    reset() {
      this.queries = [];
      this.authCalls = 0;
    },
  };

  const client = {
    from(table: string) {
      return new FakeQuery(table, { latencyMs, tables }, stats);
    },
    auth: {
      /** Network round-trip to the Auth server. */
      async getUser() {
        stats.authCalls += 1;
        await new Promise((r) => setTimeout(r, latencyMs));
        return { data: { user: { id: userId, email: "u@example.com" } }, error: null };
      },
      /** Local JWT verification (asymmetric signing keys) — no network. */
      async getClaims() {
        return {
          data: { claims: { sub: userId, email: "u@example.com" } },
          error: null,
        };
      },
    },
  };

  return { client, stats };
}
