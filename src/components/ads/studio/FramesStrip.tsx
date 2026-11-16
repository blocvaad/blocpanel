"use client";
// studio/FramesStrip — התמונות של סטורי / קרוסלה (bloc ADS-2א v2, החלטה 380): פס של 2–5 תמונות קטנות — הוספה, הסרה, סידור
// בגרירה או בחצים (קודם / אחר כך); לחיצה על תמונה פותחת אותה: העלאה (רק לבאקט של bloc), נקודת מיקוד, תיאור לקורא מסך,
// כיתוב (עד 60) ובקרוסלה — קישור משלה. הראשונה — השער. תמונה מאתר אחר לא נטענת. תצוגה בלבד (הכל דרך onChange).
import { ChevronRight, ChevronLeft, Trash2, Plus } from "lucide-react";
import { ghostBtn, inputStyle } from "@/components/ui/panelKit";
import { Field } from "../adsKit";
import CreativeImageField from "../CreativeImageField";
import FocalPicker from "./FocalPicker";
import {
  FORMAT_INFO, FRAMES_MAX, FRAMES_MIN, CAPTION_MAX, canAddFrame, canRemoveFrame, moveFrame, removeFrame, updateFrame, dropFrame, objectPosition,
  type AdFormat, type FrameDraft,
} from "@/lib/adsFormats";
import { isOurAdImage, type ImageBox } from "@/lib/adsUi";

const iconBtn: React.CSSProperties = { ...ghostBtn, width: "44px", padding: 0 };
/** מה שצריך מאירוע גרירה (React.DragEvent מספק את זה). */
type DragLike = { dataTransfer: DataTransfer; preventDefault: () => void };

/** אחרי סידור — התמונה שנבחרה נשארת נבחרת (לפי key). */
export const indexOfKey = (list: readonly FrameDraft[], key: string | undefined, fallback: number) => {
  const i = key ? list.findIndex((f) => f.key === key) : -1;
  return i >= 0 ? i : Math.min(Math.max(0, fallback), list.length - 1);
};

