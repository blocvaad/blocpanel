// src/lib/adsCta.ts — ADS-2ג1 (bloc החלטות 402, 404–405; SQL 233): הכפתור של כל מודעה. טהור (בלי I/O), דפדפן ושרת.
//
// במודעה נשמרת כתובת אחת (cta_url) — אתר (https), או שיחה (tel:+972… / tel:1700… / tel:*NNNN — אותו כלל כמו ה-CHECK של 233 ו-AD_TEL_RE ב-bloc).
// וואטסאפ וניווט הם https: wa.me עם הודעה מוכנה, ו-Waze (waze.com/ul?q=…&navigate=yes). מה הכפתור עושה נגזר מהכתובת (ctaKindOf —
// אותו כלל כמו adCtaKind ב-bloc), ולכן אין עמודה חדשה. כאן: הטיוטה של העורך (סוג + מה שהוקלד), הכתובת שנשמרת ממנה, מה חסר, ומה הדייר
// יקבל — במילים, להצגה בסטודיו ובכרטיס של המודעה; והשם של "הקלקה" בדוח לפי הסוג (לחיצות לשיחה / לוואטסאפ / לניווט).

export type CtaKind = "link" | "call" | "whatsapp" | "navigate";
export const CTA_KINDS: readonly CtaKind[] = ["link", "call", "whatsapp", "navigate"];
export const CTA_KIND_LABEL: Record<CtaKind, string> = { link: "אתר", call: "שיחה", whatsapp: "וואטסאפ", navigate: "ניווט" };
export const CTA_KIND_HINT: Record<CtaKind, string> = {
  link: "דף באתר שלכם: מבצע, תפריט, הזמנה או טופס.",
  call: "הדייר לוחץ, והטלפון שלו מחייג אליכם.",
  whatsapp: "נפתחת שיחת וואטסאפ אתכם, עם הודעה מוכנה שהדייר רק שולח.",
  navigate: "נפתח ניווט עד הדלת (Waze, או מפות).",
};
/** שמות מוכנים לכפתור לכל סוג — לוחצים וממלאים; אפשר לכתוב כל שם (2 עד 24 תווים). */
export const CTA_LABEL_SUGGESTIONS: Record<CtaKind, readonly string[]> = {
  link: ["לפרטים", "למבצע", "להזמנה", "לתפריט", "לקבלת ההטבה"],
  call: ["התקשרו עכשיו", "להזמנה בטלפון", "לתיאום ביקור", "דברו איתנו"],
  whatsapp: ["שלחו הודעה", "הזמינו בוואטסאפ", "שאלו אותנו", "לתיאום בוואטסאפ"],
  navigate: ["איך מגיעים", "נווטו אלינו", "בואו לבקר", "לחנות"],
};
/** הטקסט שהיה לכפתור עד ADS-2ג1 (ברירת המחדל של הטופס) — מתחלף כשבוחרים סוג אחר, כמו שם מוכן. */
const DEFAULT_LABELS = new Set(["לפרטים", ...Object.values(CTA_LABEL_SUGGESTIONS).flat()]);

/**
 * כפתור "שיחה" — בדיוק ה-CHECK של SQL 233 ו-AD_TEL_RE ב-bloc (סבב הבדיקה, שורה 2: לפי הקידומת, לא רק לפי האורך): +972 ואחריו קווי
 * (2 / 3 / 4 / 8 / 9 ו-7 ספרות) או נייד ו-07 (5 / 7 ו-8 ספרות); 1-599 / 1-700 / 1-800 / 1-801 ו-6 ספרות — בלי +972, כך מחייגים אליהם;
 * או כוכבית ו-3–5 ספרות. מספר שחסרה בו ספרה או שיש בו ספרה מיותרת — לא נשמר.
 */
export const AD_TEL_RE = /^tel:(\+972([23489][0-9]{7}|[57][0-9]{8})|1(599|700|80[01])[0-9]{6}|\*[0-9]{3,5})$/;
/** ההודעה המוכנה בוואטסאפ: עד 120 תווים (בעברית כל אות היא 6 תווים בכתובת, וכל הכתובת עד 1,000). */
export const WA_TEXT_MAX = 120;
export const CTA_URL_MAX = 1000;

