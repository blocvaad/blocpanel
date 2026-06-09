import { apiRatelimit } from "@/lib/ratelimit";
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.PANEL_JWT_SECRET ?? "fallback_dev_secret_change_in_prod"
);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  // Check cookie
  const token = req.cookies.get("blocpanel_session")?.value;

  if (!token) {
    console.log("[middleware] no token, path:", pathname);
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const result = await jwtVerify(token, SECRET);
    console.log("[middleware] valid token for:", result.payload.email);
    return NextResponse.next();
  } catch (e) {
    console.log("[middleware] invalid token:", e);
    const r = NextResponse.redirect(new URL("/login", req.url));
    r.cookies.delete("blocpanel_session");
    return r;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