export default function FramesStrip({ formats, frames, selected, onSelect, onChange, boxes, onPick, onAdd, locked, busy, refusedFrame, imageBase }: {
  /** סטורי ו / או קרוסלה (מה שנבחר). */
  formats: AdFormat[];
  frames: FrameDraft[]; selected: number; onSelect: (i: number) => void; onChange: (frames: FrameDraft[], selected?: number) => void;
  boxes: Record<string, ImageBox>; onPick: (key: string) => void; onAdd: () => void;
  locked: boolean; busy: boolean; refusedFrame: number | null; imageBase: string | null;
}) {
  const n = frames.length;
  const carousel = formats.includes("carousel");
  const onlyCarousel = carousel && !formats.includes("story");
  const one = onlyCarousel ? "כרטיס" : "תמונה";
  const off = locked || busy;
  const cur = Math.min(Math.max(0, selected), n - 1);
  const f = frames[cur];
  const foreign = (u: string) => isOurAdImage(u, imageBase) === false;
  const ratio = FORMAT_INFO[onlyCarousel ? "carousel" : "story"].image;
  const thumbH = 76;
  const thumbW = Math.round((thumbH * ratio.w) / ratio.h);
  const move = (i: number, d: -1 | 1) => { const next = moveFrame(frames, i, d); onChange(next, indexOfKey(next, frames[i]?.key, i)); };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }} data-frames-strip={formats.join(",")} data-frames-count={n}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "14.5px", fontWeight: 700, color: "var(--text)" }}>
          {onlyCarousel ? "הכרטיסים בקרוסלה" : carousel ? "התמונות בסטורי ובקרוסלה" : "התמונות בסטורי"}{" "}
          <span className="studio-num" style={{ color: "var(--text-2)", fontWeight: 500, fontFamily: "var(--mono)" }}>({n}/{FRAMES_MAX})</span>
        </span>
        <span style={{ fontSize: "12.5px", color: "var(--text-3)" }}>{FRAMES_MIN} עד {FRAMES_MAX}. גוררים או משתמשים בחצים כדי לסדר; הראשונה — השער.</span>
      </div>
      <div className="studio-scroll" role="listbox" aria-label={`${one === "כרטיס" ? "הכרטיסים" : "התמונות"} — בחירה וסידור`} style={{ gap: "8px", alignItems: "flex-end", paddingBottom: "2px" }}>
        {frames.map((fr, i) => {
          const on = i === cur;
          const refused = refusedFrame === i;
          const ok = !!fr.image_url && !foreign(fr.image_url);
          return (
            <button key={fr.key} type="button" role="option" aria-selected={on} draggable={!off} data-frame-thumb={i} data-frame-refused={refused ? "" : undefined}
              aria-label={`${one} ${i + 1}${i === 0 ? " (השער)" : ""}${ok ? "" : " — בלי תמונה"}`}
              onClick={() => onSelect(i)}
              onDragStart={(e: DragLike) => { e.dataTransfer.setData("text/plain", String(i)); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e: DragLike) => { if (!off) e.preventDefault(); }}
              onDrop={(e: DragLike) => { e.preventDefault(); if (off) return; const from = Number(e.dataTransfer.getData("text/plain")); if (!Number.isInteger(from)) return; const next = dropFrame(frames, from, i); onChange(next, indexOfKey(next, frames[cur]?.key, cur)); }}
              style={{ position: "relative", width: `${thumbW + 8}px`, padding: "4px", borderRadius: "12px", flexShrink: 0, fontFamily: "inherit", cursor: off ? "default" : "grab",
                border: `2px solid ${refused ? "#ef4444" : on ? "var(--blue)" : "var(--border)"}`, background: on ? "rgba(59,130,246,.1)" : "var(--card)" }}>
              <span style={{ display: "block", width: `${thumbW}px`, height: `${thumbH}px`, borderRadius: "8px", overflow: "hidden", background: "var(--surface)" }}>
                {ok
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={fr.image_url} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: objectPosition(fr.focal[0], fr.focal[1]) }} />
                  : <span style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: "18px" }}>+</span>}
              </span>
              <span className="studio-num" style={{ position: "absolute", top: "8px", right: "8px", minWidth: "20px", height: "20px", borderRadius: "99px", background: "rgba(11,18,32,.82)", color: "#fff", fontSize: "11.5px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)" }}>{i + 1}</span>
            </button>
          );
        })}
        <button type="button" style={{ ...ghostBtn, height: `${thumbH + 12}px`, width: `${thumbW + 8}px`, flexDirection: "column", gap: "4px", fontSize: "12.5px", flexShrink: 0, opacity: off || !canAddFrame(n) ? 0.45 : 1 }}
          disabled={off || !canAddFrame(n)} onClick={onAdd} data-frame-add="" aria-label={onlyCarousel ? "הוספת כרטיס" : "הוספת תמונה"}>
          <Plus size={18} />הוספה
        </button>
      </div>
      {!canAddFrame(n) && <span style={{ fontSize: "12.5px", color: "var(--text-2)" }} data-frame-max="">עד {FRAMES_MAX} — זה המקסימום.</span>}

      {f && (
        <div data-frame={cur} style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px", borderRadius: "12px", border: `1px solid ${refusedFrame === cur ? "#ef444488" : "var(--border)"}`, background: refusedFrame === cur ? "#ef44440d" : "transparent" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", flex: 1 }}>{one} {cur + 1}{cur === 0 ? " (השער)" : ""}</span>
            <button type="button" style={{ ...iconBtn, opacity: off || cur === 0 ? 0.45 : 1 }} disabled={off || cur === 0} aria-label={`הזזת ${one} ${cur + 1} קודם`} data-frame-up={cur}
              onClick={() => move(cur, -1)}><ChevronRight size={18} /></button>
            <button type="button" style={{ ...iconBtn, opacity: off || cur === n - 1 ? 0.45 : 1 }} disabled={off || cur === n - 1} aria-label={`הזזת ${one} ${cur + 1} אחר כך`} data-frame-down={cur}
              onClick={() => move(cur, 1)}><ChevronLeft size={18} /></button>
            <button type="button" style={{ ...iconBtn, color: "var(--red)", opacity: off || !canRemoveFrame(n) ? 0.45 : 1 }} disabled={off || !canRemoveFrame(n)} aria-label={`הסרת ${one} ${cur + 1}`} data-frame-remove={cur}
              onClick={() => { const next = removeFrame(frames, cur); onChange(next, Math.min(cur, next.length - 1)); }}><Trash2 size={16} /></button>
          </div>
          {boxes[f.key] && (
            <CreativeImageField url={foreign(f.image_url) ? "" : f.image_url} box={boxes[f.key]} locked={locked} onPick={() => onPick(f.key)}
              shape={{ w: 56, h: Math.round((56 * ratio.h) / ratio.w), label: ratio.ratio }} />
          )}
          <FocalPicker url={f.image_url && !foreign(f.image_url) ? f.image_url : null} alt={f.image_alt} focal={f.focal} formats={formats} disabled={locked} testId={`frame-${cur}`}
            onFocal={(focal) => onChange(updateFrame(frames, cur, { focal }), cur)} />
          <Field label="מה רואים בתמונה (לקורא מסך)">
            <input value={f.image_alt} maxLength={200} disabled={locked} style={inputStyle} data-frame-field={`${cur}.image_alt`}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(updateFrame(frames, cur, { image_alt: e.target.value }), cur)} />
          </Field>
          <Field label={`כיתוב (לא חובה, ${f.caption.length}/${CAPTION_MAX})`}>
            <input value={f.caption} maxLength={CAPTION_MAX} disabled={locked} style={inputStyle} data-frame-field={`${cur}.caption`}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(updateFrame(frames, cur, { caption: e.target.value }), cur)} />
          </Field>
          {carousel && (
            <Field label="קישור לכרטיס הזה (לא חובה, רק בקרוסלה)" hint={formats.includes("story") ? "בסטורי הקישור הזה לא נשלח — לכל התמונות שם קישור אחד." : "ריק — הכרטיס מוביל לקישור של המודעה."}>
              <input value={f.cta_url} disabled={locked} placeholder="https://" dir="ltr" style={inputStyle} data-frame-field={`${cur}.cta_url`}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(updateFrame(frames, cur, { cta_url: e.target.value }), cur)} />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}