/** הסוג מהכתובת — אותו כלל כמו adCtaKind ב-bloc: tel — שיחה; wa.me / api.whatsapp.com — וואטסאפ; Waze / מפות — ניווט; השאר — אתר. */
export function ctaKindOf(url: string): CtaKind {
  const v = (url ?? "").trim();
  if (AD_TEL_RE.test(v)) return "call";
  let u: URL;
  try { u = new URL(v); } catch { return "link"; }
  if (u.protocol !== "https:") return "link";
  const h = u.hostname.toLowerCase();
  if (h === "wa.me" || h === "api.whatsapp.com") return "whatsapp";
  if (h === "waze.com" || h.endsWith(".waze.com") || h === "maps.apple.com" || h === "maps.google.com" || h === "maps.app.goo.gl"
      || ((h === "google.com" || h === "www.google.com") && u.pathname.startsWith("/maps"))) return "navigate";
  return "link";
}

// ── מספר טלפון ישראלי ──

/** קווי — 8 ספרות (בלי ה-0); נייד ו-07 — 9; 1-700 וחבריו — 10. */
const IL_LANDLINE = /^[23489][0-9]{7}$/;
const IL_MOBILE = /^[57][0-9]{8}$/;
const IL_NATIONWIDE = /^1(599|700|80[01])[0-9]{6}$/;
/** הספרות כמו שהוקלדו, בלי רווחים / מקפים / סוגריים, בלי 972 ובלי ה-0 שבהתחלה; כוכבית — כמו שהיא; תווים אחרים → null. */
function ilDigits(input: string): string | null {
  const raw = (input ?? "").trim().replace(/[\s\-().‎‏⁦⁩]/g, "");
  if (/^\*[0-9]+$/.test(raw)) return raw;
  let d = raw;
  if (d.startsWith("+972")) d = d.slice(4);
  else if (d.startsWith("00972")) d = d.slice(5);
  else if (d.startsWith("972") && d.length >= 11) d = d.slice(3);
  if (!/^[0-9]+$/.test(d)) return null;
  return d.startsWith("0") ? d.slice(1) : d;
}
/** "050-123 4567", "+972 50…", "972…", "00972…", "1-800-…" → הספרות אחרי 972 (בלי 0); כוכבית → "*NNNN"; לא תקין (גם קידומת שאין
 *  או ספרה חסרה / מיותרת) → null. */
export function ilNational(input: string): string | null {
  const d = ilDigits(input);
  if (!d) return null;
  if (d.startsWith("*")) return /^\*[0-9]{3,5}$/.test(d) ? d : null;
  return IL_LANDLINE.test(d) || IL_MOBILE.test(d) || IL_NATIONWIDE.test(d) ? d : null;
}
/** מה לא בסדר במספר (כשאינו תקין) — כדי לומר "חסרה ספרה" ולא רק "לא תקין". */
export type IlPhoneProblem = { kind: "short" | "long"; by: number } | { kind: "prefix" | "chars" | "star" };
export function ilPhoneProblem(input: string): IlPhoneProblem | null {
  if (ilNational(input)) return null;
  const d = ilDigits(input);
  if (!d) return { kind: "chars" };
  if (d.startsWith("*")) return { kind: "star" };
  const want = /^[23489]/.test(d) ? 8 : /^[57]/.test(d) ? 9 : /^1(599|700|80[01])/.test(d) ? 10 : 0;
  if (!want) return { kind: "prefix" };
  return d.length < want ? { kind: "short", by: want - d.length } : { kind: "long", by: d.length - want };
}
/** המשפט ל"מה חסר": כמה ספרות חסרות / מיותרות, או מה מותר. */
function phoneProblemText(p: IlPhoneProblem, what: string, example: string): string {
  if (p.kind === "short") return p.by === 1 ? `חסרה ספרה ב${what}` : `חסרות ${p.by} ספרות ב${what}`;
  if (p.kind === "long") return p.by === 1 ? `יש ספרה מיותרת ב${what}` : `יש ${p.by} ספרות מיותרות ב${what}`;
  if (p.kind === "star") return "מספר כוכבית הוא כוכבית ו-3 עד 5 ספרות (למשל *2700)";
  return `${what} לא תקין — ${example}`;
}
/** להצגה: 050-123-4567 / 03-123-4567 / 1-800-123-456 / *2700 (בתוך משפט בעברית — דרך ltr(), כדי שהכוכבית תישאר משמאל). */
export function ilDisplay(national: string): string {
  const n = national;
  if (n.startsWith("*")) return n;
  if (n.length === 10 && n.startsWith("1")) return `${n[0]}-${n.slice(1, 4)}-${n.slice(4, 7)}-${n.slice(7)}`;
  if (n.length === 9) return `0${n.slice(0, 2)}-${n.slice(2, 5)}-${n.slice(5)}`;
  if (n.length === 8) return `0${n[0]}-${n.slice(1, 4)}-${n.slice(4)}`;
  return `0${n}`;
}
/** מספר בתוך משפט בעברית: בידוד משמאל לימין (LRI … PDI) — "*2700" ולא "2700*" (סבב הבדיקה, שורה 6). */
export const ltr = (s: string): string => `\u2066${s}\u2069`;
/** כוכבית ו-1-700 — כמו שמחייגים בארץ (בלי +972); השאר — +972. */
export function phoneToTel(input: string): string | null {
  const n = ilNational(input);
  return n ? (n.startsWith("*") || IL_NATIONWIDE.test(n) ? `tel:${n}` : `tel:+972${n}`) : null;
}
/** הספרות של כתובת tel שמורה (בלי tel: ובלי +972) — להצגה. */
const telNational = (v: string): string => v.replace(/^tel:(\+972)?/, "");

