/**
 * Cron: extract thumbnail candidates for READY clips that have none.
 *
 * Runs every 15 minutes (see vercel.json).
 * Catches clips where the fire-and-forget in the HeyGen webhook was terminated
 * before thumbnailService.extractAndSave completed.
 * Processes up to 5 clips per run to stay within the 300s function timeout.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@contentforge/db";
import { thumbnailService } from "@/lib/integrations/thumbnail/service";
import { createLogger } from "@/lib/integrations/shared/logger";

export const maxDuration = 300;

const logger = createLogger("cron-extract-thumbnails");

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find READY clips with no thumbnail candidates and a video URL to extract from
  const clips = await db.repurposedClip.findMany({
    where: {
      status: { in: ["READY", "DRAFT"] },
      thumbnailCandidates: { isEmpty: true },
      storagePath: { not: null },
    },
    select: { id: true, storagePath: true, title: true },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });

  logger.info("Thumbnail catch-up", { pending: clips.length });

  const results = { extracted: 0, failed: 0, errors: [] as string[] };

  for (const clip of clips) {
    try {
      await thumbnailService.extractAndSave(clip.id, clip.storagePath!);
      logger.info("Thumbnails extracted", { clipId: clip.id, title: clip.title });
      results.extracted++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Thumbnail extraction failed", { clipId: clip.id, error: msg });
      results.errors.push(`${clip.id}: ${msg}`);
      results.failed++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
