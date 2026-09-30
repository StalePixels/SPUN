import { NextResponse, type NextRequest } from "next/server";

function markdownPath(pathname: string): string {
  const page = pathname.slice(0, -".md".length);
  return page === "/index" ? "/md" : `/md${page}`;
}

// The admin gate is cookie-only. Proxy cannot query the database and misses
// server actions, so requireAdmin() does the real check.
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.endsWith(".md")) {
    const url = request.nextUrl.clone();
    url.pathname = markdownPath(url.pathname);
    return NextResponse.rewrite(url);
  }
  const hasSession =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");
  if (!hasSession) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/(.*\\.md)"],
};
