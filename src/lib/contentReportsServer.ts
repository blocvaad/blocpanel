// src/lib/contentReportsServer.ts — bloc SAFETY-1: הקריאות של מסך הדיווחים על תוכן (שרת בלבד) — דרך bloc החתום
// (/api/internal/content-reports), עם איש הצוות (actor) שבודקים שם שוב. לפני SQL 255 — "missing"; כשל — "error" עם המשפט שהצוות רואה
// (אף פעם לא "אין דיווחים"). פריט שנפתח — שורה גם ביומן הפאנל (CONTENT_REPORT_VIEW), נוסף על היומן של bloc.
import { callBloc } from "@/lib/blocApi";
import { actorOf } from "@/lib/moneyActions";
import { auditLog, type PanelAdmin } from "@/lib/auth";
import { crFailure, crListBody, parseCrList, parseCrReport, type CrFilter, type CrItem, type CrReport, type CrSource } from "@/lib/contentReports";

type Call = typeof callBloc;
const BAD_SHAPE = "התשובה מ-bloc לא בצורה המוכרת (ייתכן שהגרסה של bloc ישנה). נסו שוב אחרי הפריסה.";

export type CrQueueData =
  | { state: "ok"; items: CrItem[]; openTotal: number | null; truncated: boolean }
  | { state: "missing" }
  | { state: "error"; message: string };

export async function loadContentReports(session: PanelAdmin, filter: CrFilter, call: Call = callBloc): Promise<CrQueueData> {
  const r = await call("/api/internal/content-reports", { actor: actorOf(session), ...crListBody(filter) });
  if (!r.ok) {
    if (r.code === "sql_missing") return { state: "missing" };
    return { state: "error", message: crFailure(r, "read").error };
  }
  const list = parseCrList(r.data);
  if (!list) return { state: "error", message: BAD_SHAPE };
  return { state: "ok", ...list };
}

export type CrReportData =
  | { state: "ok"; report: CrReport }
  | { state: "not_found" }
  | { state: "missing" }
  | { state: "error"; message: string };

export async function loadContentReport(session: PanelAdmin, p: { source: CrSource; id: string }, o: { call?: Call; log?: typeof auditLog } = {}): Promise<CrReportData> {
  const r = await (o.call ?? callBloc)("/api/internal/content-reports", { actor: actorOf(session), action: "one", source: p.source, id: p.id });
  if (!r.ok) {
    if (r.status === 404 && r.code === "not_found") return { state: "not_found" };
    if (r.code === "sql_missing") return { state: "missing" };
    return { state: "error", message: crFailure(r, "read").error };
  }
  const report = parseCrReport(r.data);
  if (!report) return { state: "error", message: BAD_SHAPE };
  await (o.log ?? auditLog)(session, "CONTENT_REPORT_VIEW", "content_report", p.id, { source: p.source, building_id: report.item.building.id });
  return { state: "ok", report };
}
