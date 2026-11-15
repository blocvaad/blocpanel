// src/app/api/collection-providers/route.ts — מתג לכל ספק סליקה (bloc PAY-M, SQL 202).
//
// סופר-אדמין בלבד: המתג משנה מה כל הוועדים רואים במסך אמצעי התשלום. כיבוי לא עוצר בניין שכבר מחובר (ראה
// lib/collectionProviders). כל שינוי נרשם ביומן הפעולות — עם כמה בניינים היו מחוברים לספק ברגע השינוי.
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { parseBody, collectionProviderSchema } from "@/lib/validation";
import { COLLECTION_PROVIDERS, isMissing202, isMissing225, NEEDS_225, GATE_HINT } from "@/lib/collectionProviders";

const NEEDS_202 = "צריך להריץ קודם את SQL 202 של bloc (ספקי הסליקה).";
const NEEDS_225_MSG = "צריך להריץ קודם את SQL 225 של bloc (שער G14).";
const GATE_COLS = "gate_closed_at, gate_closed_by, gate_evidence";
const ROW_COLS = `provider, offered, updated_at, updated_by, ${GATE_COLS}`;

/** טריגר ה-DB של SQL 225 זורק את שם השגיאה בהודעה (או בפרטים). */
function gateDbError(e: unknown): "open" | "reopen" | "already" | null {
  const o = (e && typeof e === "object" ? e : {}) as { message?: unknown; details?: unknown; hint?: unknown };
  const t = `${o.message ?? ""} ${o.details ?? ""} ${o.hint ?? ""}`;
  if (t.includes("provider_gate_reopen_while_offered")) return "reopen";
  if (t.includes("provider_gate_already_closed")) return "already";
  if (t.includes("provider_gate_open")) return "open";
  return null;
}
const GATE_OPEN_TEXT = `${GATE_HINT}.`;
const GATE_REOPEN_TEXT = "אי אפשר לפתוח מחדש את השער בזמן שהספק מוצע לוועדים. קודם מכבים את הספק.";
// החלטה 356: תיעוד שנרשם לא נדרס. כדי לעדכן את הראיה — פותחים מחדש (כשהספק כבוי) ומתעדים שוב; היומן שומר את שתי הפעולות.
const GATE_ALREADY_TEXT = "השער כבר תועד כסגור. כדי לעדכן את הראיה פותחים אותו מחדש (כשהספק כבוי) ומתעדים שוב.";
const GATE_NOT_CLOSED_TEXT = "השער לא תועד כסגור, ולכן אין מה לפתוח מחדש.";

