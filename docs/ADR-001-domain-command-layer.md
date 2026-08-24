# ADR-001: Domain Command Layer via DB RPCs (P0.6 / P0.7)

**סטטוס:** מיושם · אוגוסט 2026
**הקשר:** האודיט (P0.6/P0.7) דרש ש"business mutations משמעותיות יעברו דרך
domain layer משותף במקום raw table mutation", והציע לשקול package משותף
בסגנון `@bloc/domain` בין bloc ל-blocpanel.

---

## ההחלטה

שכבת ה-domain commands ממומשת כ-**RPCs ב-Postgres (SECURITY DEFINER)**,
לא כ-package TypeScript משותף.

כל mutation עסקית שנוגעת ביותר מ-entity אחד עוברת דרך RPC יחיד שרץ
בטרנזקציה אחת:

| Command | RPC | טרנזקציה |
|---|---|---|
| יצירת דרישת תשלום | `create_payment_request` (bloc) | payment_requests + payments×N + finance_log |
| אישור/השעיית חברת ניהול | `admin_set_management_status` | management_companies.status + profiles.role |
| ארכוב בניין | `admin_archive_building` | buildings.is_archived + חסימת כל הדיירים |

שני הצרכנים — bloc (דרך `auth.uid()`) ו-blocpanel (דרך service_role אחרי
`guard()`) — קוראים לאותם RPCs.

---

## למה DB RPCs ולא package משותף

1. **מקור אמת אחד שבאמת משותף.** שני הפרויקטים כבר חולקים DB אחד. הכלל
   העסקי חי במקום שבו שניהם מגיעים אליו בפועל — לא בספרייה שכל צד צריך
   לזכור לייבא.

2. **אטומיות אמיתית.** גוף פונקציית plpgsql = טרנזקציה אחת. package
   ב-TypeScript היה מתאם כתיבות ברמת אפליקציה — פחות בטוח, ולא אטומי מול
   קריסת שרת באמצע.

3. **אי אפשר לעקוף.** RLS + SECURITY DEFINER + GRANT ל-service_role בלבד
   אוכפים את המסלול. package אפשר פשוט לא לייבא ולכתוב raw mutation לצידו.

4. **האודיט הזהיר מפורשות מ-refactor מסוכן.** ציטוט: "אל תעשה refactor
   מסוכן רק כדי ליצור monorepo... בחר implementation מתאים למבנה הקיים."
   bloc ו-blocpanel הם repos נפרדים; בניית package משותף ביניהם היא בדיוק
   ה-refactor המסוכן שהוא הזהיר מפניו — סיכון גבוה, אפס ערך נוסף מעבר
   ל-RPCs.

---

## מה נשאר כ-mutation ישיר, ולמה זה תקין

לא כל כתיבה צריכה RPC. כתיבה בודדת לשורה אחת אטומית בהגדרה (Postgres
מבטיח atomicity ברמת statement). הבאות נשארות ישירות בכוונה:

- **single-row updates** (buildings PATCH, tenants update/transfer) — כתיבה
  אחת, מוגנת ב-Zod allowlist (P0.8). אין multi-write שיישבר.
- **notifications inserts** (broadcast, management) — best-effort לנמען
  ממוקד. כישלון לא פוגע בשלמות נתונים.
- **buildings create + admin assign** — השיוך אופציונלי ו-best-effort;
  כישלון משאיר בניין תקין שממתין לשיוך, לא מצב לא-עקבי או סיכון גישה.
- **panel infra** (2fa, sessions, panel_notifications) — תשתית הפאנל
  עצמו, לא domain של המוצר.

הקו המנחה: **RPC כשכישלון חלקי יוצר מצב שגוי או סיכון אבטחה. כתיבה ישירה
כשהיא single-write או best-effort ללא נזק.**

---

## מסקנה

ה-invariant של P0.7 — "critical multi-entity mutations עוברות דרך domain
commands משותפים ואטומיים" — מתקיים. מומש דרך DB RPCs, שנותנים ערבויות
חזקות יותר מ-package משותף, בלי הסיכון של איחוד שני repos.
