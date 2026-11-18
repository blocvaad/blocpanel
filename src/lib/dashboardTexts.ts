// src/lib/dashboardTexts.ts — א3-1 (bloc, החלטה 444): הטקסטים של לוח הבקרה כשמשהו לא נטען מ-bloc.
// בקובץ משלהם: קובץ page.tsx ב-Next מייצא רק default ושדות מוכרים (dynamic, metadata…) — ייצוא אחר מפיל את ה-build
// ("is not a valid Page export field"). הטסטים והמסכים מייבאים מכאן.

/** הסקירה: הנתונים לא נטענו מ-bloc — אומרים את זה (והסיבה בשורה משלה), ולא מציגים אפסים. */
export const OVERVIEW_FAILED_TEXT = "הנתונים של הסקירה לא נטענו מ-bloc";
export const OVERVIEW_PARTIAL_TEXT = "חלק מהנתונים לא נטענו מ-bloc. מה שמסומן בקו (—) לא ידוע כרגע.";
export const OVERVIEW_CAPPED_TEXT = "הגבייה לפי חודש חלקית (מעל 20,000 תשלומים בחצי השנה): החודשים האחרונים מלאים, הישנים מוצגים כתחתית.";

/** האנליטיקה: לא נטענה מ-bloc — מסך משלו, לא גרפים של אפסים. */
export const ANALYTICS_FAILED_TEXT = "האנליטיקה לא נטענה מ-bloc";
/** מעל התקרה (20,000 שורות בטבלה) — המספרים תחתית. */
export const ANALYTICS_PARTIAL_TEXT = "חלק מהמספרים חלקיים (מעל 20,000 שורות): הסכומים והמונים מוצגים כתחתית, ושיעור הגבייה — לפי חלק מהתשלומים.";
/** חלק שהקריאה שלו נכשלה — "—" ו"לא נטען", לא 0. */
export const ANALYTICS_MISSING_TEXT = "חלק מהנתונים לא נטענו מ-bloc. מה שמסומן בקו (—) או ב\"לא נטען\" לא ידוע כרגע.";
export const ANALYTICS_EXPORT_OFF_TEXT = "הייצוא כבוי כשחלק מהנתונים לא נטענו";
