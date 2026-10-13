// src/lib/people.ts — דיירים וועד בפאנל (bloc UI-R5c-1): רשימות ודף אדם.
//
// "מי בבניין" נקרא מ-building_memberships (כל הבניינים של האדם — לא רק הראשי). עד עכשיו המסכים קראו את
// panel_tenants_view, שמכיר רק את הבניין הראשי: בקשת הצטרפות לבניין שני לא נראתה, "ועד" הוצג כ"מנהל 👑",
// והתשלומים של דייר סוננו לפי השם (דייר אחר עם אותו שם — נספר; תשלומים בבניין אחר — חסרו).
//
// כאן רק קריאה (service role). כל שינוי — /api/members → bloc.
import { fetchAll } from "@/lib/fetchAll";
import { PAYMENT_STATUS } from "@/lib/paymentStatus";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = { from: (table: string) => any };

export type PeopleTab = "pending" | "all" | "blocked";
export const PEOPLE_PAGE = 30;
const NONE = "00000000-0000-0000-0000-000000000000";

export type BuildingRef = { id: string; name: string; founder_id: string | null; is_active: boolean | null; is_archived: boolean | null };
export type PersonBrief = {
  id: string; full_name: string; email: string | null; phone: string | null; avatar_url: string | null
  role: string | null; building_id: string | null; approval_status: string | null; created_at: string | null
};
export type MembershipRow = {
  id: string; user_id: string; building_id: string; role: string; status: string
  apartment: string | null; floor: string | null; created_at: string | null; removed_at?: string | null
};
export type BlockRow = { id: string; user_id: string; reason: string; blocked_at: string; blocked_by: string; ended_at: string | null; ended_by: string | null; end_note: string | null };

// טבלה / עמודה שעוד לא קיימת (bloc 172 לא רץ) — "אין חסימות", עם הודעה במסך.
export function missingSchema(e: { code?: string; message?: string } | null | undefined): boolean {
  return !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42703" || /does not exist|could not find the table/i.test(e.message ?? ""));
}

// ── תצוגה ────────────────────────────────────────────────────────────────────

/** התפקיד בבניין, במילים. ראש ועד וממלא מקום — לפי הבניין (founder_id / committee_deputies). */
export function roleLabel(p: { role: string; userId: string; founderId: string | null; deputy: boolean }): string {
  if (p.role === "admin") return p.founderId === p.userId ? "ראש הוועד" : "חבר/ת ועד";
  return p.deputy ? "דייר/ת, ממלא/ת מקום" : "דייר/ת";
}

export const MEMBERSHIP_STATUS: Record<string, { label: string; tone: "ok" | "wait" | "muted" }> = {
  active:  { label: "מאושר/ת", tone: "ok" },
  pending: { label: "ממתין/ה לאישור", tone: "wait" },
  removed: { label: "יצא/ה מהבניין", tone: "muted" },
};

/** פרסונה שאינה של בניין — לא ממונה לוועד, ומנוהלת במסך משלה. */
export function personaLabel(role: string | null): string | null {
  if (role === "management") return "חשבון חברת ניהול";
  if (role === "supplier") return "חשבון ספק";
  return null;
}

export { maskPhone, maskEmail } from "@/lib/mask";

/** חסימה מהשיטה הישנה (approval_status) שקיבלה שורה ב-bloc 172 — מתי, על ידי מי ולמה לא נשמרו. */
export const LEGACY_BLOCK_BY = "legacy:approval_status";
export const isLegacyBlock = (b: { blocked_by: string } | null | undefined): boolean => !!b && b.blocked_by === LEGACY_BLOCK_BY;

/** תגית החסימה: חסימה של צוות bloc; חסימה מהשיטה הישנה (השורה מ-172, או רק הסטטוס בפרופיל); או כלום. */
export function blockTag(p: { block?: { blocked_by: string } | null; legacyStatus?: boolean }): string | null {
  if (p.block) return isLegacyBlock(p.block) ? "חסום (שיטה ישנה)" : "חסום";
  return p.legacyStatus ? "חסום (שיטה ישנה)" : null;
}

