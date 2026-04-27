/**
 * HeyGen lipsync recovery utility.
 *
 * Polls HeyGen for a clip that is stuck in PROCESSING status and triggers
 * the Remotion render + DB update if HeyGen has already completed the job.
 *
 * Used by:
 *  - /api/cron/heygen-recover   (scheduled every 5 min)
 *  - /api/test/pipeline         (manual stage=heygen-recover)
 */

import { waitUntil } from "@vercel/functions";
import { db } from "@contentforge/db";
import { remotionRenderService } from "@/lib/integrations/remotion/service";
import { thumbnailService } from "@/lib/integrations/thumbnail/service";
import { createLogger } from "@/lib/integrations/shared/logger";

const logger = createLogger("heygen-recover");

export type RecoveryResult =
  | { action: "still-running"; lipsyncId: string }
  | { action: "failed"; lipsyncId: string; reason: string }
  | { action: "render-queued"; lipsyncId: string; videoUrl: string; durationSec: number; isHybrid: boolean }
  | { action: "already-done" }
  | { action: "not-a-heygen-clip"; opusClipId: string | null }
  | { action: "error"; error: string };

/**
 * Polls HeyGen for `clipId` and triggers Remotion render if HeyGen is done.
 * Safe to call multiple times (idempotent — skips clips that are already READY/FAILED).
 */
