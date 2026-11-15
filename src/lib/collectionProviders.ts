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

/** G14 (bloc PAY-1b, SQL 225, החלטה 356): רק ספקי אשראי עוברים שער לפני שמציעים אותם לוועדים. */
export const GATED_PROVIDER_IDS = ["payplus", "cardcom", "grow"] as const;
export const GATE_EVIDENCE_MIN = 10;
export const GATE_EVIDENCE_MAX = 1000;
export const NEEDS_225 = "צריך להריץ את SQL 225 של bloc";
export const GATE_HINT = "אפשר להציע ספק לוועדים רק אחרי שתועד שסף ההפעלה שלו (G14) נסגר";
// PANEL-PAY א1: ההודעות של כללי השער — עכשיו לתשובות של bloc (/api/internal/collection-providers), שם הכללים רצים.
export const GATE_OPEN_TEXT = `${GATE_HINT}.`;
export const GATE_REOPEN_TEXT = "אי אפשר לפתוח מחדש את השער בזמן שהספק מוצע לוועדים. קודם מכבים את הספק.";
// החלטה 356: תיעוד שנרשם לא נדרס. כדי לעדכן את הראיה — פותחים מחדש (כשהספק כבוי) ומתעדים שוב; היומן שומר את שתי הפעולות.
export const GATE_ALREADY_TEXT = "השער כבר תועד כסגור. כדי לעדכן את הראיה פותחים אותו מחדש (כשהספק כבוי) ומתעדים שוב.";
export const GATE_NOT_CLOSED_TEXT = "השער לא תועד כסגור, ולכן אין מה לפתוח מחדש.";

export type GateInfo = {
  /** העמודות של SQL 225 קיימות. false — מציגים את הכרטיס כמו קודם, בלי שער. */
  supported: boolean;
  /** לספק הזה יש שער (payplus / cardcom / grow). */
  required: boolean;
  closed: boolean;
  closedAt: string | null;
  closedBy: string | null;
  evidence: string | null;
};

export type ProviderRow = {
  id: CollectionProviderId;
  label: string;
  kind: "card" | "external";
  offered: boolean;
  /** בניינים (לא מאורכבים) שמחוברים לספק עכשיו. null — הספירה לא נקראה. */
  buildings: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
  gate: GateInfo;
};

export type ProvidersState = "ok" | "missing" | "error";

type DbRow = {
  provider?: unknown; offered?: unknown; updated_at?: unknown; updated_by?: unknown;
  gate_closed_at?: unknown; gate_closed_by?: unknown; gate_evidence?: unknown;
};
type UsageRow = { provider?: unknown; buildings?: unknown };

export function isGatedProvider(id: string): boolean {
  return (GATED_PROVIDER_IDS as readonly string[]).includes(id);
}

/** שער סגור = שלוש העמודות מלאות (SQL 225: כולן או אף אחת). שורה חלקית נחשבת פתוחה. */
export function gateFromDb(id: string, r: DbRow | undefined, supported: boolean): GateInfo {
  const at = typeof r?.gate_closed_at === "string" && r.gate_closed_at ? r.gate_closed_at : null;
  const by = typeof r?.gate_closed_by === "string" && r.gate_closed_by ? r.gate_closed_by : null;
  const ev = typeof r?.gate_evidence === "string" && r.gate_evidence ? r.gate_evidence : null;
  const closed = supported && !!(at && by && ev);
  return {
    supported, required: supported && isGatedProvider(id), closed,
    closedAt: closed ? at : null, closedBy: closed ? by : null, evidence: closed ? ev : null,
  };
}

/** תקין לתיעוד סגירת שער: אחרי trim, לפחות 10 תווים. */
export function validateGateEvidence(text: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = text.trim();
  if (v.length < GATE_EVIDENCE_MIN) return { ok: false, error: `צריך להסביר בלפחות ${GATE_EVIDENCE_MIN} תווים איך השער נסגר.` };
  if (v.length > GATE_EVIDENCE_MAX) return { ok: false, error: `ההסבר ארוך מדי (עד ${GATE_EVIDENCE_MAX} תווים).` };
  return { ok: true, value: v };
}

/** מתי מותר להדליק: ספק עם שער פתוח — לא. כיבוי תמיד מותר (switchAction). */
export function turnOnBlocked(row: Pick<ProviderRow, "offered" | "gate">): boolean {
  return !row.offered && row.gate.required && !row.gate.closed;
}

/** "פתיחה מחדש" — רק לשער סגור, רק כשהספק כבוי, רק לסופר-אדמין. */
export function canReopenGate(row: Pick<ProviderRow, "offered" | "gate">, canEdit: boolean): boolean {
  return canEdit && row.gate.required && row.gate.closed && !row.offered;
}

/** שגיאה של עמודות SQL 225 שחסרות. */
export function isMissing225(e: unknown): boolean {
  const o = (e && typeof e === "object" ? e : {}) as { code?: unknown; message?: unknown };
  const code = String(o.code ?? "");
  const msg = String(o.message ?? "");
  if (code === "42703" || code === "PGRST204") return true;
  return /gate_closed_at|gate_closed_by|gate_evidence/.test(msg) && /does not exist|could not find/i.test(msg);
}

/** השורות של המסך — בסדר הקבוע, גם כשחסרה שורה (= לא מוצע). */
export function providersView(rows: DbRow[], usage: UsageRow[] | null, gateColumns?: boolean): ProviderRow[] {
  const supported = gateColumns ?? rows.some((r) => "gate_closed_at" in r);
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
      gate: gateFromDb(p.id, r, supported),
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
export function switchAction(row: Pick<ProviderRow, "offered"> & { gate?: GateInfo }, canEdit: boolean, busy: boolean): "confirm" | "turn_on" | "none" {
  if (!canEdit || busy) return "none";
  if (row.offered) return "confirm";
  if (row.gate && turnOnBlocked({ offered: row.offered, gate: row.gate })) return "none";
  return "turn_on";
}

/** מה קורה כשמכבים — לחלון האישור. */
export function turnOffLine(row: ProviderRow): string {
  const n = row.buildings;
  const who = n == null ? "בניינים שכבר מחוברים" : n === 0 ? "אין בניין שמחובר אליו עכשיו" : n === 1 ? "בניין אחד שמחובר אליו" : `${n} בניינים שמחוברים אליו`;
  // PAY-1b (סקירה, P3): ספק עם שער G14 שלא תועד — אחרי כיבוי אי אפשר להדליק אותו שוב בלי תיעוד. אומרים את זה לפני.
  const relight = row.gate?.required && !row.gate.closed
    ? ` אחרי הכיבוי אפשר יהיה להדליק את ${row.label} שוב רק אחרי שתתעדו את סגירת שער G14.` : "";
  if (n === 0) return `ועדים חדשים לא יראו את ${row.label}. ${who}.${relight}`;
  return `ועדים חדשים לא יראו את ${row.label}. ${who} — ממשיכים לגבות דרכו, עד שינתקו.${relight}`;
}

/** שגיאה של טבלה / פונקציה שעוד לא קיימות (SQL 202 לא רץ). */
export function isMissing202(e: unknown): boolean {
  const o = (e && typeof e === "object" ? e : {}) as { code?: unknown; message?: unknown };
  const code = String(o.code ?? "");
  const msg = String(o.message ?? "");
  if (code === "42P01" || code === "PGRST205" || code === "42883" || code === "PGRST202") return true;
  return /platform_payment_providers|panel_payment_provider_usage/.test(msg) && /does not exist|could not find/i.test(msg);
}
