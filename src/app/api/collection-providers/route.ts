// src/app/api/collection-providers/route.ts — מתג לכל ספק סליקה (bloc PAY-M, SQL 202) ושער G14 (PAY-1b, SQL 225).
//
// סופר-אדמין בלבד, עם אישור בקוד (step-up, PANEL-PAY א1, החלטה 364): המתג משנה מה כל הוועדים רואים במסך אמצעי
// התשלום. כיבוי לא עוצר בניין שכבר מחובר (ראה lib/collectionProviders).
// PANEL-PAY א1 (החלטה 362, C3): הפאנל לא כותב יותר ל-platform_payment_providers. הבקשה נחתמת ונשלחת ל-bloc
// (/api/internal/collection-providers: set_offered / close_gate / reopen_gate), שמריץ את כללי G14 כמו שהיו כאן (הדלקה
// חסומה כשהשער פתוח, חוץ מ"חברת ניהול"; תיעוד שנרשם לא נדרס; פתיחה מחדש רק כשהספק כבוי ורק של שער שתועד), כותב ורושם
// ביומן שלו. SQL 225 רץ בפרודקשן — אין יותר מסלול בלי עמודות השער.
// יומן הפאנל: כל שינוי — עם כמה בניינים היו מחוברים לספק ברגע השינוי (קריאה; כשל — בלי המספר, השינוי כבר נשמר).
// כשל ב-bloc — MONEY_ACTION_FAILED / MONEY_ACTION_UNKNOWN עם הקוד.
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { callBloc } from "@/lib/blocApi";
import { requireStepUp } from "@/lib/stepUp";
import { parseBody, collectionProviderSchema } from "@/lib/validation";
import { COLLECTION_PROVIDERS } from "@/lib/collectionProviders";
import { actorOf, badShape, failureAudit, firstIp, moneyFailure } from "@/lib/moneyActions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROW_KEYS = ["provider", "offered", "updated_at", "updated_by", "gate_closed_at", "gate_closed_by", "gate_evidence"] as const;
/** השורה שחוזרת מ-bloc — רק העמודות שהכרטיס קורא (gateFromDb). */
function providerRow(x: unknown): Record<string, unknown> | null {
  const o = (x && typeof x === "object" ? x : null) as Record<string, unknown> | null;
  if (!o || typeof o.provider !== "string") return null;
  return Object.fromEntries(ROW_KEYS.filter((k) => k in o).map((k) => [k, o[k]]));
}

export async function POST(req: NextRequest) {
  const g = await guard({ role: "superadmin" });
  if (!g.ok) return g.response;
  const session = g.session;

  const parsed = await parseBody(req, collectionProviderSchema);
  if (!parsed.ok) return parsed.response;
  const su = requireStepUp(session, req);
  if (!su.ok) return su.response;
  const ip = firstIp(req.headers.get("x-forwarded-for"));
  const label = (p: string) => COLLECTION_PROVIDERS.find((c) => c.id === p)?.label ?? p;
  const d = parsed.data;

  // ── G14: תיעוד סגירת שער / פתיחה מחדש ──
  if ("action" in d) {
    const close = d.action === "close_gate";
    const audit = close ? "COLLECTION_PROVIDER_GATE_CLOSED" : "COLLECTION_PROVIDER_GATE_REOPENED";
    const r = await callBloc("/api/internal/collection-providers", {
      actor: actorOf(session), action: d.action, provider: d.provider, ...(d.action === "close_gate" ? { evidence: d.evidence } : {}),
    });
    // הראיה עצמה לא נרשמת ביומן הפאנל — רק האורך שלה (כמו קודם).
    const meta = d.action === "close_gate" ? { label: label(d.provider), evidence_length: d.evidence.length } : { label: label(d.provider) };
    if (!r.ok) {
      const a = failureAudit(r, audit);
      await auditLog(session, a.name, "platform", d.provider, { ...a.meta, ...meta }, ip);
      const f = moneyFailure(r, "collection_provider");
      return NextResponse.json({ error: f.error, code: f.code }, { status: f.status });
    }
    // סקירה #6: הצלחה רק עם ok === true ושורת הספק — אחרת "ייתכן שבוצע".
    const row = providerRow(r.data.provider);
    if (r.data.ok !== true || !row) {
      const b = badShape(audit);
      await auditLog(session, b.audit.name, "platform", d.provider, { ...b.audit.meta, ...meta }, ip);
      return NextResponse.json({ error: b.error, code: b.code }, { status: b.status });
    }
    await auditLog(session, audit, "platform", d.provider, meta, ip);
    return NextResponse.json({ ok: true, provider: row });
  }

  // ── מתג: מוצע / לא מוצע לוועדים ──
  const { provider, offered } = d;
  const audit = offered ? "COLLECTION_PROVIDER_ON" : "COLLECTION_PROVIDER_OFF";
  const r = await callBloc("/api/internal/collection-providers", { actor: actorOf(session), action: "set_offered", provider, offered });
  if (!r.ok) {
    const a = failureAudit(r, audit);
    await auditLog(session, a.name, "platform", provider, { ...a.meta, label: label(provider), offered }, ip);
    const f = moneyFailure(r, "collection_provider");
    return NextResponse.json({ error: f.error, code: f.code }, { status: f.status });
  }

  const row = providerRow(r.data.provider);
  if (r.data.ok !== true || !row) {
    const b = badShape(audit);
    await auditLog(session, b.audit.name, "platform", provider, { ...b.audit.meta, label: label(provider), offered }, ip);
    return NextResponse.json({ error: b.error, code: b.code }, { status: b.status });
  }

  // כמה בניינים מחוברים — ליומן: מה המשמעות של השינוי ברגע שנעשה. כשל בספירה — בלי המספר, השינוי כבר נשמר.
  let buildings: number | null = null;
  const usage = await adminClient.rpc("panel_payment_provider_usage");
  if (!usage.error && Array.isArray(usage.data)) {
    const hit = (usage.data as { provider?: unknown; buildings?: unknown }[]).find((u) => u.provider === provider);
    buildings = Number(hit?.buildings ?? 0) || 0;
  }
  await auditLog(session, audit, "platform", provider, { label: label(provider), offered, buildings }, ip);
  return NextResponse.json({ ok: true, provider: row });
}