/** חיפוש: בלי תווים ששוברים את התחביר של PostgREST (פסיק, סוגריים, כוכבית, מירכאות) ובלי תווי LIKE. */
export function cleanQuery(q: string | null | undefined): string {
  return (q ?? "").replace(/[,()*%\\_"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export type PaymentLite = { id: string; building_id: string | null; amount: number | null; status: string | null; method: string | null; title: string | null; created_at: string | null; paid_at: string | null };

/** סיכום תשלומים של אדם: שולם, חוב פתוח (לפי המצבים של bloc), ומספרים. */
export function paymentTotals(rows: PaymentLite[]): { paid: number; paidCount: number; debt: number; debtCount: number } {
  let paid = 0, paidCount = 0, debt = 0, debtCount = 0;
  for (const r of rows) {
    const amount = Number(r.amount) || 0;
    if (r.status === "paid") { paid += amount; paidCount++; continue; }
    if (PAYMENT_STATUS[r.status ?? "pending"]?.debt) { debt += amount; debtCount++; }
  }
  return { paid, paidCount, debt, debtCount };
}

// ── רשימות ───────────────────────────────────────────────────────────────────

const PERSON_COLS = "id, full_name, email, phone, avatar_url, role, building_id, approval_status, created_at";
const MEMBER_COLS = "id, user_id, building_id, role, status, apartment, floor, created_at";
const BUILDING_COLS = "id, name, founder_id, is_active, is_archived";

async function byIds<T>(db: Db, table: string, cols: string, col: string, ids: string[]): Promise<{ rows: T[]; error: boolean }> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const rows: T[] = [];
  for (let i = 0; i < uniq.length; i += 200) {
    const { data, error } = await db.from(table).select(cols).in(col, uniq.slice(i, i + 200));
    if (error) return { rows, error: true };
    rows.push(...((data ?? []) as T[]));
  }
  return { rows, error: false };
}

type OpenBlock = { reason: string; blocked_at: string; blocked_by: string };

/** החסימות הפתוחות של האנשים שבעמוד (לתגית). לפני 172 — אין טבלה: אין חסימות חדשות, בלי שגיאה. */
async function openBlocksOf(db: Db, ids: string[]): Promise<{ byUser: Map<string, OpenBlock>; error: boolean }> {
  const byUser = new Map<string, OpenBlock>();
  const uniq = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 200) {
    const { data, error } = await db.from("account_blocks").select("user_id, reason, blocked_at, blocked_by")
      .in("user_id", uniq.slice(i, i + 200)).is("ended_at", null);
    if (error) return missingSchema(error) ? { byUser, error: false } : { byUser, error: true };
    for (const r of (data ?? []) as (OpenBlock & { user_id: string })[]) byUser.set(r.user_id, { reason: r.reason, blocked_at: r.blocked_at, blocked_by: r.blocked_by });
  }
  return { byUser, error: false };
}

/** פרופילים שמתאימים לחיפוש (שם / מייל / טלפון). עד 300 — החיפוש הוא כדי למצוא, לא לסכם. */
async function matchingIds(db: Db, q: string): Promise<{ ids: string[]; error: boolean }> {
  const digits = q.replace(/\D/g, "");
  const parts = [`full_name.ilike.%${q}%`, `email.ilike.%${q}%`];
  if (digits.length >= 4) parts.push(`phone.ilike.%${digits}%`);
  const { data, error } = await db.from("profiles").select("id").or(parts.join(",")).limit(300);
  if (error) return { ids: [], error: true };
  return { ids: ((data ?? []) as { id: string }[]).map((r) => r.id), error: false };
}

export type ListItem = {
  person: PersonBrief
  memberships: Array<MembershipRow & { building: BuildingRef | null }>
  /** בלשונית "ממתינים" — הבקשה עצמה. */
  request?: MembershipRow & { building: BuildingRef | null }
  block?: { reason: string; blocked_at: string; blocked_by: string } | null
  legacyBlocked?: boolean
};

export type ListResult = { items: ListItem[]; total: number | null; page: number; pages: number; error: boolean; blocksUnavailable?: boolean; truncated?: boolean };

export async function listPeople(db: Db, p: { tab: PeopleTab; q?: string | null; page?: number }): Promise<ListResult> {
  const q = cleanQuery(p.q);
  const page = Math.max(1, Math.floor(p.page ?? 1));
  const from = (page - 1) * PEOPLE_PAGE, to = from + PEOPLE_PAGE - 1;
  let ids: string[] | null = null;
  if (q) {
    const m = await matchingIds(db, q);
    if (m.error) return { items: [], total: null, page, pages: 1, error: true };
    ids = m.ids;
  }

  if (p.tab === "pending") {
    let query = db.from("building_memberships").select(MEMBER_COLS, { count: "exact" })
      .eq("status", "pending").order("created_at", { ascending: true }).range(from, to);
    if (ids) query = query.in("user_id", ids.length ? ids : [NONE]);
    const { data, error, count } = await query;
    if (error) return { items: [], total: null, page, pages: 1, error: true };
    const reqs = (data ?? []) as MembershipRow[];
    const [people, buildings, blocks] = await Promise.all([
      byIds<PersonBrief>(db, "profiles", PERSON_COLS, "id", reqs.map((r) => r.user_id)),
      byIds<BuildingRef>(db, "buildings", BUILDING_COLS, "id", reqs.map((r) => r.building_id)),
      openBlocksOf(db, reqs.map((r) => r.user_id)),
    ]);
    if (people.error || buildings.error || blocks.error) return { items: [], total: null, page, pages: 1, error: true };
    const pById = new Map(people.rows.map((x) => [x.id, x]));
    const bById = new Map(buildings.rows.map((x) => [x.id, x]));
    const items: ListItem[] = reqs.filter((r) => pById.has(r.user_id)).map((r) => {
      const person = pById.get(r.user_id) as PersonBrief;
      return {
        person, memberships: [],
        request: { ...r, building: bById.get(r.building_id) ?? null },
        block: blocks.byUser.get(r.user_id) ?? null,
        legacyBlocked: person.approval_status === "blocked",
      };
    });
    const total = typeof count === "number" ? count : null;
    return { items, total, page, pages: Math.max(1, Math.ceil((total ?? items.length) / PEOPLE_PAGE)), error: false };
  }

  if (p.tab === "blocked") {
    const [blocks, legacy] = await Promise.all([
      fetchAll<BlockRow>((f, t) => db.from("account_blocks").select("id, user_id, reason, blocked_at, blocked_by, ended_at, ended_by, end_note")
        .is("ended_at", null).order("blocked_at", { ascending: false }).range(f, t), { maxPages: 5 }),
      fetchAll<PersonBrief>((f, t) => db.from("profiles").select(PERSON_COLS)
        .eq("approval_status", "blocked").is("deleted_at", null).order("created_at", { ascending: false }).range(f, t), { maxPages: 5 }),
    ]);
    let blocksUnavailable = false;
    if (blocks.error) {
      // 172 לא רץ? אז אין חסימות חדשות — מציגים את הישנות, ואומרים.
      const probe = await db.from("account_blocks").select("id").limit(1);
      if (missingSchema(probe.error)) blocksUnavailable = true;
      else return { items: [], total: null, page: 1, pages: 1, error: true };
    }
    if (legacy.error) return { items: [], total: null, page: 1, pages: 1, error: true };
    const want = (id: string) => !ids || ids.includes(id);
    const openRows = blocksUnavailable ? [] : blocks.rows.filter((b) => want(b.user_id));
    const people = await byIds<PersonBrief>(db, "profiles", PERSON_COLS, "id", openRows.map((b) => b.user_id));
    if (people.error) return { items: [], total: null, page: 1, pages: 1, error: true };
    const pById = new Map(people.rows.map((x) => [x.id, x]));
    const items: ListItem[] = [
      ...openRows.filter((b) => pById.has(b.user_id)).map((b) => ({
        person: pById.get(b.user_id) as PersonBrief, memberships: [],
        block: { reason: b.reason, blocked_at: b.blocked_at, blocked_by: b.blocked_by },
      })),
      ...legacy.rows.filter((x) => want(x.id) && !openRows.some((b) => b.user_id === x.id)).map((x) => ({
        person: x, memberships: [], legacyBlocked: true,
      })),
    ];
    return { items, total: items.length, page: 1, pages: 1, error: false, blocksUnavailable, truncated: blocks.truncated || legacy.truncated };
  }

  // all — דיירים וועד (פרסונה של בניין), כולל מי שעוד בלי בניין.
  let query = db.from("profiles").select(PERSON_COLS, { count: "exact" })
    .is("deleted_at", null).or("role.is.null,role.in.(tenant,admin)")
    .order("created_at", { ascending: false }).range(from, to);
  if (ids) query = query.in("id", ids.length ? ids : [NONE]);
  const { data, error, count } = await query;
  if (error) return { items: [], total: null, page, pages: 1, error: true };
  const people = (data ?? []) as PersonBrief[];
  const [mems, blocks] = await Promise.all([
    byIds<MembershipRow>(db, "building_memberships", MEMBER_COLS, "user_id", people.map((x) => x.id)),
    openBlocksOf(db, people.map((x) => x.id)),
  ]);
  if (mems.error || blocks.error) return { items: [], total: null, page, pages: 1, error: true };
  const live = mems.rows.filter((m) => m.status === "active" || m.status === "pending");
  const buildings = await byIds<BuildingRef>(db, "buildings", BUILDING_COLS, "id", live.map((m) => m.building_id));
  if (buildings.error) return { items: [], total: null, page, pages: 1, error: true };
  const bById = new Map(buildings.rows.map((x) => [x.id, x]));
  const items: ListItem[] = people.map((x) => ({
    person: x,
    memberships: live.filter((m) => m.user_id === x.id).map((m) => ({ ...m, building: bById.get(m.building_id) ?? null })),
    block: blocks.byUser.get(x.id) ?? null,
    legacyBlocked: x.approval_status === "blocked",
  }));
  const total = typeof count === "number" ? count : null;
  return { items, total, page, pages: Math.max(1, Math.ceil((total ?? items.length) / PEOPLE_PAGE)), error: false };
}

// ── דף אדם ───────────────────────────────────────────────────────────────────

export type PersonDetail = {
  person: PersonBrief & { deleted_at: string | null; is_onboarded: boolean | null; totp_enabled: boolean | null }
  memberships: Array<MembershipRow & { building: BuildingRef | null; deputy: boolean }>
  blocks: BlockRow[]
  openBlock: BlockRow | null
  blocksUnavailable: boolean
  payments: PaymentLite[]
  paymentsTruncated: boolean
  buildingNames: Record<string, string>
  panelLog: Array<{ id: string; action: string; admin_email: string | null; created_at: string; metadata: Record<string, unknown> | null }>
  blocLog: Array<{ id: string; action: string; building_id: string | null; created_at: string; details: Record<string, unknown> | null }>
  companies: Array<{ id: string; name: string; status: string | null; owner: boolean }>
  supplier: { id: string; business_name: string | null } | null
  /** קריאות שנכשלו — המסך אומר, ולא מציג "אין". */
  failed: string[]
};

export async function loadPerson(db: Db, id: string): Promise<PersonDetail | null | "error"> {
  const prof = await db.from("profiles")
    .select(`${PERSON_COLS}, deleted_at, is_onboarded, totp_enabled`).eq("id", id).maybeSingle();
  if (prof.error) return "error";
  if (!prof.data) return null;
  const failed: string[] = [];

  const [mem, dep, blk, pays, plog, blog, owned, emp, sup] = await Promise.all([
    db.from("building_memberships").select(`${MEMBER_COLS}, removed_at`).eq("user_id", id).order("created_at", { ascending: false }).limit(100),
    db.from("committee_deputies").select("building_id, status").eq("user_id", id),
    db.from("account_blocks").select("id, user_id, reason, blocked_at, blocked_by, ended_at, ended_by, end_note").eq("user_id", id).order("blocked_at", { ascending: false }).limit(50),
    fetchAll<PaymentLite>((f, t) => db.from("payments").select("id, building_id, amount, status, method, title, created_at, paid_at")
      .eq("payer_id", id).order("created_at", { ascending: false }).range(f, t), { maxPages: 5 }),
    db.from("panel_audit_logs").select("id, action, admin_email, created_at, metadata").eq("entity_id", id).order("created_at", { ascending: false }).limit(30),
    db.from("audit_logs").select("id, action, building_id, created_at, details").eq("target_id", id).order("created_at", { ascending: false }).limit(30),
    db.from("management_companies").select("id, name, status").eq("owner_id", id),
    db.from("company_employees").select("company_id, status").eq("user_id", id),
    db.from("supplier_profiles").select("id, business_name").eq("user_id", id).maybeSingle(),
  ]);

  if (mem.error) failed.push("החברויות בבניינים");
  const memberships = ((mem.data ?? []) as MembershipRow[]);
  const deputyOf = new Set(((dep.data ?? []) as { building_id: string; status: string }[]).filter((d) => d.status === "active").map((d) => d.building_id));
  if (dep.error && !missingSchema(dep.error)) failed.push("ממלאי המקום");

  let blocksUnavailable = false;
  if (blk.error) { if (missingSchema(blk.error)) blocksUnavailable = true; else failed.push("החסימות"); }
  const blocks = (blk.data ?? []) as BlockRow[];

  if (pays.error) failed.push("התשלומים");
  if (plog.error) failed.push("יומן הפאנל");
  if (blog.error) failed.push("היומן של bloc");
  if (owned.error && !missingSchema(owned.error)) failed.push("חברת הניהול");
  if (sup.error && !missingSchema(sup.error)) failed.push("חשבון הספק");

  const empRows = ((emp.data ?? []) as { company_id: string; status: string | null }[]);
  const ownedRows = ((owned.data ?? []) as { id: string; name: string; status: string | null }[]);
  const extraCompanies = await byIds<{ id: string; name: string; status: string | null }>(db, "management_companies", "id, name, status", "id",
    empRows.map((e) => e.company_id).filter((cid) => !ownedRows.some((o) => o.id === cid)));

  const buildingIds = [...new Set([...memberships.map((m) => m.building_id), ...pays.rows.map((p) => p.building_id ?? "")].filter(Boolean))];
  const buildings = await byIds<BuildingRef>(db, "buildings", BUILDING_COLS, "id", buildingIds);
  if (buildings.error) failed.push("שמות הבניינים");
  const bById = new Map(buildings.rows.map((b) => [b.id, b]));

  return {
    person: prof.data,
    memberships: memberships.map((m) => ({ ...m, building: bById.get(m.building_id) ?? null, deputy: deputyOf.has(m.building_id) })),
    blocks,
    openBlock: blocks.find((b) => !b.ended_at) ?? null,
    blocksUnavailable,
    payments: pays.rows,
    paymentsTruncated: pays.truncated && !pays.error,
    buildingNames: Object.fromEntries(buildings.rows.map((b) => [b.id, b.name])),
    panelLog: (plog.data ?? []) as PersonDetail["panelLog"],
    blocLog: (blog.data ?? []) as PersonDetail["blocLog"],
    companies: [
      ...ownedRows.map((c) => ({ ...c, owner: true })),
      ...extraCompanies.rows.map((c) => ({ ...c, owner: false })),
    ],
    supplier: (sup.data as { id: string; business_name: string | null } | null) ?? null,
    failed,
  };
}

// ── שמות פעולות ביומן של bloc (שקשורות לאדם) ──────────────────────────────────
export const BLOC_ACTION_LABEL: Record<string, string> = {
  tenant_approved: "ההצטרפות אושרה", tenant_rejected: "בקשת ההצטרפות נדחתה", tenant_removed: "הוסר/ה מהבניין",
  admin_promoted: "מונה/תה לוועד", admin_demoted: "הוסר/ה מהוועד", profile_updated: "הפרטים עודכנו",
  account_blocked: "החשבון נחסם", account_unblocked: "החסימה בוטלה", member_transferred: "הועבר/ה לבניין אחר",
  committee_head_transferred: "ראשות הוועד הועברה", committee_deputy_nominated: "הוזמן/ה להיות ממלא/ת מקום",
  committee_deputy_accepted: "אישר/ה להיות ממלא/ת מקום", committee_deputy_removed: "הוסר/ה ממילוי המקום",
  account_deleted: "החשבון נמחק",
};

/** מי עשה — מתוך הפרטים ביומן של bloc (צוות bloc / ועד). */
export function blocActor(details: Record<string, unknown> | null | undefined): string | null {
  if (details && details.via === "panel") return typeof details.panel_admin === "string" ? `צוות bloc (${details.panel_admin})` : "צוות bloc";
  return null;
}

// ── חברי בניין (דף הבניין) ────────────────────────────────────────────────────

export type BuildingMember = {
  id: string; full_name: string; apartment: string | null; floor: string | null
  role: "admin" | "tenant"; status: "active" | "pending"; created_at: string | null
  head: boolean; deputy: boolean; blocked: boolean; persona: string | null
};

/** החברים בבניין (מאושרים וממתינים) — מ-building_memberships, גם מי שהבניין הזה אינו הראשי שלו. */
export async function loadBuildingMembers(db: Db, building: { id: string; founder_id: string | null }): Promise<{ members: BuildingMember[]; error: boolean; truncated: boolean }> {
  const mem = await fetchAll<MembershipRow>((f, t) => db.from("building_memberships").select(MEMBER_COLS)
    .eq("building_id", building.id).in("status", ["active", "pending"]).order("created_at", { ascending: true }).range(f, t), { maxPages: 10 });
  if (mem.error) return { members: [], error: true, truncated: false };
  const ids = mem.rows.map((m) => m.user_id);
  const [people, dep] = await Promise.all([
    byIds<PersonBrief>(db, "profiles", PERSON_COLS, "id", ids),
    db.from("committee_deputies").select("user_id, status").eq("building_id", building.id).maybeSingle(),
  ]);
  if (people.error) return { members: [], error: true, truncated: false };
  const blocked = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("account_blocks").select("user_id").in("user_id", ids.slice(i, i + 200)).is("ended_at", null);
    if (error) { if (missingSchema(error)) break; return { members: [], error: true, truncated: false }; }
    for (const r of (data ?? []) as { user_id: string }[]) blocked.add(r.user_id);
  }
  const deputy = dep.data && (dep.data as { status: string }).status === "active" ? (dep.data as { user_id: string }).user_id : null;
  const pById = new Map(people.rows.map((x) => [x.id, x]));
  const rank = (m: BuildingMember) => (m.head ? 0 : m.role === "admin" ? 1 : m.status === "pending" ? 2 : 3);
  const members = mem.rows.filter((m) => pById.has(m.user_id)).map((m): BuildingMember => {
    const p = pById.get(m.user_id) as PersonBrief;
    return {
      id: m.user_id, full_name: (p.full_name ?? "").trim() || "ללא שם", apartment: m.apartment, floor: m.floor,
      role: m.role === "admin" ? "admin" : "tenant", status: m.status === "active" ? "active" : "pending", created_at: m.created_at,
      head: m.role === "admin" && m.status === "active" && building.founder_id === m.user_id,
      deputy: deputy === m.user_id, blocked: blocked.has(m.user_id) || p.approval_status === "blocked", persona: personaLabel(p.role),
    };
  }).sort((a, b) => rank(a) - rank(b) || a.full_name.localeCompare(b.full_name, "he"));
  return { members, error: false, truncated: mem.truncated };
}
