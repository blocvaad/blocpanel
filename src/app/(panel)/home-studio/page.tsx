import { requirePageSession } from "@/lib/pageAuth";
import { can } from "@/lib/permissions";
import HomeStudioClient from "@/components/homeStudio/HomeStudioClient";
export const dynamic = "force-dynamic";

// "מסך הבית" (bloc HOME-STUDIO-1, החלטות 684–694): כרטיסים של bloc במסך הבית של הדיירים והוועד — שש צורות, בכל מקום בין השורות,
// לפי קהל ותאריכים, עם תצוגה חיה, "שליחה לטלפון שלי", ספירות (בלי מי) ו"מה חדש ב-bloc". שום דבר לא מוצג עד שמפרסמים; הוועד וחברת
// הניהול לא מנהלים כלום. הדף הוא מעטפת בלבד — הנתונים מ-/api/home-studio, כדי שלא יישמרו בעותק של הדף שה-service worker שומר.
export default async function HomeStudioPage() {
  const session = await requirePageSession("home_studio.read");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "1100px" }}>
      <HomeStudioClient canManage={can(session.role, "home_studio.manage")} myEmail={session.email} />
    </div>
  );
}
