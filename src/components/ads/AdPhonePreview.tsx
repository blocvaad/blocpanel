"use client";
// AdPhonePreview — איך הפרסומת תיראה אצל הדייר (bloc ADS-1b): אותו מסך מלא כמו ב-bloc
// (components/ads/SponsoredInterstitial) — הרקע המטושטש מהתמונה, מסגרת 4:5 שהתמונה ממלאת, ה-X עם הספירה על
// התמונה עצמה, ומתחת הכותרת, המשפט, הכפתור הלבן ו"ממומן על ידי" המפרסם — בתוך מסגרת של טלפון (360×740, מוקטן).
// התמונה ממלאת את המסגרת (חותכים את העודף): כך נראית כל פרסומת באותו גודל, גם כשהועלתה בגודל אחר מ-1080×1350.
export default function AdPhonePreview({ advertiser, imageUrl, imageAlt, headline, body, ctaLabel, scale = 0.62 }: {
  advertiser: string; imageUrl: string | null; imageAlt: string; headline: string; body: string | null; ctaLabel: string; scale?: number;
}) {
  const W = 360, H = 740;
  // כמו AD_FRAME_WIDTH ב-bloc: כל הרוחב (פחות 16px מכל צד), אבל משאיר כ-280px לטקסט ולכפתורים.
  const frameW = Math.min(W - 20 - 32, Math.floor((H - 20 - 280) * 0.8));
  const clamp2: React.CSSProperties = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" };
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
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.45), rgba(0,0,0,.3) 45%, rgba(0,0,0,.8))" }} />
        <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
          <div style={{ width: `${frameW}px`, display: "flex", flexDirection: "column" }} data-ad-preview-card="">
            <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 5", borderRadius: "22px", overflow: "hidden", background: "rgba(255,255,255,.1)", boxShadow: "0 18px 50px rgba(0,0,0,.45)" }} data-ad-preview-frame="">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt={imageAlt} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ position: "absolute", inset: 0, border: "2px dashed rgba(255,255,255,.25)", borderRadius: "22px", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.6)", fontSize: "15px", textAlign: "center", padding: "0 24px" }}>
                  התמונה תופיע כאן (1080×1350)
                </div>
              )}
              <span aria-hidden data-ad-preview-close="" style={{ position: "absolute", left: "12px", top: "12px", width: "44px", height: "44px", borderRadius: "50%", border: "2.5px solid rgba(255,255,255,.28)", background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "15px", fontWeight: 900 }}>3</span>
            </div>
            <div style={{ marginTop: "16px", fontSize: "20px", fontWeight: 900, lineHeight: 1.25, color: "#fff", ...clamp2 }}>{headline || "הכותרת של הפרסומת"}</div>
            {body && <div style={{ marginTop: "6px", fontSize: "15px", lineHeight: 1.4, color: "rgba(255,255,255,.85)", ...clamp2 }}>{body}</div>}
            <div style={{ marginTop: "16px", minHeight: "52px", borderRadius: "16px", background: "#fff", color: "#0F172A", fontSize: "16px", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {ctaLabel || "לפרטים"}
            </div>
            <div style={{ marginTop: "12px", textAlign: "center", fontSize: "13px", color: "rgba(255,255,255,.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} data-ad-preview-sponsored="">
              ממומן על ידי <b style={{ color: "rgba(255,255,255,.85)" }}>{advertiser || "שם המפרסם"}</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
