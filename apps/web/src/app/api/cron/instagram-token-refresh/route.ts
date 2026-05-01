/**
 * Cron: refresh Instagram long-lived tokens before they expire.
 *
 * Runs daily at 03:00 UTC (see vercel.json).
 * Finds all IgConnection records expiring within 15 days and refreshes them.
 * Instagram long-lived tokens last 60 days; must be refreshed while still valid.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@contentforge/db";
import { refreshLongLivedToken } from "@/lib/integrations/instagram/service";
import { createLogger } from "@/lib/integrations/shared/logger";

export const maxDuration = 60;

const logger = createLogger("cron-token-refresh");

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const threshold = new Date();
  threshold.setDate(threshold.getDate() + 15); // refresh if expiring within 15 days

  const expiring = await db.igConnection.findMany({
    where: { tokenExpiry: { lte: threshold } },
    select: { id: true, creatorId: true, igUsername: true, accessToken: true },
  });

  logger.info("Token refresh check", { expiring: expiring.length, threshold });

  const results = { refreshed: 0, failed: 0, errors: [] as string[] };

  for (const conn of expiring) {
    try {
      const newToken = await refreshLongLivedToken(conn.accessToken);
      const newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + 60);

      await db.igConnection.update({
        where: { id: conn.id },
        data: { accessToken: newToken, tokenExpiry: newExpiry },
      });

      // Also keep socialAccount in sync
      await db.socialAccount.updateMany({
        where: { creatorId: conn.creatorId, platform: "INSTAGRAM" },
        data: { accessToken: newToken, tokenExpiry: newExpiry },
      });

      logger.info("Token refreshed", { igUsername: conn.igUsername, newExpiry });
      results.refreshed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Token refresh failed", { igUsername: conn.igUsername, error: msg });
      results.errors.push(`${conn.igUsername}: ${msg}`);
      results.failed++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
