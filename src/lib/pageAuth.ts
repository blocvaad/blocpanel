// src/lib/pageAuth.ts
//
// PT-11 — שער לעמודי שרת. ה-middleware מאמת רק חתימת JWT ורמת MFA; עמודי השרת
// קוראים ישירות עם service_role, ולכן עד עכשיו סשן שבוטל (logout / חסימת מנהל /
// הורדת הרשאה) המשיך לראות את כל הנתונים עד פקיעת ה-JWT (8 שעות).
//
// כל עמוד שרת שקורא נתונים קורא לזה בשורה הראשונה: אותו requireFullSession() של
// ה-API (סשן חי ולא מבוטל, MFA, מנהל פעיל, תפקיד מה-DB) + הרשאה לפי המטריצה.
// בלי זה, עמוד חדש שנוסף בלי בדיקה יחזור לחור — הטסט pageAuth-coverage בודק.
import { redirect } from "next/navigation";
import { requireFullSession, type PanelSession } from "./auth";
import { can, type Permission } from "./permissions";

export async function requirePageSession(permission?: Permission): Promise<PanelSession> {
  const auth = await requireFullSession();
  if (!auth.ok) {
    redirect(auth.reason === "mfa_required" ? "/login" : `/login?reason=${auth.reason}`);
  }
  if (permission && !can(auth.session.role, permission)) {
    redirect("/overview?denied=1");
  }
  return auth.session;
}