// ── הטיוטה של העורך ──

export interface CtaDraft {
  kind: CtaKind;
  /** אתר: הקישור. */
  url: string;
  /** שיחה: המספר כמו שהוקלד. */
  phone: string;
  /** וואטסאפ: המספר וההודעה המוכנה (לא חובה). */
  waPhone: string;
  waText: string;
  /** ניווט: כתובת, או קישור של Waze / מפות. */
  place: string;
}
export const emptyCtaDraft = (kind: CtaKind = "link"): CtaDraft => ({ kind, url: "", phone: "", waPhone: "", waText: "", place: "" });

/** קישור וואטסאפ שאפשר לפרק לשדות: wa.me/972… או api.whatsapp.com/send?phone=972… של מספר ישראלי (נייד / קווי), ורק text נוסף. */
function waDraft(u: URL): CtaDraft | null {
  if (u.hash || [...u.searchParams.keys()].some((k) => k !== "text" && k !== "phone")) return null;
  let digits: string;
  if (u.hostname === "wa.me") {
    if (u.searchParams.has("phone")) return null;
    digits = u.pathname.replace(/^\/|\/$/g, "");
  } else {
    if (u.pathname.replace(/\/$/, "") !== "/send") return null;
    digits = u.searchParams.get("phone") ?? "";
  }
  if (!/^972[0-9]+$/.test(digits)) return null;
  const n = ilNational(digits);
  if (!n || n.startsWith("*") || IL_NATIONWIDE.test(n)) return null;
  return { ...emptyCtaDraft("whatsapp"), waPhone: ilDisplay(n), waText: u.searchParams.get("text") ?? "" };
}
/**
 * כתובת שמורה → הטיוטה (עריכה / שכפול): כל סוג חוזר לשדות שלו. כתובת שאי אפשר לפרק לשדות (קישור קצר של וואטסאפ עסקי, מספר
 * מחו"ל, פרמטרים נוספים) נשארת כמו שהיא, כדי שתישמר בלי שינוי ובלי שגיאה (סבב הבדיקה, שורה 8): וואטסאפ — כקישור (הסוג עדיין נגזר
 * מהכתובת, ו-bloc מציג את האייקון שלו), ניווט — כקישור הניווט עצמו.
 */
export function ctaDraftFrom(url: string): CtaDraft {
  const v = (url ?? "").trim();
  const kind = ctaKindOf(v);
  if (kind === "call") return { ...emptyCtaDraft("call"), phone: ilDisplay(telNational(v)) };
  if (v.startsWith("tel:")) return { ...emptyCtaDraft("call"), phone: v.slice(4) };
  if (kind === "whatsapp") return waDraft(new URL(v)) ?? { ...emptyCtaDraft("link"), url: v };
  if (kind === "navigate") {
    const u = new URL(v);
    const q = (u.hostname === "waze.com" || u.hostname === "www.waze.com") && u.pathname === "/ul" ? u.searchParams.get("q") : null;
    const place = q && q.trim() && navUrl(q) === v ? q : v;
    return { ...emptyCtaDraft("navigate"), place };
  }
  return { ...emptyCtaDraft("link"), url: v };
}

