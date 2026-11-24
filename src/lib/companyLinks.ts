// src/lib/companyLinks.ts — bloc COMPANY-1 (D5 — הבעלים 24/11; bloc החלטה 650): בקשות של חברות ניהול לנהל בניין שאין בו ועד פעיל.
// החברה מצהירה שהיא מוסמכת לנהל את הבניין (מי חתם/ה ובאיזה תפקיד, ונוסח ההצהרה לפי הגרסה); צוות bloc מאשר או דוחה כאן, וההחלטה
// עצמה — ב-bloc (/api/internal/management-links): בניין קיים נכנס לתיק, בניין חדש נפתח, החברה והדיירים מקבלים הודעה. טהור (נבדק).

export type LinkStatus = "pending" | "approved" | "declined" | "cancelled";

export type NewBuilding = { name?: string | null; address?: string | null; city?: string | null; units?: number | null };

export type LinkRequest = {
  id: string;
  status: LinkStatus | string;
  created_at: string;
  decided_at: string | null;
  company: { id: string; name: string } | null;
  /** בניין שכבר ב-bloc (לפי הקוד שלו). */
  building: { id: string; name: string; address: string | null; invite_code: string | null } | null;
  /** בניין שעוד לא ב-bloc — מה שהחברה מסרה. */
  new_building: NewBuilding | null;
  /** viewer (בלי management.approve) — בלי שם החותם/ת. */
  signer_name: string | null;
  signer_role: string;
  declaration_version: string;
  requester: string | null;
  decline_reason: string | null;
};

export const LINK_STATUS_LABEL: Record<string, string> = {
  pending: "ממתינה",
  approved: "אושרה",
  declined: "נדחתה",
  cancelled: "בוטלה ע״י החברה",
};

/** הבניין בשורה אחת: קיים — השם והכתובת; חדש — השם, הכתובת, העיר ומספר הדירות. */
export function linkBuildingLine(r: Pick<LinkRequest, "building" | "new_building">): { title: string; detail: string; isNew: boolean } {
  if (r.building) return { title: r.building.name || "בניין", detail: r.building.address ?? "", isNew: false };
  const n = r.new_building ?? {};
  const where = [n.address, n.city].filter((x) => !!x && String(x).trim()).join(", ");
  const units = typeof n.units === "number" && n.units > 0 ? ` · ${n.units} דירות` : "";
  return { title: (n.name ?? "").trim() || "בניין חדש", detail: `${where}${units}`, isNew: true };
}

/** הממתינות קודם (הוותיקה קודם), ואחריהן מה שהוחלט (החדש קודם). */
export function sortLinks(rows: LinkRequest[]): LinkRequest[] {
  const pending = rows.filter((r) => r.status === "pending").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const rest = rows.filter((r) => r.status !== "pending").sort((a, b) => (b.decided_at ?? b.created_at).localeCompare(a.decided_at ?? a.created_at));
  return [...pending, ...rest];
}

/** מה קרה אחרי החלטה — במילים. */
export function linkDoneText(action: "approve" | "decline", r: { created?: boolean } | null | undefined): string {
  if (action === "decline") return "הבקשה נדחתה. החברה קיבלה הודעה עם הסיבה.";
  return r?.created
    ? "אושר. הבניין נפתח ב-bloc ונכנס לתיק של החברה. החברה קיבלה הודעה."
    : "אושר. הבניין נכנס לתיק של החברה, והחברה והדיירים קיבלו הודעה.";
}
