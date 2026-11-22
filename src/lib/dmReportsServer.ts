// src/lib/dmReportsServer.ts — MOD-1: הקריאות של מסך הדיווחים על הודעות פרטיות (שרת בלבד) — דרך bloc החתום
// (/api/internal/dm-reports), עם איש הצוות (actor) שבודקים שם שוב. לפני SQL 237 — "missing"; כשל — "error" עם המשפט שהצוות רואה
// (אף פעם לא "אין דיווחים"). דיווח שנפתח — שורה גם ביומן הפאנל (DM_REPORT_VIEW), נוסף על היומן של bloc.
import { callBloc } from "@/lib/blocApi";
import { actorOf } from "@/lib/moneyActions";
import { auditLog, type PanelAdmin } from "@/lib/auth";
import { dmFailure, dmListBody, parseDmList, parseDmReport, type DmFilter, type DmReport, type DmReportItem } from "@/lib/dmReports";

type Call = typeof callBloc;

export type DmQueueData =
  | { state: "ok"; items: DmReportItem[]; openTotal: number | null; truncated: boolean }
  | { state: "missing" }
  | { state: "error"; message: string };

export async function loadDmReports(session: PanelAdmin, filter: DmFilter, call: Call = callBloc): Promise<DmQueueData> {
  const r = await call("/api/internal/dm-reports", { actor: actorOf(session), ...dmListBody(filter) });
  if (!r.ok) {
    if (r.code === "sql_missing") return { state: "missing" };
    return { state: "error", message: dmFailure(r, "read").error };
  }
  const list = parseDmList(r.data);
  if (!list) return { state: "error", message: "התשובה מ-bloc לא בצורה המוכרת (ייתכן שהגרסה של bloc ישנה). נסו שוב אחרי הפריסה." };
  return { state: "ok", ...list };
}

export type DmReportData =
  | { state: "ok"; report: DmReport }
  | { state: "not_found" }
  | { state: "missing" }
  | { state: "error"; message: string };

export async function loadDmReport(session: PanelAdmin, id: string, o: { call?: Call; log?: typeof auditLog } = {}): Promise<DmReportData> {
  const r = await (o.call ?? callBloc)("/api/internal/dm-reports", { actor: actorOf(session), action: "one", id });
  if (!r.ok) {
    if (r.status === 404 && r.code === "not_found") return { state: "not_found" };
    if (r.code === "sql_missing") return { state: "missing" };
    return { state: "error", message: dmFailure(r, "read").error };
  }
  const report = parseDmReport(r.data);
  if (!report) return { state: "error", message: "התשובה מ-bloc לא בצורה המוכרת (ייתכן שהגרסה של bloc ישנה). נסו שוב אחרי הפריסה." };
  await (o.log ?? auditLog)(session, "DM_REPORT_VIEW", "dm_report", id, { building_id: report.building?.id ?? null });
  return { state: "ok", report };
}
