"use client";
// dmReports/DmReportsQueueClient — MOD-1: הנתונים של התור מ-/api/dm-reports (סקירת MOD-1 #2: לא ב-HTML של הדף — ה-service worker
// של הפאנל שומר עותק של כל דף, ולא של /api/). הסינון בכתובת (הדף מעביר אותו); שינוי בסינון — קריאה חדשה. כשל — "נסו שוב".
import { useCallback, useEffect, useState } from "react";
import { DmReportsQueueView } from "@/components/dmReports/DmReportsQueue";
import { dmListBody, parseDmList, type DmFilter } from "@/lib/dmReports";
import type { DmQueueData } from "@/lib/dmReportsServer";

/** הכתובת של הקריאה — אותו סינון כמו בדף. */
export function queueApiUrl(f: DmFilter): string {
  const b = dmListBody(f);
  const q = new URLSearchParams();
  q.set("status", String(b.status));
  q.set("order", String(b.order));
  if (f.reason) q.set("reason", f.reason);
  if (f.building) q.set("building", f.building);
  if (f.person) q.set("person", f.person);
  return `/api/dm-reports?${q.toString()}`;
}

/** תשובת /api/dm-reports → מה שהתצוגה מקבלת. צורה לא מוכרת — כשל, לא "אין דיווחים". */
export function queueFromReply(status: number, j: unknown): DmQueueData {
  const o = (j && typeof j === "object" ? j : {}) as Record<string, unknown>;
  if (o.state === "missing") return { state: "missing" };
  if (status >= 200 && status < 300 && o.state === "ok") {
    const l = parseDmList({ ok: true, items: o.items, open_total: o.openTotal, truncated: o.truncated });
    if (l) return { state: "ok", ...l };
  }
  return { state: "error", message: typeof o.message === "string" ? o.message : typeof o.error === "string" ? o.error : "" };
}

export default function DmReportsQueueClient({ filter }: { filter: DmFilter }) {
  const [data, setData] = useState<DmQueueData | { state: "loading" }>({ state: "loading" });
  const [now, setNow] = useState(0);
  const url = queueApiUrl(filter);
  const load = useCallback(async (signal?: AbortSignal) => {
    setData({ state: "loading" });
    try {
      const r = await fetch(url, { credentials: "include", cache: "no-store", signal });
      const j = await r.json().catch(() => null);
      setNow(Date.now());
      setData(queueFromReply(r.status, j));
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      setData({ state: "error", message: "אין חיבור." });
    }
  }, [url]);
  useEffect(() => {
    const c = new AbortController();
    void load(c.signal);
    return () => c.abort();
  }, [load]);
  return <DmReportsQueueView data={data} filter={filter} now={now} onRetry={() => { void load() }} />;
}
