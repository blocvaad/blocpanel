// Explicit panel RBAC (audit P0.5). Authorization lives here, not scattered
// as inline `role === "viewer"` checks across routes. API handlers call
// `can(role, permission)` — the UI hiding a button is never the gate.

export type PanelRole = "superadmin" | "admin" | "viewer";

export type Permission =
  | "broadcast.send"
  // הודעות שנשלחו לבניינים (bloc UI-R5a): הורדה עכשיו, עריכה, שינוי תוקף. מחיקה — סופר-אדמין בלבד
  // (נבדק ב-route וגם ב-bloc).
  | "broadcast.manage"
  | "buildings.read"
  | "buildings.modify"
  | "payments.read"
  | "payments.create"
  | "tenants.read"
  | "tenants.modify"
  | "management.approve"
  | "suppliers.verify"
  // המשכיות ועד (bloc 133/134): פתיחת בקשה בשם דייר, ביטול, הארכת מועד. ביצוע
  // מיידי (לפני 72 השעות) — סופר-אדמין בלבד, נבדק ב-route וגם ב-bloc.
  | "committee.manage"
  | "admins.manage"
  | "security.manage"
  // פרסומות ממומנות (bloc ADS-1): צפייה בקמפיינים ובדוחות — כולם; ניהול (מפרסמים, חוזים, קמפיינים,
  // קריאייטיב, המתג ומכשירי הבדיקה) — מנהל וסופר-אדמין.
  | "ads.read"
  | "ads.manage"
  // הסטורי של bloc (STORIES-1, החלטות 439, 441): צפייה בדיווחים, במוסתרים ובפיילוט — כולם; הסתרה, החזרה ודחיית דיווח — מנהל
  // וסופר-אדמין; פתיחת בניין לפיילוט וסגירתו — סופר-אדמין בלבד (נבדק כאן וגם ב-bloc).
  | "stories.read"
  | "stories.manage"
  | "stories.pilot"
  // BILL-1a: משימות חיוב (עצירת הוראת קבע ידנית, החזרים) — סופר-אדמין בלבד. הפעולה עוברת ל-bloc החתום.
  | "billing.manage"
  // MOD-1 (bloc MG-S1179, החלטה 584): דיווחים על הודעות פרטיות — התוכן שהמדווח בחר, הקבצים שדווחו, "נבדק" ו"פתיחה מחדש". מנהל
  // וסופר-אדמין בלבד (viewer לא רואה גם את הרשימה: מי דיווח על מי). נבדק כאן וגם ב-bloc; כל פתיחה נרשמת.
  | "dm_reports.read"
  | "dm_reports.manage";

// viewer: read-only everywhere. admin: operational writes. superadmin: all.
const MATRIX: Record<PanelRole, Permission[]> = {
  viewer: [
    "buildings.read",
    "payments.read",
    "tenants.read",
    "ads.read",
    "stories.read",
  ],
  admin: [
    "broadcast.send",
    "broadcast.manage",
    "buildings.read",
    "buildings.modify",
    "payments.read",
    "payments.create",
    "tenants.read",
    "tenants.modify",
    "management.approve",
    "suppliers.verify",
    "committee.manage",
    "ads.read",
    "ads.manage",
    "stories.read",
    "stories.manage",
    "dm_reports.read",
    "dm_reports.manage",
  ],
  superadmin: [
    "broadcast.send",
    "broadcast.manage",
    "buildings.read",
    "buildings.modify",
    "payments.read",
    "payments.create",
    "tenants.read",
    "tenants.modify",
    "management.approve",
    "suppliers.verify",
    "committee.manage",
    "admins.manage",
    "security.manage",
    "ads.read",
    "ads.manage",
    "stories.read",
    "stories.manage",
    "stories.pilot",
    "billing.manage",
    "dm_reports.read",
    "dm_reports.manage",
  ],
};

export function can(role: PanelRole | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return (MATRIX[role] ?? []).includes(permission);
}

/** Permissions granted to a role — handy for asserting the matrix in tests. */
export function permissionsFor(role: PanelRole): readonly Permission[] {
  return MATRIX[role] ?? [];
}
