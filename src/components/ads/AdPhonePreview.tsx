"use client";
// AdPhonePreview — איך הפרסומת תיראה אצל הדייר (bloc ADS-1): אותו מסך מלא כמו ב-bloc
// (components/ads/SponsoredInterstitial) — הרקע המטושטש מהתמונה, "ממומן" ושם המפרסם, X עם הספירה,
// התמונה, הכותרת, המשפט והכפתור הלבן — בתוך מסגרת של טלפון (360×740, מוקטן).
export default function AdPhonePreview({ advertiser, imageUrl, imageAlt, headline, body, ctaLabel, scale = 0.62 }: {
  advertiser: string; imageUrl: string | null; imageAlt: string; headline: string; body: string | null; ctaLabel: string; scale?: number;
}) {
  const W = 360, H = 740;
  return (
    <div aria-label="תצוגה מקדימה של הפרסומת" role="img" data-ad-preview=""
      style={{ width: `${W * scale}px`, height: `${H * scale}px`, flexShrink: 0 }}>
      <div dir="rtl" style={{
        width: `${W}px`, height: `${H}px`, transform: `scale(${scale})`, transformOrigin: "top right",
        borderRadius: "44px", border: "10px solid #1f2937", background: "#0B1220", overflow: "hidden", position: "relative",
        fontFamily: "Heebo, Arial, sans-serif",
      }}>
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.1)", filter: "blur(24px)", opacity: 0.5 }} />
        )}
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.55), rgba(0,0,0,.25) 45%, rgba(0,0,0,.85))" }} />
        <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", padding: "34px 16px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "48px" }}>
            <span style={{ borderRadius: "99px", background: "rgba(255,255,255,.16)", padding: "4px 12px", fontSize: "14.5px", fontWeight: 700, color: "#fff" }}>ממומן</span>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "15px", fontWeight: 700, color: "rgba(255,255,255,.9)" }}>
              {advertiser || "שם המפרסם"}
            </span>
            <span aria-hidden style={{ width: "44px", height: "44px", borderRadius: "50%", border: "2.5px solid rgba(255,255,255,.28)", background: "rgba(255,255,255,.16)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "15px", fontWeight: 900 }}>3</span>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 0" }}>
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={imageAlt} style={{ maxHeight: "100%", width: "100%", objectFit: "contain", borderRadius: "20px" }} />
            ) : (
              <div style={{ width: "100%", aspectRatio: "4 / 5", borderRadius: "20px", border: "2px dashed rgba(255,255,255,.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.6)", fontSize: "15px", textAlign: "center", padding: "0 24px" }}>
                התמונה תופיע כאן (1080×1350)
              </div>
            )}
          </div>
          <div style={{ fontSize: "24px", fontWeight: 900, lineHeight: 1.2, color: "#fff" }}>{headline || "הכותרת של הפרסומת"}</div>
          {body && <div style={{ marginTop: "6px", fontSize: "16px", lineHeight: 1.4, color: "rgba(255,255,255,.85)" }}>{body}</div>}
          <div style={{ marginTop: "20px", minHeight: "52px", borderRadius: "16px", background: "#fff", color: "#0F172A", fontSize: "17px", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {ctaLabel || "לפרטים"}
          </div>
        </div>
      </div>
    </div>
  );
}
