// LEDGER-1b (bloc החלטות 305–317) בפאנל: מחלוקת תשלום פתוחה = על רשומה חיה בלבד (רשומה שסימון התשלום שלה בוטל — bloc 214 —
// לא "מחלוקת פתוחה"), בבקרת הכסף ובספקים; קריאה שנכשלה אינה 0. הפאנל קורא בלבד — אין כתיבה לטבלאות הכסף של bloc.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => String(readFileSync(join(ROOT, p), "utf8"));
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(join(ROOT, dir)) as string[]) {
    const p = `${dir}/${n}`;
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n) && !p.includes("__tests__") && !n.startsWith(".__mt")) out.push(p);
  }
  return out;
}

describe("open disputes are on live records only", () => {
  it("the money route and the suppliers route filter reversed_at", () => {
    expect(read("src/app/api/money/route.ts")).toContain('.eq("confirmation_status", "disputed").is("reversed_at", null)');
    expect(read("src/app/api/suppliers/route.ts")).toContain('.eq("confirmation_status", "disputed").is("reversed_at", null)');
  });
  it("a failed read is not 0: the tile goes through tile() (\"—\"), the suppliers list says it did not load", () => {
    expect(read("src/lib/money.ts")).toContain('tile("disputes", "מחלוקות ספקים פתוחות", i.disputes, "warning",');
    const r = read("src/app/api/suppliers/route.ts");
    expect(r).toContain("open_disputes: disputesFailed ? null : disputes[s.id] ?? 0,");
    expect(r).toContain("...(disputesFailed ? { disputes_failed: true } : {})");
    const page = read("src/app/(panel)/suppliers/page.tsx");
    expect(page).toContain("<DisputesFailedNotice failed={disputesFailed} />");
    expect(page).toContain("setDisputesFailed(!!j.disputes_failed);");   // the flag of the route reaches the notice
    expect(page).toContain("<DisputesBadge count={s.open_disputes} />");
    // the money route: the list too — null, not [] (the board says the read failed)
    expect(read("src/app/api/money/route.ts")).toContain("disputes: disputes === null ? null : disputes.map((d) =>");
    expect(read("src/components/ui/MoneyBoard.tsx")).toContain('data-money-failed="disputes"');
  });
});

describe("the panel only reads bloc's money tables", () => {
  const MONEY = ["payments", "payment_requests", "resident_balance", "commitments", "expenses", "supplier_payments", "recurring_payments", "approval_requests", "quote_responses"];
  it("no update / insert / upsert / delete on them anywhere in src", () => {
    const bad: string[] = [];
    for (const f of walk("src")) {
      const t = read(f);
      for (const tb of MONEY) {
        const re = new RegExp(`from\\(\\s*["'\`]${tb}["'\`]\\s*\\)([^;]{0,300})`, "g");
        for (const m of t.matchAll(re)) if (/\.(update|insert|upsert|delete)\s*\(/.test(m[1])) bad.push(`${f}: ${tb}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
