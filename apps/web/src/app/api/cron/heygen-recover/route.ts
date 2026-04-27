/**
 * Cron: recover HeyGen lipsync clips stuck in PROCESSING.
 *
 * Runs every 5 minutes (see vercel.json).
 * Finds all RepurposedClips with status=PROCESSING and opusClipId starting with
 * "heygen:" that were last updated more than 5 minutes ago, polls HeyGen for each,
 * and triggers the Remotion render + DB update if HeyGen has completed.
 *
 * Vercel calls this with Bearer ${CRON_SECRET} in the Authorization header.
 */

import { NextResponse } from "next/server";
import { db } from "@contentforge/db";
import { recoverHeygenClip } from "@/lib/integrations/heygen/recover";
import { createLogger } from "@/lib/integrations/shared/logger";

export const maxDuration = 300;

const logger = createLogger("cron-heygen-recover");

export async function GET(req: Request) {
  // Verify Vercel cron secret (also allow manual calls from dashboard)
  const auth = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  // Find all PROCESSING HeyGen lipsync clips that haven't been updated in >5 min
  const stuckClips = await db.repurposedClip.findMany({
    where: {
      status: "PROCESSING",
      opusClipId: { startsWith: "heygen:" },
      updatedAt: { lt: fiveMinutesAgo },
    },
    select: { id: true, opusClipId: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
    take: 20, // cap to avoid timeout
  });

  logger.info("Cron scan complete", { stuckCount: stuckClips.length });

  if (stuckClips.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, results: [] });
  }

  const results = await Promise.allSettled(
    stuckClips.map(async (clip) => {
      const result = await recoverHeygenClip(clip.id);
      logger.info("Recovery result", { clipId: clip.id, ...result });
      return { clipId: clip.id, lipsyncId: clip.opusClipId, stuckSince: clip.updatedAt, result };
    })
  );

  const summary = results.map((r) =>
    r.status === "fulfilled" ? r.value : { error: String(r.reason) }
  );

  return NextResponse.json({ ok: true, checked: stuckClips.length, results: summary });
}