function waUrl(phone: string, text: string): string | null {
  const n = ilNational(phone);
  if (!n || n.startsWith("*") || IL_NATIONWIDE.test(n)) return null;
  const t = text.trim();
  return `https://wa.me/972${n}${t ? `?text=${encodeURIComponent(t)}` : ""}`;
}
/** "Https://…" (אות גדולה של המקלדת בטלפון) → "https://…": ה-CHECK של 233 בודק את האותיות כמו שהן (סבב הבדיקה, שורה 7). */
const lowerScheme = (u: string): string => u.replace(/^https:\/\//i, "https://");
function navUrl(place: string): string | null {
  const p = place.trim();
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) { const q = lowerScheme(p); return ctaKindOf(q) === "navigate" ? q : null; }
  if (p.length < 3 || p.length > 120) return null;
  return `https://waze.com/ul?q=${encodeURIComponent(p)}&navigate=yes`;
}

/** הכתובת שנשמרת (cta_url). "" — עוד לא מוכן (ctaIssue אומר מה חסר). */
export function ctaUrlFrom(d: CtaDraft): string {
  switch (d.kind) {
    case "link": return lowerScheme(d.url.trim());
    case "call": return phoneToTel(d.phone) ?? "";
    case "whatsapp": return waUrl(d.waPhone, d.waText) ?? "";
    case "navigate": return navUrl(d.place) ?? "";
  }
}

const httpsOk = (u: string) => /^https:\/\/\S+$/.test(u.trim());

