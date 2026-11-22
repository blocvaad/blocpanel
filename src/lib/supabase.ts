// src/lib/supabase.ts — S345, שלב 4 בתוכנית ההשקה (א3, bloc החלטה 444): הפאנל בלי מפתח למסד.
//
// עד עכשיו: client של supabase-js עם SUPABASE_SERVICE_ROLE_KEY — כל הפאנל קרא וכתב ישירות לכל טבלה. מעכשיו: אותו ממשק
// (adminClient.from(...).select(...).eq(...), rpc, storage.createSignedUrls), אבל כל שאילתה נשלחת ל-bloc בבקשה חתומה
// (api/internal/panel-db — אותו ערוץ HMAC כמו שאר הפעולות, lib/blocApi), ו-bloc מריץ רק מה שבמדיניות שלו: אילו טבלאות
// ועמודות (גם בסינון ובמיון), אילו RPC, ואילו כתיבות (רק לטבלאות של הפאנל). '*' על טבלה רגישה (בניינים) מחזיר רק את
// העמודות המותרות — מפתחות סליקה וקוד הדלת לא מגיעים לפאנל.
//
// שאילתות שנוצרות באותו סבב (Promise.all) נשלחות בבקשה אחת (עד 25). כשל בערוץ (bloc לא זמין / לא מוגדר) — לכל שאילתה
// error עם code (BLOC_UNAVAILABLE / NOT_CONFIGURED), כמו שגיאה של supabase — והמסכים כבר מציגים "לא נטען" על error.
// אחרי שהגרסה באוויר — הבעלים מוחק את SUPABASE_SERVICE_ROLE_KEY מה-Vercel של הפאנל (הקוד כבר לא קורא אותו).
import { callBloc, type BlocResult } from "./blocApi";

// הטיפוסים — כמו של supabase-js ב-client בלי Database: שורות any[], single → any, ותשובה שהיא הצלחה או כשל (data: null).
export type DbError = { code: string; message: string; details: string; hint: string };
type DbOk<R> = { data: R; error: null; count: number | null; status: number; statusText: string };
type DbFail = { data: null; error: DbError; count: null; status: number; statusText: string };
export type DbResult<R = any> = DbOk<R> | DbFail;

type Filter =
  | { op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "is"; col: string; val: unknown }
  | { op: "in"; col: string; val: unknown[] }
  | { op: "not"; col: string; notOp: string; val: unknown }
  | { op: "or"; expr: string; foreignTable?: string }
  | { op: "filter"; col: string; filterOp: string; val: unknown };
type Order = { col: string; ascending?: boolean; nullsFirst?: boolean; foreignTable?: string };
export type PanelDbOp = Record<string, unknown> & { kind: string };
type WireError = { code: string | null; message: string };
type Wire = { data: unknown; error: WireError | null; count: number | null };

/** הערוץ ל-bloc — מוחלף בטסטים. */
export type PanelDbTransport = (ops: PanelDbOp[]) => Promise<Wire[]>;

const OPS_PER_REQUEST = 25;
const TIMEOUT_MS = 15_000;

const failAll = (n: number, code: string, message: string): Wire[] =>
  Array.from({ length: n }, () => ({ data: null, error: { code, message }, count: null }));

export const blocTransport: PanelDbTransport = async (ops) => {
  const r: BlocResult = await callBloc("/api/internal/panel-db", { ops }, { timeoutMs: TIMEOUT_MS });
  if (!r.ok) return failAll(ops.length, r.code ?? "BLOC_UNAVAILABLE", r.error);
  const results = (r.data as { results?: unknown }).results;
  if (!Array.isArray(results) || results.length !== ops.length) return failAll(ops.length, "BLOC_BAD_REPLY", "תשובה לא צפויה מ-bloc");
  return results as Wire[];
};

let transport: PanelDbTransport = blocTransport;
/** בטסטים בלבד. */
export function setPanelDbTransport(t: PanelDbTransport | null): void { transport = t ?? blocTransport; }

// ── איסוף לבקשה אחת: כל מה שנוצר עד סוף הסבב הנוכחי ──
type Pending = { op: PanelDbOp; resolve: (w: Wire) => void };
let queue: Pending[] = [];
let scheduled = false;
const later: (fn: () => void) => void =
  typeof setImmediate === "function" ? (fn) => { setImmediate(fn); } : (fn) => { setTimeout(fn, 0); };

function flush(): void {
  scheduled = false;
  const items = queue;
  queue = [];
  for (let i = 0; i < items.length; i += OPS_PER_REQUEST) {
    const part = items.slice(i, i + OPS_PER_REQUEST);
    transport(part.map((p) => p.op))
      .then((res) => part.forEach((p, j) => p.resolve(res[j] ?? { data: null, error: { code: "BLOC_BAD_REPLY", message: "תשובה חסרה מ-bloc" }, count: null })))
      .catch((e: unknown) => part.forEach((p) => p.resolve({ data: null, error: { code: "BLOC_UNAVAILABLE", message: String((e as Error)?.message ?? e) }, count: null })));
  }
}

function run<T = any>(op: PanelDbOp): Promise<DbResult<T>> {
  return new Promise<Wire>((resolve) => {
    queue.push({ op, resolve });
    if (!scheduled) { scheduled = true; later(flush); }
  }).then((w): DbResult<T> => (w.error
    ? { data: null, error: { code: w.error.code ?? "", message: String(w.error.message ?? ""), details: "", hint: "" }, count: null, status: 400, statusText: "Error" }
    : { data: w.data as T, error: null, count: w.count, status: 200, statusText: "OK" }));
}

