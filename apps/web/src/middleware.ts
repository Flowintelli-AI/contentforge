import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/api/cron(.*)",
  "/api/feeds(.*)",
  "/api/test(.*)",
  "/api/db(.*)",
  "/api/health(.*)",
  "/pricing",
]);

const clerkHandler = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      const signInUrl = new URL("/sign-in", req.url);
      return NextResponse.redirect(signInUrl);
    }
  }
});

export default async function middleware(req: NextRequest) {
  // Bypass Clerk entirely for cron and feed routes — they use their own auth
  if (
    req.nextUrl.pathname.startsWith("/api/cron/") ||
    req.nextUrl.pathname.startsWith("/api/feeds/") ||
    req.nextUrl.pathname.startsWith("/api/debug/")
  ) {
    return NextResponse.next();
  }

  // If Clerk keys are not configured, allow all requests through
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    return NextResponse.next();
  }
  return clerkHandler(req, {} as never);
}

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
