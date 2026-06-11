import { apiRatelimit } from "@/lib/ratelimit";
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.PANEL_JWT_SECRET ?? "fallback_dev_secret_change_in_prod"
);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/icon-") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/login")
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    const { success } = await apiRatelimit.limit(ip);
    if (!success) {
      return NextResponse.json({ error: "יותר מדי בקשות" }, { status: 429 });
    }
  }

  const token = req.cookies.get("blocpanel_session")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    await jwtVerify(token, SECRET);
    return NextResponse.next();
  } catch {
    const r = NextResponse.redirect(new URL("/login", req.url));
    r.cookies.delete("blocpanel_session");
    return r;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