export async function recoverHeygenClip(clipId: string): Promise<RecoveryResult> {
  const clip = await db.repurposedClip.findUnique({ where: { id: clipId } });
  if (!clip) return { action: "error", error: "Clip not found" };
  if (clip.status === "READY" || clip.status === "FAILED") return { action: "already-done" };

  const lipsyncRef = clip.opusClipId ?? "";
  if (!lipsyncRef.startsWith("heygen:")) {
    return { action: "not-a-heygen-clip", opusClipId: lipsyncRef || null };
  }
  const lipsyncId = lipsyncRef.replace("heygen:", "");

  const apiKey = process.env.HEYGEN_API_KEY ?? "";
  if (!apiKey) return { action: "error", error: "HEYGEN_API_KEY not set" };

  let heyData: { data: { status: string; video_url?: string; failure_message?: string } };
  try {
    const res = await fetch(`https://api.heygen.com/v3/lipsyncs/${lipsyncId}`, {
      headers: { "X-Api-Key": apiKey },
    });
    heyData = await res.json() as typeof heyData;
  } catch (err) {
    return { action: "error", error: `HeyGen API call failed: ${String(err)}` };
  }

  const { status: heyStatus, video_url: videoUrl, failure_message: failMsg } = heyData.data ?? {};

  if (heyStatus === "failed" || heyStatus === "error") {
    await db.repurposedClip.update({ where: { id: clipId }, data: { status: "FAILED" } });
    logger.warn("Marked clip FAILED after HeyGen failure", { clipId, lipsyncId, failMsg });
    return { action: "failed", lipsyncId, reason: failMsg ?? heyStatus };
  }

  if (heyStatus !== "completed" && heyStatus !== "success") {
    return { action: "still-running", lipsyncId };
  }

  if (!videoUrl) {
    return { action: "error", error: "HeyGen completed but returned no video_url" };
  }

  // ── Build render params (mirrors the webhook handler logic exactly) ──────────
  const meta = (clip.metadata as Record<string, unknown> | null) ?? {};
  const wordTimings = (meta.wordTimings as Array<{ word: string; start: number; end: number }>) ?? [];
  const durationFromWords = wordTimings.length > 0 ? wordTimings[wordTimings.length - 1].end + 0.5 : null;
  const durationSec = durationFromWords ?? clip.duration ?? 30;
  const reelScriptData = (clip.reelScript as Record<string, unknown> | null) ?? {};
  const isHybrid = reelScriptData.isHybridWithOriginal === true;

  // Persist the HeyGen video URL so we never have to re-render if the render fails
  await db.repurposedClip.update({
    where: { id: clipId },
    data: { metadata: { ...meta, heygenVideoUrl: videoUrl } },
  });

  if (isHybrid) {
    const hookWordTimings = (meta.hookWordTimings as Array<{ word: string; start: number; end: number }>) ?? [];
    const originalWordTimings = (reelScriptData.originalWordTimings as Array<{ word: string; start: number; end: number }>) ?? [];
    const originalStart = (reelScriptData.originalStart as number) ?? 0;
    const originalEnd = (reelScriptData.originalEnd as number) ?? 0;
    const originalSrc = reelScriptData.originalSrc as string;
    const videoRotation = (reelScriptData.videoRotation as number | undefined) ?? 0;
    const hookDurationSec = hookWordTimings.length > 0 ? hookWordTimings[hookWordTimings.length - 1].end + 0.5 : 3;
    const originalDurationSec = Math.max(1, originalEnd - originalStart);
    const totalDurationSec = hookDurationSec + originalDurationSec;
    const offsetOriginalTimings = originalWordTimings.map((w) => ({
      ...w,
      start: parseFloat((w.start + hookDurationSec).toFixed(3)),
      end: parseFloat((w.end + hookDurationSec).toFixed(3)),
    }));
    const combinedWordTimings = [...hookWordTimings, ...offsetOriginalTimings];

    waitUntil(
      remotionRenderService.renderClipAndWait({
        segments: [
          { type: "heygen", src: videoUrl, startFrom: 0, duration: hookDurationSec, offsetFrom: 0 },
          { type: "original", src: originalSrc, startFrom: originalStart, duration: originalDurationSec, offsetFrom: hookDurationSec, rotation: videoRotation },
        ],
        wordTimings: combinedWordTimings,
        captionStyle: "KARAOKE",
        totalDurationSec,
      }).then(async (outputUrl) => {
        const caption = (reelScriptData.caption as string | undefined) ?? null;
        const hashtags = Array.isArray(reelScriptData.hashtags) ? (reelScriptData.hashtags as string[]) : [];
        await db.repurposedClip.update({ where: { id: clipId }, data: { storagePath: outputUrl, status: "READY", postCopy: caption, hashtags } });
        thumbnailService.extractAndSave(clipId, outputUrl).catch((e) => logger.error("Thumbnail failed (hybrid)", { clipId, error: String(e) }));
        logger.info("Hybrid clip recovered and ready", { clipId, outputUrl });
      }).catch(async (err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        await db.repurposedClip.update({ where: { id: clipId }, data: { status: "FAILED", metadata: { ...meta, heygenVideoUrl: videoUrl, renderError: errMsg } } });
        logger.error("Remotion render failed during recovery (hybrid)", { clipId, error: errMsg });
      })
    );

    return { action: "render-queued", lipsyncId, videoUrl, durationSec: totalDurationSec, isHybrid: true };
  }

  // Standard Type 2
  waitUntil(
    remotionRenderService.renderClipAndWait({
      segments: [{ type: "heygen", src: videoUrl, startFrom: 0, duration: durationSec, offsetFrom: 0 }],
      wordTimings,
      captionStyle: "KARAOKE",
      totalDurationSec: durationSec,
    }).then(async (outputUrl) => {
      const caption = (reelScriptData.caption as string | undefined) ?? null;
      const hashtags = Array.isArray(reelScriptData.hashtags) ? (reelScriptData.hashtags as string[]) : [];
      await db.repurposedClip.update({ where: { id: clipId }, data: { storagePath: outputUrl, status: "READY", postCopy: caption, hashtags } });
      thumbnailService.extractAndSave(clipId, outputUrl).catch((e) => logger.error("Thumbnail failed", { clipId, error: String(e) }));
      logger.info("Type 2 clip recovered and ready", { clipId, outputUrl });
    }).catch(async (err) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      await db.repurposedClip.update({ where: { id: clipId }, data: { status: "FAILED", metadata: { ...meta, heygenVideoUrl: videoUrl, renderError: errMsg } } });
      logger.error("Remotion render failed during recovery", { clipId, error: errMsg });
    })
  );

  return { action: "render-queued", lipsyncId, videoUrl, durationSec, isHybrid: false };
}
