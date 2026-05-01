import { NextResponse } from "next/server";
import { db } from "@contentforge/db";
import { scrapeHashtag, scrapeProfile } from "@/lib/integrations/apify/service";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MAX_PER_RUN = 5; // stay well within Vercel timeout + Apify limits
const STALE_HOURS = 23;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);
  let refreshed = 0;
  const errors: string[] = [];

  // ── Refresh stale niches ──────────────────────────────────────────────────
  const staleNiches = await db.inspireNiche.findMany({
    where: {
      OR: [{ lastFetched: null }, { lastFetched: { lt: staleThreshold } }],
    },
    take: MAX_PER_RUN,
    orderBy: { lastFetched: "asc" },
  });

  for (const niche of staleNiches) {
    if (refreshed >= MAX_PER_RUN) break;
    try {
      const posts = await scrapeHashtag(niche.hashtag, 20);
      await db.inspireNiche.update({
        where: { id: niche.id },
        data: { posts: posts as object[], lastFetched: new Date() },
      });
      refreshed++;
    } catch (e) {
      errors.push(`niche:${niche.hashtag} — ${(e as Error).message}`);
    }
  }

  // ── Refresh stale accounts ────────────────────────────────────────────────
  const staleAccounts = await db.inspireAccount.findMany({
    where: {
      OR: [{ lastFetched: null }, { lastFetched: { lt: staleThreshold } }],
    },
    take: Math.max(0, MAX_PER_RUN - refreshed),
    orderBy: { lastFetched: "asc" },
  });

  for (const account of staleAccounts) {
    if (refreshed >= MAX_PER_RUN) break;
    try {
      const posts = await scrapeProfile(account.username, 20);
      await db.inspireAccount.update({
        where: { id: account.id },
        data: { posts: posts as object[], lastFetched: new Date() },
      });
      refreshed++;
    } catch (e) {
      errors.push(`account:${account.username} — ${(e as Error).message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    refreshed,
    errors: errors.length ? errors : undefined,
  });
}
