import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/w/", "/onboarding", "/desk", "/account"];

function hasSession(req: NextRequest) {
  return (
    req.cookies.has("better-auth.session_token") || req.cookies.has("__Secure-better-auth.session_token")
  );
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const protectedPath = PROTECTED.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`)));
  if (protectedPath && !hasSession(req)) {
    const url = new URL("/sign-in", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/w/:path*", "/onboarding/:path*", "/desk/:path*", "/account/:path*"],
};