/** מה חסר בכפתור — משפט בלי נקודה בסוף (כמו שאר "מה חסר"); null — מוכן. */
export function ctaIssue(d: CtaDraft): string | null {
  switch (d.kind) {
    case "link": {
      const u = lowerScheme(d.url.trim());
      if (!u) return "חסר הקישור של הכפתור";
      if (!httpsOk(u)) return "הקישור של הכפתור צריך להתחיל ב-https://";
      return u.length > CTA_URL_MAX ? "הקישור ארוך מ-1,000 תווים" : null;
    }
    case "call": {
      if (!d.phone.trim()) return "חסר מספר הטלפון";
      const p = ilPhoneProblem(d.phone);
      return p ? phoneProblemText(p, "מספר הטלפון", "נייד (050-1234567), קווי (03-1234567), 1-700 או כוכבית (*2700)") : null;
    }
    case "whatsapp": {
      if (!d.waPhone.trim()) return "חסר מספר הוואטסאפ";
      const n = ilNational(d.waPhone);
      if (d.waPhone.trim().startsWith("*")) return "בוואטסאפ צריך מספר טלפון רגיל, לא כוכבית";
      if (n && IL_NATIONWIDE.test(n)) return "בוואטסאפ צריך מספר נייד או קווי, לא 1-700 / 1-800";
      if (!n) return phoneProblemText(ilPhoneProblem(d.waPhone) ?? { kind: "chars" }, "מספר הוואטסאפ", "מספר ישראלי, למשל 050-1234567");
      if (d.waText.trim().length > WA_TEXT_MAX) return `ההודעה המוכנה ארוכה מ-${WA_TEXT_MAX} תווים`;
      return (waUrl(d.waPhone, d.waText) ?? "").length > CTA_URL_MAX ? "ההודעה המוכנה ארוכה מדי — קצרו אותה" : null;
    }
    case "navigate": {
      const p = d.place.trim();
      if (!p) return "חסרה כתובת לניווט";
      if (/^https?:\/\//i.test(p)) {
        if (!/^https:\/\//i.test(p)) return "קישור הניווט צריך להתחיל ב-https://";
        if (ctaKindOf(p) !== "navigate") return "זה לא קישור של Waze או של מפות — כתבו כתובת, או הדביקו קישור ניווט";
        return p.length > CTA_URL_MAX ? "הקישור ארוך מ-1,000 תווים" : null;
      }
      if (p.length < 3) return "הכתובת קצרה מדי — רחוב, מספר ועיר";
      return p.length > 120 ? "הכתובת ארוכה מ-120 תווים" : null;
    }
  }
}

/** בחירת סוג אחר: מה שהוקלד בכל סוג נשאר (חוזרים — וזה שם), והשם של הכפתור מתחלף רק אם היה שם מוכן (לא שם שכתבתם). */
export function switchCtaKind(d: CtaDraft, label: string, kind: CtaKind): { draft: CtaDraft; label: string } {
  const keep = !DEFAULT_LABELS.has(label.trim()) && label.trim().length > 0;
  return { draft: { ...d, kind }, label: keep || kind === d.kind ? label : CTA_LABEL_SUGGESTIONS[kind][0] };
}

/** מה הדייר יקבל — משפט לסטודיו ולכרטיס של המודעה (null — עוד לא מוכן; אתר — finalLink אומר את הקישור עם utm). */
export function ctaOutcome(url: string): string | null {
  const v = (url ?? "").trim();
  const kind = ctaKindOf(v);
  if (kind === "call") return `הדייר יחייג אליכם: ${ltr(ilDisplay(telNational(v)))}`;
  if (kind === "whatsapp") {
    const d = ctaDraftFrom(v);
    if (d.kind !== "whatsapp") return "תיפתח שיחת וואטסאפ מהקישור שהדבקתם";
    return d.waText.trim() ? `תיפתח שיחת וואטסאפ עם ${ltr(d.waPhone)}, וההודעה "${d.waText.trim()}" כבר כתובה` : `תיפתח שיחת וואטסאפ עם ${ltr(d.waPhone)}`;
  }
  if (kind === "navigate") {
    const d = ctaDraftFrom(v);
    return d.place === v ? "ייפתח הניווט מהקישור שהדבקתם" : `ייפתח ניווט ב-Waze אל: ${d.place}`;
  }
  return null;
}

/** בכרטיס של המודעה: לאן הכפתור מוביל, בקצרה (אתר — הכתובת עצמה). */
export function ctaShort(url: string): string {
  const v = (url ?? "").trim();
  const kind = ctaKindOf(v);
  if (kind === "call") return `שיחה · ${ltr(ilDisplay(telNational(v)))}`;
  if (kind === "whatsapp") { const d = ctaDraftFrom(v); return `וואטסאפ · ${d.kind === "whatsapp" ? ltr(d.waPhone) : "קישור"}`; }
  if (kind === "navigate") { const d = ctaDraftFrom(v); return `ניווט · ${d.place === v ? "קישור" : d.place}`; }
  return v;
}

/**
 * "הקלקות" לפי מה שהכפתור עושה (bloc החלטה 405): לחיצות לשיחה / לוואטסאפ / לניווט — bloc סופר לחיצה על הכפתור, לא שיחה שהתקיימה או
 * הודעה שנשלחה (סבב הבדיקה, שורה 10: מספר שהמפרסם רואה, ולפעמים משלם לפיו).
 */
export function clicksText(n: number, kind: CtaKind, fmt: (n: number) => string = (x) => x.toLocaleString("he-IL")): string {
  const what = kind === "call" ? "לשיחה" : kind === "whatsapp" ? "לוואטסאפ" : kind === "navigate" ? "לניווט" : null;
  if (!what) return `${fmt(n)} הקלקות`;
  return n === 1 ? `לחיצה אחת ${what}` : `${fmt(n)} לחיצות ${what}`;
}

/** הכותרת של המדד בדוח הקמפיין: כל המודעות עם אותה פעולה — "לחיצות לשיחה" וכו'; מעורב או אתר — "הקלקות". */
export function clicksTitle(kinds: readonly CtaKind[]): string {
  const one = new Set(kinds);
  if (one.size !== 1) return "הקלקות";
  const k = [...one][0];
  return k === "call" ? "לחיצות לשיחה" : k === "whatsapp" ? "לחיצות לוואטסאפ" : k === "navigate" ? "לחיצות לניווט" : "הקלקות";
}

/** הפעולה שהלחיצות של מודעה נספרות לפיה: קרוסלה שיש בה כרטיס עם קישור משלו — "הקלקות" (לחיצה שם היא לאתר, לא לפעולה של המודעה). */
export function clickKindOf(c: { cta_url: string; frames?: readonly { cta_url?: string | null }[] | null }): CtaKind {
  if (c.frames?.some((f) => !!f?.cta_url)) return "link";
  return ctaKindOf(c.cta_url ?? "");
}
