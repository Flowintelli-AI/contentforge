/**
 * GET /api/auth/instagram
 *
 * Initiates the Instagram OAuth flow. Redirects the user to Meta's
 * consent screen. On approval, Meta calls back to /api/auth/instagram/callback.
 */
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function GET() {
  const { userId } = auth();

  if (!userId) {
    return NextResponse.redirect(`${APP_URL}/sign-in`);
  }

  const appId = process.env.INSTAGRAM_APP_ID;
  if (!appId) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?error=ig_not_configured`
    );
  }

  // CSRF state token — verified in callback
  const state = crypto.randomUUID();
  const cookieStore = cookies();
  cookieStore.set("ig_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 min window to complete OAuth
    path: "/",
  });

  const redirectUri = `${APP_URL}/api/auth/instagram/callback`;

  const scopes = [
    "instagram_business_basic",
    "instagram_business_manage_messages",
    "instagram_business_manage_comments",
  ].join(",");

  const oauthUrl = new URL("https://api.instagram.com/oauth/authorize");
  oauthUrl.searchParams.set("client_id", appId);
  oauthUrl.searchParams.set("redirect_uri", redirectUri);
  oauthUrl.searchParams.set("scope", scopes);
  oauthUrl.searchParams.set("response_type", "code");
  oauthUrl.searchParams.set("state", state);

  return NextResponse.redirect(oauthUrl.toString());
}
