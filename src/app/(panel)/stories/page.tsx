import { requirePageSession } from "@/lib/pageAuth";
import { can } from "@/lib/permissions";
import { loadStoriesQueue } from "@/lib/storiesServer";
import StoriesQueue from "@/components/stories/StoriesQueue";
export const dynamic = "force-dynamic";

// המיתון של הסטורי (bloc STORIES-1, החלטות 439, 441): הדיווחים לפי פריט (בלי מי דיווח), מה שהוסתר, והבניינים בפיילוט. קריאה בלבד
// מכאן (ה-service role, כמו שאר הפאנל עד א3 — רק העמודות של storiesPanel); הפעולות — דרך bloc החתום (/api/stories).
// לפני SQL 235 — אומרים את זה; קריאה שנכשלה — "נכשל" עם "נסו שוב" (לא רשימה ריקה).
export default async function StoriesPage() {
  const session = await requirePageSession("stories.read");
  const data = await loadStoriesQueue();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "1100px" }}>
      <StoriesQueue data={data} canManage={can(session.role, "stories.manage")} canPilot={can(session.role, "stories.pilot")} />
    </div>
  );
}
