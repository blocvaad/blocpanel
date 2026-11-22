// src/app/api/stories/route.ts — STORIES-1 (bloc, החלטות 439, 441): המיתון של הסטורי.
//
//   GET  — התור (דיווחים פתוחים לפי פריט — בלי מי דיווח), המוסתרים והפיילוט · stories.read
//   POST — { action, building_id?, source?, source_id?, reason?, note? } → bloc החתום (/api/internal/stories):
//          hide / unhide / dismiss / refer / building_off / building_on — stories.manage · pilot_on / pilot_off / global_on /
//          global_off — stories.pilot (סופר-אדמין). ההרשאה נבדקת גם ב-bloc. S345: המתג הראשי, המתג לבניין והעברה לוועד.
//
// הצלחה רק כש-bloc ענה ok עם אותה פעולה (storyAnswer); אחרת — "לא ברור אם בוצע — רעננו", אף פעם לא הצלחה. כל פעולה ביומן הפאנל
// (STORY_* / STORIES_PILOT_*); כשל — BLOC_ACTION_FAILED / BLOC_ACTION_UNKNOWN (כמו הפרסומות).
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { callBloc } from "@/lib/blocApi";
import { can } from "@/lib/permissions";
import { parseBody } from "@/lib/validation";
import { actorOf, firstIp } from "@/lib/moneyActions";
import { adsFailureAudit } from "@/lib/adsActions";
import { STORY_ACTION_AUDIT, isPilotAction, storyActionSchema, storyAnswer, storyFailure } from "@/lib/storiesPanel";
import { loadStoriesQueue } from "@/lib/storiesServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const g = await guard({ permission: "stories.read" });
  if (!g.ok) return g.response;
  const data = await loadStoriesQueue();
  if (data.state === "missing") {
    return NextResponse.json({ error: "הסטורי עוד לא הותקן ב-bloc (SQL 235).", code: "sql_missing" }, { status: 503, headers: noStore });
  }
  if (data.state === "error") {
    return NextResponse.json({ error: "טעינת התור נכשלה. נסו שוב.", code: "read_failed" }, { status: 500, headers: noStore });
  }
  return NextResponse.json(data, { headers: noStore });
}

export async function POST(req: NextRequest) {
  const g = await guard({ permission: "stories.read" });
  if (!g.ok) return g.response;
  const session = g.session;
  const parsed = await parseBody(req, storyActionSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const pilot = isPilotAction(body.action);
  if (!can(session.role, pilot ? "stories.pilot" : "stories.manage")) {
    return NextResponse.json({ error: "אין הרשאה לפעולה הזו.", code: "forbidden" }, { status: 403, headers: noStore });
  }

  const ip = firstIp(req.headers.get("x-forwarded-for"));
  const audit = STORY_ACTION_AUDIT[body.action];
  const global = body.action === "global_on" || body.action === "global_off";
  const buildingLevel = pilot || body.action === "building_off" || body.action === "building_on";
  const target = global ? "platform" : buildingLevel ? "building" : "story_item";
  const entityId = "building_id" in body ? body.building_id : undefined;
  const meta: Record<string, unknown> = body.action === "pilot_on" || body.action === "global_on" || body.action === "global_off" ? { note: body.note ?? null }
    : body.action === "pilot_off" || body.action === "building_on" ? {}
    : body.action === "building_off" ? { note: body.note }
    : body.action === "hide" ? { source: body.source, source_id: body.source_id, reason: body.reason }
    : body.action === "refer" ? { source: body.source, source_id: body.source_id, note: body.note ?? null }
    : { source: body.source, source_id: body.source_id };

  const r = await callBloc("/api/internal/stories", { actor: actorOf(session), ...body });
  if (!r.ok) {
    const a = adsFailureAudit(r, audit);
    await auditLog(session, a.name, target, entityId, { ...a.meta, ...meta }, ip);
    const f = storyFailure(r);
    return NextResponse.json({ error: f.error, code: f.code }, { status: f.status, headers: noStore });
  }
  const ans = storyAnswer(body.action, r.data);
  if (!ans) {
    await auditLog(session, "BLOC_ACTION_UNKNOWN", target, entityId, { action: audit, outcome: "unknown", code: "bad_shape", ...meta }, ip);
    return NextResponse.json({ error: "לא ברור אם הפעולה בוצעה. רעננו את הרשימה.", code: "bad_shape" }, { status: 502, headers: noStore });
  }
  await auditLog(session, audit, target, entityId, { ...meta, changed: ans.changed, closed: ans.closed }, ip);
  return NextResponse.json({ ok: true, action: body.action, changed: ans.changed, closed: ans.closed }, { headers: noStore });
}