export async function POST(req: NextRequest) {
  const g = await guard({ role: "superadmin" });
  if (!g.ok) return g.response;
  const session = g.session;
  const ip = req.headers.get("x-forwarded-for") ?? undefined;

  const parsed = await parseBody(req, collectionProviderSchema);
  if (!parsed.ok) return parsed.response;
  const label = (p: string) => COLLECTION_PROVIDERS.find((c) => c.id === p)?.label ?? p;

  // ── G14: תיעוד סגירת שער / פתיחה מחדש (SQL 225) ──
  if ("action" in parsed.data) {
    const d = parsed.data;
    const close = d.action === "close_gate";
    const evidence = d.action === "close_gate" ? d.evidence : null;
    // PAY-1b (סקירה, P3): פתיחה מחדש רק של שער שתועד כסגור — אחרת היומן היה רושם "נפתח מחדש" על שום דבר.
    const base = adminClient
      .from("platform_payment_providers")
      .update(close
        ? { gate_closed_at: new Date().toISOString(), gate_closed_by: session.email, gate_evidence: evidence }
        : { gate_closed_at: null, gate_closed_by: null, gate_evidence: null })
      .eq("provider", d.provider);
    const { data: gd, error: ge } = await (close ? base : base.not("gate_closed_at", "is", null)).select(ROW_COLS);
    if (ge) {
      if (isMissing225(ge)) return NextResponse.json({ error: NEEDS_225_MSG }, { status: 503 });
      if (isMissing202(ge)) return NextResponse.json({ error: NEEDS_202 }, { status: 503 });
      if (gateDbError(ge) === "reopen") return NextResponse.json({ error: GATE_REOPEN_TEXT }, { status: 409 });
      if (gateDbError(ge) === "already") return NextResponse.json({ error: GATE_ALREADY_TEXT }, { status: 409 });
      console.error("[collection-providers] gate", ge);
      return NextResponse.json({ error: "השינוי לא נשמר. נסו שוב." }, { status: 500 });
    }
    const grow = Array.isArray(gd) ? gd[0] : null;
    if (!grow && !close) {
      // לא עודכנה שורה: או שהשער כבר פתוח, או שהספק לא קיים (202 לא רץ). כשל בקריאה — לא "פתוח".
      const { data: ex, error: xe } = await adminClient.from("platform_payment_providers").select("provider").eq("provider", d.provider);
      if (xe) {
        console.error("[collection-providers] gate read", xe);
        return NextResponse.json({ error: "השינוי לא נשמר. נסו שוב." }, { status: 500 });
      }
      if (Array.isArray(ex) && ex.length > 0) return NextResponse.json({ error: GATE_NOT_CLOSED_TEXT }, { status: 409 });
    }
    if (!grow) return NextResponse.json({ error: NEEDS_202 }, { status: 503 });
    await auditLog(session, close ? "COLLECTION_PROVIDER_GATE_CLOSED" : "COLLECTION_PROVIDER_GATE_REOPENED", "platform", d.provider,
      close ? { label: label(d.provider), evidence_length: evidence!.length } : { label: label(d.provider) }, ip);
    return NextResponse.json({ ok: true, provider: grow });
  }

  const { provider, offered } = parsed.data;

  const { data, error } = await adminClient
    .from("platform_payment_providers")
    .update({ offered, updated_at: new Date().toISOString(), updated_by: session.email })
    .eq("provider", provider)
    .select(ROW_COLS);
  if (error) {
    if (gateDbError(error) === "open") return NextResponse.json({ error: GATE_OPEN_TEXT }, { status: 409 });
    if (isMissing225(error)) {
      // SQL 225 עוד לא רץ: השורה בלי עמודות השער — כמו קודם.
      const retry = await adminClient.from("platform_payment_providers")
        .update({ offered, updated_at: new Date().toISOString(), updated_by: session.email })
        .eq("provider", provider).select("provider, offered, updated_at, updated_by");
      if (!retry.error && Array.isArray(retry.data) && retry.data[0]) return await finish(retry.data[0]);
      if (retry.error && gateDbError(retry.error) === "open") return NextResponse.json({ error: GATE_OPEN_TEXT }, { status: 409 });
      console.error("[collection-providers]", retry.error);
      return NextResponse.json({ error: "השינוי לא נשמר. נסו שוב." }, { status: 500 });
    }
    if (isMissing202(error)) return NextResponse.json({ error: NEEDS_202 }, { status: 503 });
    console.error("[collection-providers]", error);
    return NextResponse.json({ error: "השינוי לא נשמר. נסו שוב." }, { status: 500 });
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return NextResponse.json({ error: NEEDS_202 }, { status: 503 });
  return await finish(row);

  async function finish(row: unknown) {

  // כמה בניינים מחוברים — ליומן: מה המשמעות של השינוי ברגע שנעשה. כשל בספירה — בלי המספר, השינוי כבר נשמר.
  let buildings: number | null = null;
  const usage = await adminClient.rpc("panel_payment_provider_usage");
  if (!usage.error && Array.isArray(usage.data)) {
    const hit = (usage.data as { provider?: unknown; buildings?: unknown }[]).find((u) => u.provider === provider);
    buildings = Number(hit?.buildings ?? 0) || 0;
  }

  await auditLog(session, offered ? "COLLECTION_PROVIDER_ON" : "COLLECTION_PROVIDER_OFF", "platform", provider, {
    label: label(provider), offered, buildings,
  }, ip);

  return NextResponse.json({ ok: true, provider: row });
  }
}
