import { NextResponse, type NextRequest } from "next/server";

// Cookie-only gate. Proxy cannot query the database and misses server actions,
// so requireAdmin() does the real check.
export function proxy(request: NextRequest) {
  const hasSession =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");
  if (!hasSession) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
