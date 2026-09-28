// src/lib/emailLayout.ts (blocpanel)
//
// אותה מעטפת ממותגת של המיילים של bloc (bloc: src/lib/emails/layout.ts) — כדי
// שקוד הכניסה לפאנל ייראה כמו כל מייל אחר של bloc. טהור, נבדק ביחידה.
// שינוי עיצוב? לשנות בשני הריפואים יחד.
//
// למה טבלאות ו-inline styles: Gmail / Outlook לא טוענים CSS חיצוני ומתעלמים
// מ-<style> במקרים רבים. כפתור = תא טבלה עם צבע (לא רק <a>), כדי שיופיע גם
// ב-Outlook. RTL מוגדר בכל תא — חלק מהלקוחות מאבדים את dir של ה-<html>.
//
// כל ערך שמגיע ממשתמש עובר esc(). התמונה היחידה היא הלוגו (מהדומיין שלנו,
// עם alt), כך שמייל עם תמונות חסומות עדיין קריא לגמרי.

const ORIGIN = 'https://www.blocvaad.co.il'

export const BRAND = '#1D4ED8'
/**
 * הלוגו המקורי (BrandLogo — b גרפי, l קפסולה, o/c טבעות) כ-PNG לבן שקוף, 3x.
 * נוצר מהרכיב עצמו (components/ui/BrandB.tsx), לא שרטוט חדש. PNG ולא SVG —
 * Gmail/Outlook לא מציגים SVG במייל. כתובת קנונית: Gmail מושך את התמונה
 * דרך ה-proxy שלו מהדומיין הציבורי. אם התמונות חסומות — alt "bloc" בלבן.
 */
export const LOGO_URL = `${ORIGIN}/brand/bloc-logo-white.png`
const INK = '#0F172A', SOFT = '#475569', FAINT = '#94A3B8', LINE = '#E6EAF0', BG = '#F0F4F8', PANEL = '#F8FAFC'
const FONT = "Arial,'Helvetica Neue',Helvetica,sans-serif"

export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** טקסט חופשי של משתמש — escaped, ושבירות שורה נשמרות. */
export function multiline(v: unknown): string {
  return esc(v).replace(/\r?\n/g, '<br>')
}

export function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0 4px;">
<tr><td align="center" bgcolor="${BRAND}" style="border-radius:12px;background:${BRAND};">
<a href="${esc(href)}" target="_blank" style="display:block;padding:15px 20px;font:900 16px/1.2 ${FONT};color:#ffffff;text-decoration:none;border-radius:12px;">${esc(label)}</a>
</td></tr></table>`
}

/** קופסה מודגשת (הודעה, סכום, קוד). tone=brand — רקע כחול בהיר. */
export function panel(innerHtml: string, tone: 'plain' | 'brand' | 'warn' | 'danger' = 'plain'): string {
  const bg = tone === 'brand' ? '#EFF6FF' : tone === 'warn' ? '#FFFBEB' : tone === 'danger' ? '#FEF2F2' : PANEL
  const border = tone === 'brand' ? '#DBEAFE' : tone === 'warn' ? '#FDE68A' : tone === 'danger' ? '#FECACA' : LINE
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:18px 0;">
<tr><td dir="rtl" align="right" style="background:${bg};border:1px solid ${border};border-radius:16px;padding:16px 18px;font:400 15px/1.7 ${FONT};color:${INK};">${innerHtml}</td></tr></table>`
}

/**
 * קוד חד-פעמי (אימות / כניסה) — גדול, מרווח, LTR, קל להעתקה. `code` יכול להיות
 * גם placeholder של תבנית Supabase ({{ .Token }}) — לא עובר esc() על הסוגריים.
 */
