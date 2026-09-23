import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";

// Everything except the login page, the cron endpoint and the app's public files needs the dashboard password.
export function proxy(req: NextRequest) {
  if (isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!login|api/tick|_next/static|_next/image|favicon.ico|icon.svg|icons/|manifest.webmanifest|sw.js|offline.html).*)"],
};
