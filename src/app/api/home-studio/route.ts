// src/app/api/home-studio/route.ts — bloc HOME-STUDIO-1 (החלטות 684–694): "מסך הבית" — כרטיסים של bloc במסך הבית.
//   GET  — הכרטיסים, "מה חדש ב-bloc", הספירות של 7 הימים והמתג · home_studio.read. הנתונים לא נכנסים ל-HTML של הדף (ה-service
//          worker של הפאנל שומר עותק של כל דף, ולא של /api/); התשובה no-store.
//   POST — { action, ... } → bloc החתום (/api/internal/home-studio). card.stats — home_studio.read; כל השאר (שמירה, שכפול, מצב,
//          עדכון, המתג) — home_studio.manage (מנהל וסופר-אדמין; נבדק גם ב-bloc).
// הצלחה רק כש-bloc ענה ok בצורה המוכרת; אחרת "לא ברור אם בוצע — רעננו", אף פעם לא הצלחה. ביומן הפאנל: HOME_CARD_* / BLOC_UPDATE_* /
// HOME_STUDIO_SWITCH — בלי התוכן עצמו (הוא ביומן של bloc); כשל בכתיבה — BLOC_ACTION_FAILED / BLOC_ACTION_UNKNOWN.
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { can } from "@/lib/permissions";
import { auditLog } from "@/lib/auth";
import { callBloc } from "@/lib/blocApi";
import { parseBody } from "@/lib/validation";
import { actorOf, firstIp } from "@/lib/moneyActions";
import { adsFailureAudit } from "@/lib/adsActions";
import {
  HS_ACTIONS, HS_BAD_SHAPE_TEXT, HS_UNCLEAR_TEXT, hsActionSchema, hsFailure, parseCardAnswer, parseStats, parseSwitchAnswer, parseUpdateAnswer,
  type HsAction,
} from "@/lib/homeStudio";
import { loadHomeStudio } from "@/lib/homeStudioServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const g = await guard({ permission: "home_studio.read" });
  if (!g.ok) return g.response;
  const data = await loadHomeStudio(g.session);
  if (data.state === "missing") return NextResponse.json(data, { status: 503, headers: noStore });
  if (data.state === "error") return NextResponse.json(data, { status: 502, headers: noStore });
  return NextResponse.json(data, { headers: noStore });
}

/** התשובה של bloc לפעולה → מה שהדפדפן מקבל; null — לא בצורה המוכרת (ייתכן שבוצע). */
function answerOf(b: HsAction, d: Record<string, unknown>): Record<string, unknown> | null {
  if (b.action === "card.save" || b.action === "card.duplicate" || b.action === "card.status") {
    const card = parseCardAnswer(d);
    if (!card) return null;
    return b.action === "card.save" ? { card, created: d.created === true } : { card };
  }
  if (b.action === "card.stats") { const days = parseStats(d); return days ? { days } : null; }
  if (b.action === "update.save" || b.action === "update.status") {
    const update = parseUpdateAnswer(d);
    if (!update) return null;
    return b.action === "update.save" ? { update, created: d.created === true } : { update };
  }
  return parseSwitchAnswer(d);
}

/** מה נרשם ביומן הפאנל (בלי תוכן: שם, טקסטים ותמונות נשארים ב-bloc). */
function auditMeta(b: HsAction, ans: Record<string, unknown>): Record<string, unknown> {
  if (b.action === "card.save") return { created: ans.created === true, shape: b.shape, slot: b.slot, source: b.source };
  if (b.action === "card.duplicate") return { copy_of: b.id };
  if (b.action === "card.status") return { to: b.status, ...(b.status === "test" ? { testers: b.test_emails?.length ?? 0 } : {}) };
  if (b.action === "update.save") return { created: ans.created === true, roles: b.roles };
  if (b.action === "update.status") return { to: b.status };
  if (b.action === "switch") return { enabled: b.enabled, changed: ans.changed === true };
  return {};
}
const targetOf = (b: HsAction, ans: Record<string, unknown>): string | undefined => {
  if ("id" in b && b.id) return b.id;
  const created = (ans.card ?? ans.update) as { id?: string } | undefined;
  return created?.id;
};

export async function POST(req: NextRequest) {
  // a full session with home_studio.read; then the action, and its own permission (writes: home_studio.manage) — before anything
  // reaches bloc
  const g = await guard({ permission: "home_studio.read" });
  if (!g.ok) return g.response;
  const session = g.session;
  const parsed = await parseBody(req, hsActionSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const spec = HS_ACTIONS[body.action];
  if (!can(session.role, spec.permission)) return NextResponse.json({ error: "אין הרשאה" }, { status: 403, headers: noStore });
  const ip = firstIp(req.headers.get("x-forwarded-for"));

  const { action, ...rest } = body;
  const r = await callBloc("/api/internal/home-studio", { actor: actorOf(session), action, ...rest });
  if (!r.ok) {
    if (spec.audit) {
      const a = adsFailureAudit(r, spec.audit);
      await auditLog(session, a.name, spec.entity, "id" in body ? body.id : undefined, { ...a.meta }, ip);
    }
    const f = hsFailure(r, spec.audit ? "action" : "read");
    return NextResponse.json({ error: f.error, code: f.code, ...(f.field ? { field: f.field } : {}) }, { status: f.status, headers: noStore });
  }
  const ans = answerOf(body, r.data);
  if (!ans) {
    if (spec.audit) await auditLog(session, "BLOC_ACTION_UNKNOWN", spec.entity, "id" in body ? body.id : undefined, { action: spec.audit, outcome: "unknown", code: "bad_shape" }, ip);
    return NextResponse.json({ error: spec.audit ? HS_UNCLEAR_TEXT : HS_BAD_SHAPE_TEXT, code: "bad_shape" }, { status: 502, headers: noStore });
  }
  if (spec.audit && !(body.action === "switch" && ans.changed !== true)) {
    await auditLog(session, spec.audit, spec.entity, targetOf(body, ans), auditMeta(body, ans), ip);
  }
  return NextResponse.json({ ok: true, action: body.action, ...ans }, { headers: noStore });
}
