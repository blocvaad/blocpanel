// src/lib/panelSecret.ts — מפתחות-משנה מ-PANEL_JWT_SECRET (PANEL-PAY א1, החלטה 364).
//
// הסשן חתום ב-PANEL_JWT_SECRET עצמו (lib/auth, jose). הקוד החד-פעמי (lib/otp) והאישור לפעולת כסף (lib/stepUp) משתמשים
// במפתח-משנה לכל שימוש: HMAC-SHA256(PANEL_JWT_SECRET, "blocpanel/<label>"). כך ערך של שימוש אחד לא נבדק בהצלחה כשימוש
// אחר — אישור כסף לא עובר כסשן, וסשן לא עובר כאישור כסף. בלי הסוד ב-production — נכשלים, כמו lib/auth (audit P0.3).
import { createHmac } from "crypto";

const DEV_SECRET = "dev_only_insecure_secret_do_not_use_in_prod";

export function panelJwtSecret(env: Record<string, string | undefined> = process.env): string {
  const s = env.PANEL_JWT_SECRET;
  if (s) return s;
  if (env.NODE_ENV === "production") throw new Error("PANEL_JWT_SECRET is required in production");
  return DEV_SECRET;
}

export type SubkeyLabel = "otp" | "stepup";

export function panelSubkey(label: SubkeyLabel, env?: Record<string, string | undefined>): Buffer {
  return createHmac("sha256", panelJwtSecret(env)).update(`blocpanel/${label}`).digest();
}
