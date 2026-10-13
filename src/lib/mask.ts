// src/lib/mask.ts — פרטי קשר למי שרק רואה (viewer): ספרות אחרונות של טלפון, האות הראשונה של המייל.
// (bloc UI-R5c-1; קובץ נפרד כדי שגם routes שמדמים את lib/people ישתמשו בהסתרה האמיתית.)

/** טלפון למי שרואה בלבד (viewer): ספרות אחרונות. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  return d.length >= 4 ? `•••${d.slice(-4)}` : "•••";
}

export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [u, dom] = email.split("@");
  if (!dom) return "•••";
  return `${(u ?? "").slice(0, 1)}•••@${dom}`;
}
