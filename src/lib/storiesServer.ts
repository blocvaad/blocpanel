// src/lib/storiesServer.ts — STORIES-1: הקריאות של מסך המיתון (שרת בלבד). S345: דרך bloc (lib/supabase — בלי מפתח למסד) — רק
// העמודות של storiesPanel (בלי מי דיווח), והפריטים עצמם רק בכותרת ובקטע. לפני SQL 235 — "missing"; קריאה שנכשלה — "error".
// S345 (שלב 3): גם המתג הראשי (platform; null — לא נקרא) והבניינים שהסטורי כבוי בהם (צוות bloc / הוועד; לפני SQL 240 — ריק).
import { adminClient } from "@/lib/supabase";
import { adsSqlMissing } from "@/lib/ads";
import {
  STORY_HIDDEN_MAX, STORY_ITEM_COLUMNS, STORY_REPORTS_MAX, STORY_REPORT_COLUMNS, STORY_SOURCES, STORY_SOURCE_TABLE,
  groupStoryReports, itemKey, parseReportRows, storyItem,
  type StoryHiddenRow, type StoryItem, type StoryPilotRow, type StoryReportGroup, type StorySource, type StorySwitchRow,
} from "@/lib/storiesPanel";

export type StoriesQueueData =
  | { state: "ok"; reports: StoryReportGroup[]; hidden: StoryHiddenRow[]; pilot: StoryPilotRow[]; truncated: boolean; openTotal: number | null; hiddenTruncated: boolean
      platform: boolean | null; switchedOff: StorySwitchRow[]; switchesMissing: boolean
      /** MOD-1 (MG-S1211): אילו 300 נטענו — האחרונים (ברירת המחדל) או הישנים ("הישנים קודם"). */
      order?: "newest" | "oldest" }
  | { state: "missing" }
  | { state: "error" };

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown) => (typeof v === "string" ? v : null);
const isSource = (v: unknown): v is StorySource => typeof v === "string" && (STORY_SOURCES as readonly string[]).includes(v);

type Db = typeof adminClient;

