import { NextResponse, type NextRequest } from "next/server";

// Keep in sync with SESSION_COOKIE in src/server/web.ts (proxy must not import server modules).
const SECURE = (process.env.APP_URL ?? "").startsWith("https://");
const SESSION_COOKIE = SECURE ? "__Host-ayten_session" : "ayten_session";
const ROOT_DOMAIN = (process.env.STOREFRONT_ROOT_DOMAIN ?? "localhost:3000").toLowerCase();
const PLATFORM_SUBDOMAINS = new Set(["www", "app", "admin", "api"]);
const PROTECTED = /^\/(dashboard|onboarding|account|admin)(\/|$)/;

/**
 * 1. Storefront routing: <slug>.<root domain>/path is rewritten to /s/<slug>/path.
 * 2. /s/* is not reachable directly on the app host (one canonical URL per store).
 * 3. Optimistic auth redirect for merchant pages. Pages still verify the
 *    session in the database — this only saves a render for signed-out users.
 */
export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const { pathname, search } = request.nextUrl;

  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    const sub = host.slice(0, -(ROOT_DOMAIN.length + 1));
    if (sub && !sub.includes(".") && !PLATFORM_SUBDOMAINS.has(sub)) {
      const url = request.nextUrl.clone();
      url.pathname = `/s/${sub}${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  if (pathname === "/s" || pathname.startsWith("/s/")) {
    return new NextResponse("Not Found", { status: 404 });
  }

  if (PROTECTED.test(pathname) && !request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
