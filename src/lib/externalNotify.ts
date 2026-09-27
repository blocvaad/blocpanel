// התראה לערוץ חיצוני (Slack / Make / Zapier) — נשלחת ישירות מהשרת.
// קודם זה עבר דרך POST /api/webhook של הפאנל עצמו (קריאה לעצמו דרך
// NEXT_PUBLIC_PANEL_URL + סוד משותף). זה היה endpoint ציבורי מיותר שנכשל
// בשקט כשה-URL לא הוגדר. עכשיו: אותו פורמט הודעה, בלי endpoint.
// לא שולחים פרטי תשלום/טוקנים — רק שם, מסלול ומזהה.

export type ExternalEvent = "building.created";

export function formatExternalMessage(event: ExternalEvent | string, data: Record<string, unknown>): string {
  switch (event) {
    case "building.created":
      return `בניין חדש נוצר: ${String(data.name ?? "")} (${String(data.plan ?? "free")})`;
    default:
      return `אירוע: ${event}`;
  }
}

export async function notifyExternal(event: ExternalEvent, data: Record<string, unknown>): Promise<void> {
  const url = process.env.EXTERNAL_WEBHOOK_URL;
  if (!url || !/^https:\/\//.test(url)) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: formatExternalMessage(event, data), event, data }),
      signal: ctrl.signal,
    });
  } catch {
    // best-effort: כשל בערוץ חיצוני לא מפיל יצירת בניין
  } finally {
    clearTimeout(t);
  }
}
