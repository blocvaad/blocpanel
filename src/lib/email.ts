import { Resend } from "resend";

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

/** Send the 2FA one-time code to a panel admin. Returns a normalized result. */
export async function send2FACode(to: string, otp: string): Promise<SendResult> {
  const { error } = await resend.emails.send({
    from: FROM,
    to: [to],
    subject: `קוד אימות blocpanel: ${otp}`,
    html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:400px;margin:0 auto;padding:32px;background:#09090b;color:#fafafa;border-radius:12px;">
        <div style="font-size:22px;font-weight:900;margin-bottom:8px;letter-spacing:-.03em;">blocpanel</div>
        <div style="font-size:13px;color:#71717a;margin-bottom:28px;">ניהול מרכזי</div>
        <div style="font-size:14px;color:#a1a1aa;margin-bottom:16px;">קוד האימות שלך לכניסה:</div>
        <div style="font-size:42px;font-weight:900;letter-spacing:.15em;font-family:monospace;background:#18181b;border:1px solid #27272a;border-radius:10px;padding:20px;text-align:center;color:#fafafa;">
          ${otp}
        </div>
        <div style="font-size:12px;color:#52525b;margin-top:20px;text-align:center;">
          תוקף הקוד: 10 דקות · אל תשתף קוד זה עם אף אחד
        </div>
      </div>
    `,
  });

  if (error) {
    const message = (error as { message?: string })?.message || JSON.stringify(error);
    return { ok: false, error: message };
  }
  return { ok: true };
}
