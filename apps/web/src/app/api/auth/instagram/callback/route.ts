/**
 * GET /api/auth/instagram/callback
 *
 * Meta redirects here after the user approves the consent screen.
 * Exchanges the auth code for a long-lived token, fetches profile info,
 * and upserts the IgConnection record for this creator.
 */
import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@contentforge/db";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const SETTINGS_URL = `${APP_URL}/dashboard/settings`;

function redirect(param: string) {
  return NextResponse.redirect(`${SETTINGS_URL}?${param}`);
}

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.redirect(`${APP_URL}/sign-in`);

  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const oauthError = params.get("error");

  // User denied access
  if (oauthError) return redirect("error=ig_denied");

  // Verify CSRF state
  const cookieStore = cookies();
  const savedState = cookieStore.get("ig_oauth_state")?.value;
  cookieStore.delete("ig_oauth_state");

  if (!state || state !== savedState) return redirect("error=ig_state_mismatch");
  if (!code) return redirect("error=ig_no_code");

  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;

  if (!appId || !appSecret) return redirect("error=ig_not_configured");

  try {
    const redirectUri = `${APP_URL}/api/auth/instagram/callback`;

    // Step 1 — Short-lived token
    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      user_id?: number;
      error_message?: string;
    };

    if (!tokenData.access_token) {
      throw new Error(tokenData.error_message ?? "Token exchange failed");
    }

    // Step 2 — Long-lived token (60 days)
    const longTokenRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${tokenData.access_token}`
    );
    const longTokenData = (await longTokenRes.json()) as {
      access_token?: string;
      expires_in?: number;
    };

    const longToken = longTokenData.access_token ?? tokenData.access_token;
    const expiresInSeconds = longTokenData.expires_in ?? 5_184_000; // 60 days fallback

    // Step 3 — Fetch Instagram profile
    const profileRes = await fetch(
      `https://graph.instagram.com/me?fields=id,username&access_token=${longToken}`
    );
    const profile = (await profileRes.json()) as {
      id?: string;
      username?: string;
    };

    if (!profile.id) throw new Error("Could not fetch Instagram profile");

    // Step 4 — Resolve Clerk user → CreatorProfile → upsert IgConnection
    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) throw new Error("User not found");

    const creatorProfile = await db.creatorProfile.findUnique({
      where: { userId: user.id },
    });
    if (!creatorProfile) throw new Error("Creator profile not found");

    const tokenExpiry = new Date(Date.now() + expiresInSeconds * 1000);

    await db.igConnection.upsert({
      where: { creatorId: creatorProfile.id },
      create: {
        creatorId: creatorProfile.id,
        igUserId: profile.id,
        igUsername: profile.username ?? profile.id,
        accessToken: longToken,
        tokenExpiry,
      },
      update: {
        igUserId: profile.id,
        igUsername: profile.username ?? profile.id,
        accessToken: longToken,
        tokenExpiry,
      },
    });

    return redirect("instagram=connected");
  } catch (err) {
    console.error("[instagram/oauth] callback error:", err);
    return redirect("error=ig_oauth_failed");
  }
}
