// src/app/api/keys/route.ts — מפתחות ההצפנה של bloc (KEYS-1, החלטות 358–360).
//
// GET  — המצב לכל סוג: מוגדר? מזהה המפתח הנוכחי, המזהים שנקראים, וספירות (פורמט ישן / מפתח קודם / נוכחי / לא קריאים).
//        כל הצוות עם סשן מלא — כמו דף האבטחה עצמו (C4: "staff to view").
// POST — { action: 'dry_run' | 'reencrypt', kind: 'supplier_bank', note } — סופר-אדמין בלבד (security.manage, ההרשאה של
//        בדיקת הבריאות בדף האבטחה). bloc מריץ סבב של עד 200 שורות; הפאנל לא נוגע בנתונים ולא רואה מפתח.
//
// לדפדפן יוצאים רק שדות מרשימה לבנה (lib/encryptionKeys): שדה אחר מ-bloc לא עובר. השגיאות של bloc (409 no_current_key,
// payment_not_movable, 503 read_failed / write_failed) — בעברית. סודות הסליקה לא זזים מכאן: 409 עוד לפני שפונים ל-bloc.
// השחקן נשלח כאובייקט עם התפקיד (כמו committee / members): bloc אוכף סופר-אדמין גם בצד שלו.
// "ניסיון קודם" נאכף בשרת (C5): ריצת ניסיון מחזירה dryRunToken (אישור חתום של bloc, לא מפתח); סבב אמיתי בלי אישור בצורה
// הנכונה — 400 dry_run_required לפני שפונים ל-bloc; bloc בודק את החתימה, הגיל (10 דקות), המפתח והמנהל — 409 dry_run_required.
// יומן הפאנל: כל ריצה שהצליחה (גם ניסיון) — מי, סוג, ספירות והערה. סבב אמיתי שנעצר באמצע כתיבה ("נעצר באמצע"), או
// שלא ידוע אם רץ (bloc לא ענה בזמן, שגיאת שרת, תשובה לא צפויה — "לא ידוע"), נרשם גם הוא: היומן לא מחסיר סבב שאולי רץ.
// bloc רושם כל ריצה גם ביומן שלו (עם הספירות של סבב שנעצר).
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { callBloc } from "@/lib/blocApi";
import { parseBody, keysActionSchema } from "@/lib/validation";
import {
  parseKeysStatus, parseRunResult, keysFailure, failedRunOutcome, isDryRunToken,
  BATCH_MAX, PAYMENT_NOT_MOVABLE_TEXT, STATUS_SHAPE_TEXT, RUN_SHAPE_TEXT, DRY_RUN_REQUIRED_TEXT,
} from "@/lib/encryptionKeys";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const firstIp = (h: string | null) => (h ? h.split(",")[0]?.trim() || undefined : undefined);
const fail = (f: { status: number; error: string; code?: string }) =>
  NextResponse.json({ error: f.error, ...(f.code ? { code: f.code } : {}) }, { status: f.status });

export async function GET() {
  const g = await guard();
  if (!g.ok) return g.response;

  const r = await callBloc("/api/internal/keys", { action: "status" });
  if (!r.ok) return fail(keysFailure(r, "status"));
  const status = parseKeysStatus(r.data);
  if (!status) return fail({ status: 502, code: "bad_shape", error: STATUS_SHAPE_TEXT });
  return NextResponse.json({ ok: true, status, checkedAt: new Date().toISOString() });
}

export async function POST(req: NextRequest) {
  const g = await guard({ permission: "security.manage" });
  if (!g.ok) return g.response;
  const session = g.session;

  const parsed = await parseBody(req, keysActionSchema);
  if (!parsed.ok) return parsed.response;
  const { action, kind, note, dryRunToken } = parsed.data;
  if (kind === "payment") return fail({ status: 409, code: "payment_not_movable", error: PAYMENT_NOT_MOVABLE_TEXT });

  const dryRun = action === "dry_run";
  if (!dryRun && !isDryRunToken(dryRunToken)) return fail({ status: 400, code: "dry_run_required", error: DRY_RUN_REQUIRED_TEXT });
  const ip = firstIp(req.headers.get("x-forwarded-for"));
  const r = await callBloc("/api/internal/keys", {
    action: "reencrypt", kind, dryRun, limit: BATCH_MAX,
    actor: { id: session.id, email: session.email, role: session.role }, ...(note ? { note } : {}),
    ...(dryRun ? {} : { dryRunToken }),
  });

  if (!r.ok) {
    const outcome = dryRun ? null : failedRunOutcome(r);
    if (outcome) {
      await auditLog(session, outcome === "partial" ? "KEYS_REENCRYPT_PARTIAL" : "KEYS_REENCRYPT_UNKNOWN", "encryption_keys", kind, {
        kind, dry_run: false, outcome, error: r.code ?? `http_${r.status}`, actor_email: session.email, ...(note ? { note } : {}),
      }, ip);
    }
    return fail(keysFailure(r, action));
  }

  const result = parseRunResult(r.data, kind, dryRun);
  if (!result) {
    if (!dryRun) {
      await auditLog(session, "KEYS_REENCRYPT_UNKNOWN", "encryption_keys", kind, {
        kind, dry_run: false, outcome: "unknown", error: "bad_shape", actor_email: session.email, ...(note ? { note } : {}),
      }, ip);
    }
    return fail({ status: 502, code: "bad_shape", error: RUN_SHAPE_TEXT[action] });
  }

  await auditLog(session, dryRun ? "KEYS_DRY_RUN" : "KEYS_REENCRYPT", "encryption_keys", kind, {
    kind, dry_run: dryRun, counts: result.counts, actor_email: session.email, ...(note ? { note } : {}),
  }, ip);
  return NextResponse.json({ ok: true, result });
}
