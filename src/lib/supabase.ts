import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || url.includes("YOUR_PROJECT")) {
  throw new Error("❌ NEXT_PUBLIC_SUPABASE_URL לא מוגדר ב-.env.local");
}
if (!key || key.includes("your_service")) {
  throw new Error("❌ SUPABASE_SERVICE_ROLE_KEY לא מוגדר ב-.env.local");
}

export const adminClient = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});
