// src/lib/collectionProviders.ts — ספקי הסליקה שמוצעים לוועדים (bloc PAY-M, SQL 202).
//
// הבעלים (01/11): "מתג לכל אחד כולל הפייפלוס, שאוכל להדליק ולכבות כל אחד מהם במידה ואני רוצה להחליף חברת סליקה".
// מתג אחד לכל ספק, לכל הבניינים. מה כיבוי עושה — ומה לא:
//   • ועד שעוד לא מחובר לא רואה את הספק במסך אמצעי התשלום, ולא יכול להתחבר אליו (גם ב-DB — הטריגר של 202).
//   • בניין שכבר מחובר ממשיך לגבות דרכו: החשבון של הוועד אצל הספק הוא שלו, ועצירה הייתה משאירה דיירים בלי תשלום
//     באשראי באמצע חודש. אחרי ניתוק — הוא לא חוזר אליו.
// הדייר רואה "תשלום באשראי" — בלי שם הספק — כך שהחלפת ספק לא משנה לו את המסך.

export const COLLECTION_PROVIDERS = [
  { id: "payplus",    label: "PayPlus",      kind: "card" },
  { id: "cardcom",    label: "Cardcom",      kind: "card" },
  { id: "grow",       label: "Grow (משולם)", kind: "card" },
  { id: "management", label: "חברת ניהול",   kind: "external" },
] as const;

export type CollectionProviderId = typeof COLLECTION_PROVIDERS[number]["id"];
export const COLLECTION_PROVIDER_IDS = COLLECTION_PROVIDERS.map((p) => p.id) as unknown as readonly [CollectionProviderId, ...CollectionProviderId[]];

export type ProviderRow = {
  id: CollectionProviderId;
  label: string;
  kind: "card" | "external";
  offered: boolean;
  /** בניינים (לא מאורכבים) שמחוברים לספק עכשיו. null — הספירה לא נקראה. */
  buildings: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type ProvidersState = "ok" | "missing" | "error";

type DbRow = { provider?: unknown; offered?: unknown; updated_at?: unknown; updated_by?: unknown };
type UsageRow = { provider?: unknown; buildings?: unknown };

/** השורות של המסך — בסדר הקבוע, גם כשחסרה שורה (= לא מוצע). */
export function providersView(rows: DbRow[], usage: UsageRow[] | null): ProviderRow[] {
  const byId = new Map(rows.filter((r) => typeof r.provider === "string").map((r) => [r.provider as string, r]));
  const count = usage ? new Map(usage.map((u) => [String(u.provider), Number(u.buildings) || 0])) : null;
  return COLLECTION_PROVIDERS.map((p) => {
    const r = byId.get(p.id);
    return {
      id: p.id, label: p.label, kind: p.kind,
      offered: r?.offered === true,
      buildings: count ? (count.get(p.id) ?? 0) : null,
      updatedAt: typeof r?.updated_at === "string" ? r.updated_at : null,
      updatedBy: typeof r?.updated_by === "string" ? r.updated_by : null,
    };
  });
}

/** שורה אחת למעלה — מה ועד חדש רואה היום. */
export function offeredSummary(rows: ProviderRow[]): string {
  const cards = rows.filter((r) => r.kind === "card" && r.offered).map((r) => r.label);
  const head = cards.length
    ? `ועד חדש רואה: bit, העברה בנקאית ותשלום באשראי דרך ${cards.join(" / ")}.`
    : "אף ספק אשראי לא מוצע — ועד חדש יכול לגבות רק ב-bit ובהעברה בנקאית.";
  const mgmt = rows.find((r) => r.id === "management");
  return mgmt?.offered ? `${head} וגם גבייה דרך חברת ניהול.` : head;
}

/**
 * לחיצה על המתג: לכבות — קודם שאלה (עם turnOffLine: מה קורה לבניינים שמחוברים); להדליק — מיד. מי שאינו סופר-אדמין,
 * או בזמן שמירה — כלום.
 */
export function switchAction(row: Pick<ProviderRow, "offered">, canEdit: boolean, busy: boolean): "confirm" | "turn_on" | "none" {
  if (!canEdit || busy) return "none";
  return row.offered ? "confirm" : "turn_on";
}

/** מה קורה כשמכבים — לחלון האישור. */
export function turnOffLine(row: ProviderRow): string {
  const n = row.buildings;
  const who = n == null ? "בניינים שכבר מחוברים" : n === 0 ? "אין בניין שמחובר אליו עכשיו" : n === 1 ? "בניין אחד שמחובר אליו" : `${n} בניינים שמחוברים אליו`;
  if (n === 0) return `ועדים חדשים לא יראו את ${row.label}. ${who}.`;
  return `ועדים חדשים לא יראו את ${row.label}. ${who} — ממשיכים לגבות דרכו, עד שינתקו.`;
}

/** שגיאה של טבלה / פונקציה שעוד לא קיימות (SQL 202 לא רץ). */
export function isMissing202(e: unknown): boolean {
  const o = (e && typeof e === "object" ? e : {}) as { code?: unknown; message?: unknown };
  const code = String(o.code ?? "");
  const msg = String(o.message ?? "");
  if (code === "42P01" || code === "PGRST205" || code === "42883" || code === "PGRST202") return true;
  return /platform_payment_providers|panel_payment_provider_usage/.test(msg) && /does not exist|could not find/i.test(msg);
}
