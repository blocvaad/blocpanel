// src/lib/homeStudioServer.ts — bloc HOME-STUDIO-1: הקריאה של מסך "מסך הבית" (שרת בלבד) — דרך bloc החתום
// (/api/internal/home-studio, list), עם איש הצוות (actor) שבודקים שם שוב. לפני SQL 256 — "missing"; כשל — "error" עם המשפט שהצוות
// רואה (אף פעם לא "אין כרטיסים"); תשובה בצורה לא מוכרת — "error" (HS_BAD_SHAPE_TEXT).
import { callBloc } from "@/lib/blocApi";
import { actorOf } from "@/lib/moneyActions";
import type { PanelAdmin } from "@/lib/auth";
import { HS_BAD_SHAPE_TEXT, hsFailure, parseStudioList, type StudioListData } from "@/lib/homeStudio";

type Call = typeof callBloc;

export type HsListData =
  | ({ state: "ok" } & StudioListData)
  | { state: "missing" }
  | { state: "error"; message: string };

export async function loadHomeStudio(session: PanelAdmin, call: Call = callBloc): Promise<HsListData> {
  const r = await call("/api/internal/home-studio", { actor: actorOf(session), action: "list" });
  if (!r.ok) {
    if (r.code === "sql_missing") return { state: "missing" };
    return { state: "error", message: hsFailure(r, "read").error };
  }
  const list = parseStudioList(r.data);
  if (!list) return { state: "error", message: HS_BAD_SHAPE_TEXT };
  return { state: "ok", ...list };
}
