import { describe, it, expect } from "vitest";
import { fetchAll } from "../fetchAll";

const table = (n: number) => Array.from({ length: n }, (_, i) => ({ i }));
const pager = (rows: Array<{ i: number }>, calls: Array<[number, number]>, failAt = -1) =>
  (from: number, to: number) => {
    calls.push([from, to]);
    if (calls.length - 1 === failAt) return Promise.resolve({ data: null, error: { message: "boom" } });
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  };

describe("fetchAll — past PostgREST's 1000-row cap", () => {
  it("reads every page until a short page", async () => {
    const calls: Array<[number, number]> = [];
    const r = await fetchAll(pager(table(2500), calls), { pageSize: 1000 });
    expect(r.rows).toHaveLength(2500);
    expect(r.truncated).toBe(false);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it("exact multiple needs one extra empty page, still not truncated", async () => {
    const calls: Array<[number, number]> = [];
    const r = await fetchAll(pager(table(2000), calls), { pageSize: 1000 });
    expect(r.rows).toHaveLength(2000);
    expect(r.truncated).toBe(false);
    expect(calls).toHaveLength(3);
  });
  it("stops at maxPages and says the result is partial", async () => {
    const r = await fetchAll(pager(table(50), []), { pageSize: 10, maxPages: 3 });
    expect(r.rows).toHaveLength(30);
    expect(r.truncated).toBe(true);
  });
  it("an error mid-way is reported, never a silent short total", async () => {
    const r = await fetchAll(pager(table(50), [], 1), { pageSize: 10 });
    expect(r.rows).toHaveLength(10);
    expect(r.error).toBe(true);
    expect(r.truncated).toBe(true);
  });
});
