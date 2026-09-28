import { Resend } from "resend";
import { emailLayout, codeBox, esc, panel, para, rows, textVersion } from "@/lib/emailLayout";

const resend = new Resend(process.env.RESEND_API_KEY);

// שולח מהדומיין המאומת ב-Resend (blocvaad.co.il) — בדיוק כמו ב-bloc.
// משתמש באותו משתנה סביבה RESEND_FROM ששל bloc, כדי ששני הפרויקטים
// יישארו מיושרים. ה-fallback הוא כתובת @blocvaad.co.il מאומתת, ולכן
// שליחה עובדת מיד לכל נמען (לא רק לבעל חשבון Resend כמו בדומיין הבדיקה).
// אפשר לדרוס ל-blocpanel בלבד עם PANEL_RESEND_FROM אם רוצים כתובת נפרדת
// (למשל panel@blocvaad.co.il) בלי לגעת ב-RESEND_FROM של bloc.
const FROM =
  process.env.PANEL_RESEND_FROM ||
  process.env.RESEND_FROM ||
  "blocpanel <alerts@blocvaad.co.il>";

export interface SendResult { ok: boolean; error?: string }

/**
 * תוכן מייל קוד הכניסה לפאנל — טהור, נבדק ביחידה. אותה מעטפת של כל מיילי bloc
 * (לוגו, פס כחול, RTL), עם קופסת קוד גדולה. תוקף: 10 דקות (api/auth/2fa).
 */
export function twoFactorEmail(otp: string, at: Date = new Date()): { subject: string; html: string; text: string } {
  const when = at.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
  return {
    // הקוד בנושא — כמו קודם: אדמין מעתיק אותו ישר מההתראה.
    subject: `קוד אימות blocpanel: ${otp}`,
    html: emailLayout({
      preheader: "קוד חד-פעמי לכניסה ל-blocpanel · תקף 10 דקות",
      kicker: "blocpanel · ניהול מרכזי",
      title: "קוד הכניסה לפאנל",
      body: para("הזינו את הקוד במסך האימות של blocpanel כדי להשלים את הכניסה.", { muted: true })
        + codeBox(otp, "קוד כניסה חד-פעמי · תקף 10 דקות")
        + rows(null, [["נשלח", esc(when)]])
        + panel("<strong>לא ניסיתם להיכנס?</strong> מישהו יודע את הסיסמה שלכם לפאנל. החליפו אותה מיד ועדכנו סופר-אדמין. אל תשתפו את הקוד עם אף אחד.", "warn"),
      note: "נשלח אוטומטית מ-blocpanel לאדמין רשום.",
    }),
    text: textVersion([`קוד הכניסה ל-blocpanel: ${otp}`, "תקף 10 דקות.", `נשלח: ${when}`, "לא ניסיתם להיכנס? החליפו סיסמה ועדכנו סופר-אדמין."]),
  };
}

/** Send the 2FA one-time code to a panel admin. Returns a normalized result. */
export async function send2FACode(to: string, otp: string): Promise<SendResult> {
  const m = twoFactorEmail(otp);
  const { error } = await resend.emails.send({
    from: FROM,
    to: [to],
    subject: m.subject,
    html: m.html,
    text: m.text,
  });

  if (error) {
    const message = (error as { message?: string })?.message || JSON.stringify(error);
    return { ok: false, error: message };
  }
  return { ok: true };
}
