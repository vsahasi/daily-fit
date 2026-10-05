import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = [
  "/sign-in",
  "/api/auth",
  "/api/cron",
  "/api/health",
  "/api/location",
  "/api/look",
  "/sw.js",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

function isPublic(pathname: string) {
  return publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function readSessionUserId(request: NextRequest) {
  const value = request.cookies.get("df_session")?.value;
  if (!value) return null;
  const [userId, expRaw] = value.split(".");
  if (!userId || !expRaw) return null;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return userId;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const userId = readSessionUserId(request);
  if (!userId) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
