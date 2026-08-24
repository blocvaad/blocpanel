import { apiRatelimit } from "@/lib/ratelimit";
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Fail closed in production (audit P0.3): no silent dev-secret in prod.
function getSecret(): Uint8Array {
  const s = process.env.PANEL_JWT_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("PANEL_JWT_SECRET is required in production");
    }
    return new TextEncoder().encode("dev_only_insecure_secret_do_not_use_in_prod");
  }
  return new TextEncoder().encode(s);
}
const SECRET = getSecret();

// Endpoints reachable with only a pre-MFA session: the OTP challenge itself
// and logout. Everything else under /api requires a full (MFA) session.
const PRE_MFA_ALLOWED = ["/api/auth/2fa", "/api/auth/logout"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/icon-") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/login")
  ) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");

  if (isApi) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    const { success } = await apiRatelimit.limit(ip);
    if (!success) {
      return NextResponse.json({ error: "יותר מדי בקשות" }, { status: 429 });
    }
  }

  const token = req.cookies.get("blocpanel_session")?.value;
  if (!token) {
    return isApi
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const { payload } = await jwtVerify(token, SECRET);
    const authLevel = (payload as { auth_level?: string }).auth_level ?? "pre_mfa";

    // ── MFA enforcement (audit P0.2) ──
    // A pre-MFA token may only reach the OTP challenge + logout. Any other
    // API route, and any page, requires a completed-MFA session. This closes
    // the bypass globally so routes still on getSession() can't be reached
    // with a password-only (pre_mfa) token.
    if (authLevel !== "mfa") {
      const preMfaOk = PRE_MFA_ALLOWED.some(p => pathname.startsWith(p));
      if (!preMfaOk) {
        return isApi
          ? NextResponse.json({ error: "נדרש אימות דו-שלבי" }, { status: 401 })
          : NextResponse.redirect(new URL("/login", req.url));
      }
    }

    return NextResponse.next();
  } catch {
    const res = isApi
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete("blocpanel_session");
    return res;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
