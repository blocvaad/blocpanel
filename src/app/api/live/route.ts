import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { readBloc } from "@/lib/blocRead";
import { actorOf } from "@/lib/moneyActions";
import { buildLiveEvents, clampSince } from "@/lib/liveEvents";

// GET /api/live?since=ISO — אירועים מאז cursor + מונים. מחליף Realtime עם anon
// (שנחסם ע"י RLS ולכן לא החזיר כלום). cursor חדש = זמן השרת של bloc בתחילת הבקשה,
// כך שאירוע שנכתב בזמן השאילתות ייתפס בסבב הבא (כפילות מסוננת ב-id).
// א3-1 (bloc, החלטה 444): הקריאות עצמן ב-bloc (lib/blocRead) — כאן רק בונים את האירועים בעברית.
// כשל בערוץ — 502 עם הסיבה (המסך אומר "לא מתעדכן"), לא רשימה ריקה ומונים של אפס.
export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  const since = clampSince(req.nextUrl.searchParams.get("since"));
  const r = await readBloc("live", { since }, actorOf(g.session));
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code ?? "BLOC" }, { status: 502, headers: { "Cache-Control": "no-store" } });

  const d = r.data;
  return NextResponse.json(
    { cursor: d.cursor, events: buildLiveEvents(d.src, d.names), stats: d.stats, failed: d.failed },
    { headers: { "Cache-Control": "no-store" } },
  );
}
