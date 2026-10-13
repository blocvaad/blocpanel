// src/lib/panelSession.ts — התשובה כשההתחברות לפאנל עצמו לא תקפה.
//
// בלי תלויות (גם ה-middleware, שרץ ב-edge, מייבא מכאן). הקוד מבדיל "ההתחברות שלך לפאנל הסתיימה" מכל
// 401 אחר: הדפדפן מציע להתחבר מחדש רק עליו, ו-callBloc מזהה לפיו שהפאנל פנה לעצמו (BLOC_APP_URL שגוי).
export const PANEL_SESSION_CODE = "PANEL_SESSION";
export const PANEL_SESSION_ENDED = "ההתחברות לפאנל הסתיימה. התחברו מחדש.";