/** בונה שאילתה עם אותו ממשק של supabase-js (החלק שהפאנל משתמש בו). כמו שם — המתודות משנות את אותו אובייקט. */
export class PanelQuery<T = any[]> implements PromiseLike<DbResult<T>> {
  private op: PanelDbOp;
  constructor(table: string) { this.op = { kind: "select", table, filters: [] as Filter[], order: [] as Order[] }; }

  select(columns?: string, opts?: { count?: "exact" | "planned" | "estimated"; head?: boolean }): this {
    if (this.op.kind === "select") {
      if (columns !== undefined) this.op.select = columns;
      if (opts?.count) this.op.count = opts.count;
      if (opts?.head) this.op.head = true;
    } else {
      this.op.select = columns ?? "*";
    }
    return this;
  }
  insert(values: Record<string, unknown> | Record<string, unknown>[]): this {
    this.op = { kind: "insert", table: this.op.table, rows: Array.isArray(values) ? values : [values] };
    return this;
  }
  update(patch: Record<string, unknown>): this {
    this.op = { kind: "update", table: this.op.table, patch, filters: [] as Filter[] };
    return this;
  }
  delete(): this {
    this.op = { kind: "delete", table: this.op.table, filters: [] as Filter[] };
    return this;
  }
  private push(f: Filter): this {
    const list = (this.op.filters ?? (this.op.filters = [])) as Filter[];
    list.push(f);
    return this;
  }
  eq(col: string, val: unknown): this { return this.push({ op: "eq", col, val }); }
  neq(col: string, val: unknown): this { return this.push({ op: "neq", col, val }); }
  gt(col: string, val: unknown): this { return this.push({ op: "gt", col, val }); }
  gte(col: string, val: unknown): this { return this.push({ op: "gte", col, val }); }
  lt(col: string, val: unknown): this { return this.push({ op: "lt", col, val }); }
  lte(col: string, val: unknown): this { return this.push({ op: "lte", col, val }); }
  like(col: string, val: string): this { return this.push({ op: "like", col, val }); }
  ilike(col: string, val: string): this { return this.push({ op: "ilike", col, val }); }
  is(col: string, val: unknown): this { return this.push({ op: "is", col, val }); }
  in(col: string, val: readonly unknown[]): this { return this.push({ op: "in", col, val: [...val] }); }
  not(col: string, notOp: string, val: unknown): this { return this.push({ op: "not", col, notOp, val }); }
  or(expr: string, opts?: { foreignTable?: string }): this { return this.push({ op: "or", expr, ...(opts?.foreignTable ? { foreignTable: opts.foreignTable } : {}) }); }
  filter(col: string, filterOp: string, val: unknown): this { return this.push({ op: "filter", col, filterOp, val }); }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string }): this {
    const list = (this.op.order ?? (this.op.order = [])) as Order[];
    list.push({ col, ...(opts?.ascending !== undefined ? { ascending: opts.ascending } : {}), ...(opts?.nullsFirst !== undefined ? { nullsFirst: opts.nullsFirst } : {}), ...(opts?.foreignTable ? { foreignTable: opts.foreignTable } : {}) });
    return this;
  }
  limit(n: number): this { this.op.limit = n; return this; }
  range(from: number, to: number): this { this.op.range = [from, to]; return this; }
  single(): PanelQuery<any> { this.op.single = "one"; return this as unknown as PanelQuery<any>; }
  maybeSingle(): PanelQuery<any> { this.op.single = "maybe"; return this as unknown as PanelQuery<any>; }
  /** בטסטים: מה יישלח. */
  toOp(): PanelDbOp {
    const op = { ...this.op };
    if (Array.isArray(op.filters) && !(op.filters as unknown[]).length && op.kind === "select") delete op.filters;
    if (Array.isArray(op.order) && !(op.order as unknown[]).length) delete op.order;
    return op;
  }
  then<A = DbResult<T>, B = never>(onOk?: ((v: DbResult<T>) => A | PromiseLike<A>) | null, onErr?: ((e: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    return run<T>(this.toOp()).then(onOk, onErr);
  }
}

class PanelRpc<T = any> implements PromiseLike<DbResult<T>> {
  constructor(private fn: string, private args: Record<string, unknown> | undefined) {}
  then<A = DbResult<T>, B = never>(onOk?: ((v: DbResult<T>) => A | PromiseLike<A>) | null, onErr?: ((e: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    return run<T>({ kind: "rpc", fn: this.fn, ...(this.args ? { args: this.args } : {}) }).then(onOk, onErr);
  }
}

export const adminClient = {
  from: <T = any[]>(table: string) => new PanelQuery<T>(table),
  rpc: <T = any>(fn: string, args?: Record<string, unknown>) => new PanelRpc<T>(fn, args),
  storage: {
    from: (bucket: string) => ({
      createSignedUrls: (paths: string[], expiresIn: number) => run<Array<{ path: string | null; signedUrl: string; error: string | null }>>({ kind: "signedUrls", bucket, paths, expiresIn }),
    }),
  },
};
export type PanelDb = typeof adminClient;
