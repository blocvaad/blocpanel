// BILL-1a test helper: a Supabase-like client whose every query chain resolves to a per-table result.
export type TableResult = { data?: unknown; error?: { message: string } | null; count?: number | null };
export function makeAdminClient(tables: Record<string, TableResult | ((q: { ops: string[] }) => TableResult)>, log?: { table: string; op: string }[]) {
  return {
    from(table: string) {
      const q = { ops: [] as string[] };
      const res = () => { const t = tables[table]; const r = typeof t === "function" ? t(q) : t; return { data: null, error: null, count: null, ...(r ?? {}) }; };
      const chain: any = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "then") return (ok: any, bad: any) => Promise.resolve(res()).then(ok, bad);
          return (...args: unknown[]) => { q.ops.push(`${prop}:${JSON.stringify(args)}`); log?.push({ table, op: prop }); return chain; };
        },
      });
      return chain;
    },
  };
}