export function codeBox(code: string, caption: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0 8px;">
<tr><td align="center" style="background:#EFF6FF;border:1px solid #DBEAFE;border-radius:16px;padding:18px 12px 20px;">
<div dir="rtl" style="font:700 13px/1.4 ${FONT};color:#64748B;margin-bottom:10px;">${esc(caption)}</div>
<div dir="ltr" style="font:900 36px/1.1 'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;letter-spacing:8px;color:${BRAND};">${esc(code)}</div>
</td></tr></table>`
}

/** תווית מצב קטנה ("טופל", "נכשל", "ממתין"). */
export function pill(text: string, tone: 'brand' | 'warn' | 'danger' = 'brand'): string {
  const [bg, fg] = tone === 'danger' ? ['#FEE2E2', '#B91C1C'] : tone === 'warn' ? ['#FEF3C7', '#92400E'] : ['#DBEAFE', BRAND]
  return `<span style="display:inline-block;background:${bg};color:${fg};font:900 12px/1 ${FONT};padding:6px 10px;border-radius:999px;">${esc(text)}</span>`
}

/** טבלת "תווית — ערך". ערכים כבר escaped/HTML (כדי לאפשר קישורי mailto/tel). */
export function rows(title: string | null, items: [string, string][]): string {
  if (!items.length) return ''
  const trs = items.map(([k, v]) => `<tr>
<td dir="rtl" align="right" style="padding:7px 0;border-bottom:1px solid ${LINE};font:400 13px/1.5 ${FONT};color:${FAINT};width:38%;vertical-align:top;">${esc(k)}</td>
<td dir="rtl" align="right" style="padding:7px 0;border-bottom:1px solid ${LINE};font:700 14px/1.5 ${FONT};color:${INK};vertical-align:top;">${v}</td>
</tr>`).join('')
  return `${title ? `<p dir="rtl" style="margin:22px 0 6px;font:900 13px/1.4 ${FONT};color:${SOFT};">${esc(title)}</p>` : ''}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${trs}</table>`
}

export function para(text: string, opts: { muted?: boolean; html?: boolean } = {}): string {
  return `<p dir="rtl" style="margin:0 0 12px;font:400 15px/1.7 ${FONT};color:${opts.muted ? SOFT : INK};">${opts.html ? text : esc(text)}</p>`
}

/** רשימת צעדים ממוספרת ("מה עכשיו?"). */
export function steps(title: string, items: string[]): string {
  const trs = items.map((t, i) => `<tr>
<td width="30" valign="top" style="padding:6px 0;"><div style="width:24px;height:24px;border-radius:12px;background:#EFF6FF;color:${BRAND};font:900 13px/24px ${FONT};text-align:center;">${i + 1}</div></td>
<td dir="rtl" align="right" style="padding:8px 8px 6px 0;font:400 14px/1.6 ${FONT};color:${SOFT};">${esc(t)}</td>
</tr>`).join('')
  return `<p dir="rtl" style="margin:22px 0 6px;font:900 13px/1.4 ${FONT};color:${SOFT};">${esc(title)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" dir="rtl">${trs}</table>`
}

export function emailLayout(o: {
  /** הטקסט שמופיע בתיבת הדואר ליד הנושא. */
  preheader: string
  /** שורה קטנה מתחת ללוגו בפס הכחול. */
  kicker: string
  title: string
  body: string
  cta?: { label: string; href: string }
  /** שורת סיום אפורה (מעל הפוטר). */
  note?: string
}): string {
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(o.title)}</title></head>
<body style="margin:0;padding:0;background:${BG};" dir="rtl">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td dir="rtl" align="right" bgcolor="${BRAND}" style="background:${BRAND};background-image:linear-gradient(135deg,#1D4ED8 0%,#2563EB 50%,#3B82F6 100%);border-radius:20px 20px 0 0;padding:22px 24px;">
<img src="${LOGO_URL}" width="85" height="40" alt="bloc" style="display:block;border:0;outline:none;height:40px;width:85px;font:900 26px/40px ${FONT};color:#ffffff;">
<div style="font:700 13px/1.4 ${FONT};color:#DBEAFE;margin-top:6px;">${esc(o.kicker)}</div>
</td></tr>
<tr><td dir="rtl" align="right" style="background:#ffffff;border-radius:0 0 20px 20px;padding:28px 24px 24px;">
<h1 dir="rtl" style="margin:0 0 14px;font:900 22px/1.35 ${FONT};color:${INK};">${esc(o.title)}</h1>
${o.body}
${o.cta ? button(o.cta.label, o.cta.href) : ''}
${o.note ? `<p dir="rtl" style="margin:18px 0 0;font:400 12px/1.6 ${FONT};color:${FAINT};">${esc(o.note)}</p>` : ''}
</td></tr>
<tr><td dir="rtl" align="center" style="padding:18px 8px 6px;font:400 12px/1.7 ${FONT};color:${FAINT};">
blocpanel · ניהול מרכזי של bloc
</td></tr>
</table>
</td></tr></table>
</body></html>`
}

/** גרסת טקסט (חלק מהלקוחות / סינון ספאם) — שורות, בלי HTML. */
export function textVersion(lines: (string | null | undefined | false)[]): string {
  return lines.filter((l): l is string => typeof l === 'string').join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n\n— blocpanel'
}
