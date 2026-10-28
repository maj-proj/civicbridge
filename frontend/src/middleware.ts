import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protected routes check
  const isProtectedRoute = pathname.startsWith("/dashboard");

  if (isProtectedRoute) {
    // Check if user has an anonymous session cookie
    const anonSession = request.cookies.get("civic_anon_session");
    // Check if Clerk session token exists in cookies
    const clerkSession =
      request.cookies.get("__session") ||
      request.cookies.get("__client_uat");

    // If neither session exists, redirect to sign-in / home page
    if (!anonSession && !clerkSession) {
      const signInUrl = new URL("/", request.url);
      signInUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/reports/:path*",
  ],
};
