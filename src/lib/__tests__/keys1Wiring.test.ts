// KEYS-1 wiring: the keys reach bloc only through the signed callBloc('/api/internal/keys'); the permission is checked before
// anything else; the security page shows the card to all staff with the action rights from the RBAC matrix; the card talks only
// to /api/keys; the log page knows the three new actions.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AUDIT_LABELS } from "@/lib/auditLabels";
import { HEALTH_CHECKS, blocHealthRows } from "@/lib/securityHealth";

const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const route = read("app/api/keys/route.ts");
/** the source of one exported handler, up to the next export */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`);
  const next = src.indexOf("\nexport ", start + 1);
  return start < 0 ? "" : src.slice(start, next < 0 ? undefined : next);
}

describe("KEYS-1 wiring", () => {
  it("callBloc knows /api/internal/keys", () => {
    expect(read("lib/blocApi.ts")).toContain('"/api/internal/keys"');
  });
  it("GET: guard() first (any staff), then bloc's status", () => {
    const g = fnBody(route, "GET");
    expect(g).toMatch(/await guard\(\)/);
    expect(g.indexOf("guard(")).toBeLessThan(g.indexOf("callBloc("));
    expect(g).toMatch(/callBloc\("\/api\/internal\/keys", \{ action: "status" \}\)/);
  });
  it("POST: security.manage before the body is read and before bloc; the actor (with its role) comes from the session", () => {
    const p = fnBody(route, "POST");
    expect(p).toMatch(/guard\(\{ permission: "security\.manage" \}\)/);
    expect(p.indexOf("guard(")).toBeLessThan(p.indexOf("parseBody("));
    expect(p.indexOf("parseBody(")).toBeLessThan(p.indexOf("callBloc("));
    expect(p).toMatch(/actor: \{ id: session\.id, email: session\.email, role: session\.role \}/);
    expect(p).not.toMatch(/actor: (parsed|body|req)/);
  });
  it("maxDuration 60, like the sibling callBloc routes (review P3)", () => {
    expect(route).toMatch(/^export const maxDuration = 60;$/m);
  });
  it("C5: a real run needs the dry-run token before bloc is called; the token is forwarded on real runs only", () => {
    const p = fnBody(route, "POST");
    const check = p.indexOf('if (!dryRun && !isDryRunToken(dryRunToken)) return fail({ status: 400, code: "dry_run_required"');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(p.indexOf("callBloc("));
    expect(p).toContain("...(dryRun ? {} : { dryRunToken }),");
  });
  it("C5: the card posts the bodies built in lib — the real run carries the fresh dry run's token", () => {
    const card = read("components/ui/EncryptionKeysCard.tsx");
    expect(card).toContain("await post(dryRunBody())");
    expect(card).toContain("await post(reencryptBody(n.value, dry))");
    expect(card).toContain("body: JSON.stringify(body),");
  });
  it("the route touches no table and no key: no adminClient, no env", () => {
    expect(route).not.toMatch(/adminClient|process\.env|ENCRYPTION_KEYS_/);
  });
  it("the security page renders the card for all staff, with the action rights from the matrix", () => {
    const page = read("app/(panel)/security/page.tsx");
    expect(page).toContain('import EncryptionKeysCard from "@/components/ui/EncryptionKeysCard"');
    expect(page).toMatch(/<EncryptionKeysCard canAct=\{can\(session\.role, "security\.manage"\)\} \/>/);
    // לא בתוך התנאי של סופר-אדמין: כל הצוות רואה
    expect(page).not.toMatch(/superadmin" && <EncryptionKeysCard/);
  });
  it("the card talks only to /api/keys — never to bloc, Supabase or an env value", () => {
    const card = read("components/ui/EncryptionKeysCard.tsx");
    const urls = [...card.matchAll(/fetch\(\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    expect(new Set(urls)).toEqual(new Set(["/api/keys"]));
    expect(card).not.toMatch(/@\/lib\/(blocApi|supabase)|process\.env/);
  });
  it("the browser bundle stays light: the card and its lib import no zod; the POST schema lives with the others in validation", () => {
    expect(read("lib/encryptionKeys.ts")).not.toMatch(/from "zod"/);
    expect(read("components/ui/EncryptionKeysCard.tsx")).not.toMatch(/from "zod"|@\/lib\/validation/);
    expect(read("lib/validation.ts")).toMatch(/export const keysActionSchema/);
    expect(route).toMatch(/import \{ parseBody, keysActionSchema \} from "@\/lib\/validation"/);
  });
  it("the log page names the four actions", () => {
    expect(AUDIT_LABELS.KEYS_DRY_RUN?.label).toBe("ריצת ניסיון להצפנה מחדש");
    expect(AUDIT_LABELS.KEYS_REENCRYPT?.label).toBe("הצפנה מחדש");
    expect(AUDIT_LABELS.KEYS_REENCRYPT_UNKNOWN?.label).toBe("הצפנה מחדש שלא ידוע אם בוצעה");
    expect(AUDIT_LABELS.KEYS_REENCRYPT_PARTIAL?.label).toBe("הצפנה מחדש שנעצרה באמצע");
    for (const a of ["KEYS_DRY_RUN", "KEYS_REENCRYPT", "KEYS_REENCRYPT_UNKNOWN", "KEYS_REENCRYPT_PARTIAL"]) expect(route, a).toContain(`"${a}"`);
  });
  it("bloc's new health check (bloc_supplier_bank_keys) has a Hebrew title and a fix that names the env var, not a value", () => {
    const h = HEALTH_CHECKS.bloc_supplier_bank_keys;
    expect(h?.title).toBe("מפתח ההצפנה של פרטי הבנק של ספקים");
    expect(h?.fix).toContain("ENCRYPTION_KEYS_SUPPLIER_BANK");
    expect(h?.known).toBeUndefined();   // פגום = אדום, לא "ידוע ופתוח"
    expect(blocHealthRows({ checks: [{ check_key: "bloc_supplier_bank_keys", ok: false, detail: "פגום" }] })).toEqual([{ check_key: "bloc_supplier_bank_keys", ok: false, detail: "פגום" }]);
  });
});