export async function loadStoriesQueue(db: Db = adminClient, supabaseUrl: string | null = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
  order: "newest" | "oldest" = "newest"): Promise<StoriesQueueData> {
  const [open, hid, pil, total, flag, sw] = await Promise.all([
    // MOD-1 (MG-S1211): "הישנים קודם" טוען את 300 הישנים — דיווח ישן לא נעלם מאחורי 300 חדשים
    db.from("story_reports").select(STORY_REPORT_COLUMNS).eq("status", "open").order("created_at", { ascending: order === "oldest" }).limit(STORY_REPORTS_MAX),
    db.from("story_hidden").select("building_id, source, source_id, reason, hidden_by, created_at").order("created_at", { ascending: false }).limit(STORY_HIDDEN_MAX),
    db.from("story_pilot_buildings").select("building_id, enabled_by, note, created_at").order("created_at", { ascending: false }),
    // כמה פתוחים בסך הכול — כשמוצגים רק 300, הצוות יודע כמה עוד יש (סקירת STORIES-1)
    db.from("story_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    // S345: המתג הראשי, והבניינים שכובו (צוות bloc או הוועד)
    db.from("platform_security_flags").select("key, enabled, updated_at").eq("key", "stories_public").maybeSingle(),
    db.from("story_building_switches").select("building_id, staff_off, staff_note, staff_by, staff_at, committee_off, committee_at, updated_at")
      .or("staff_off.eq.true,committee_off.eq.true").order("updated_at", { ascending: false }).limit(300),
  ]);
  const err = open.error ?? hid.error ?? pil.error;
  if (err) {
    if (adsSqlMissing(err as never)) return { state: "missing" };
    console.error("[stories queue]", err);
    return { state: "error" };
  }
  const reports = parseReportRows(open.data);
  const hidden = ((hid.data ?? []) as Row[]).filter((r) => str(r.building_id) && UUID.test(String(r.building_id)) && isSource(r.source) && str(r.source_id) && UUID.test(String(r.source_id)));
  const pilot = ((pil.data ?? []) as Row[]).filter((r) => str(r.building_id) && UUID.test(String(r.building_id)));
  const switchesMissing = !!sw.error && adsSqlMissing(sw.error as never);
  if (sw.error && !switchesMissing) { console.error("[stories switches]", sw.error); return { state: "error" }; }
  const switched = ((sw.data ?? []) as Row[]).filter((r) => str(r.building_id) && UUID.test(String(r.building_id)));
  const platform = flag.error ? null : (flag.data as Row | null)?.enabled === true;

  // הפריטים — לכל מקור, המזהים מהתור ומהמוסתרים (שורה של בניין אחר לא נחשבת אותו פריט)
  const ids = new Map<StorySource, Set<string>>();
  for (const r of [...reports.map((x) => ({ source: x.source, source_id: x.source_id })), ...hidden.map((x) => ({ source: x.source as StorySource, source_id: String(x.source_id) }))]) {
    const set = ids.get(r.source) ?? new Set<string>();
    set.add(r.source_id);
    ids.set(r.source, set);
  }
  const items = new Map<string, StoryItem>();
  const reads = await Promise.all([...ids.entries()].map(async ([s, set]) => ({
    s, r: await db.from(STORY_SOURCE_TABLE[s]).select(STORY_ITEM_COLUMNS[s]).in("id", [...set].slice(0, 500)),
  })));
  for (const { s, r } of reads) {
    if (r.error) { console.error("[stories items]", s, r.error); return { state: "error" }; }
    for (const row of (r.data ?? []) as unknown as Row[]) {
      const b = str(row.building_id), id = str(row.id);
      if (b && id) items.set(itemKey(b, s, id), storyItem(s, row, supabaseUrl));
    }
  }

  // שמות הבניינים
  const bids = [...new Set([...reports.map((r) => r.building_id), ...hidden.map((r) => String(r.building_id)), ...pilot.map((r) => String(r.building_id)),
    ...switched.map((r) => String(r.building_id))])];
  const names = new Map<string, string>();
  if (bids.length) {
    const b = await db.from("buildings").select("id, name").in("id", bids.slice(0, 1000));
    if (b.error) { console.error("[stories buildings]", b.error); return { state: "error" }; }
    for (const row of (b.data ?? []) as Row[]) if (str(row.id)) names.set(String(row.id), str(row.name) ?? "בלי שם");
  }
  const nameOf = (id: string) => names.get(id) ?? "בניין לא ידוע";

  return {
    state: "ok",
    reports: groupStoryReports(reports, items, names),
    hidden: hidden.map((r) => {
      const s = r.source as StorySource, b = String(r.building_id), id = String(r.source_id);
      return { building_id: b, building: nameOf(b), source: s, source_id: id, reason: str(r.reason), hidden_by: str(r.hidden_by), created_at: String(r.created_at ?? ""), item: items.get(itemKey(b, s, id)) ?? storyItem(s, undefined) };
    }),
    pilot: pilot.map((r) => ({ building_id: String(r.building_id), building: nameOf(String(r.building_id)), enabled_by: str(r.enabled_by), note: str(r.note), created_at: String(r.created_at ?? "") })),
    platform,
    switchedOff: switched.map((r) => ({
      building_id: String(r.building_id), building: nameOf(String(r.building_id)),
      staff_off: r.staff_off === true, staff_note: str(r.staff_note), staff_by: str(r.staff_by), staff_at: str(r.staff_at),
      committee_off: r.committee_off === true, committee_at: str(r.committee_at),
    })),
    switchesMissing,
    truncated: Array.isArray(open.data) && open.data.length >= STORY_REPORTS_MAX,
    openTotal: !total.error && typeof total.count === "number" ? total.count : null,
    hiddenTruncated: Array.isArray(hid.data) && hid.data.length >= STORY_HIDDEN_MAX,
    order,
  };
}
