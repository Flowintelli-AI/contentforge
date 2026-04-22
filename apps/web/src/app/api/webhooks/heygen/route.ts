// ─── HeyGen webhook handler ───────────────────────────────────────────────────
// Handles both avatar video jobs (AiVideoJob) and lipsync jobs (RepurposedClip).
// Configure callback URL in HeyGen account settings: <APP_URL>/api/webhooks/heygen

import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { db } from "@contentforge/db";
import { remotionRenderService } from "@/lib/integrations/remotion/service";
import { createLogger } from "@/lib/integrations/shared/logger";

export const maxDuration = 300;

const logger = createLogger("heygen-webhook");

// HeyGen sends slightly different shapes for avatar vs lipsync — keep broad.
// v3 lipsync webhook uses event_type="video_translate.*" and event_data.video_translate_id
// v2 avatar videos use event_data.video_id
interface HeyGenWebhookPayload {
  event_type: string;
  event_data: {
    video_id?: string;
    id?: string;
    video_translate_id?: string; // v3 lipsync uses this field
    url?: string;
    video_url?: string; // v3 lipsync success URL field
    thumbnail_url?: string;
    duration?: number;
    error?: string;
    message?: string; // v3 lipsync error message field
  };
}

export async function POST(req: Request) {
  const signature = req.headers.get("x-heygen-signature");
  if (process.env.HEYGEN_WEBHOOK_SECRET) {
    if (!signature) {
      logger.warn("Missing HeyGen signature header");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // TODO: verify HMAC-SHA256(HEYGEN_WEBHOOK_SECRET, rawBody) === signature
  }

  let payload: HeyGenWebhookPayload;
  try {
    payload = (await req.json()) as HeyGenWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event_type, event_data } = payload;
  logger.info("Received webhook", { event_type, videoId: event_data.video_id, raw: JSON.stringify(payload) });

  const isSuccess = event_type.includes("success") || event_type.includes("complete");
  const isFailed = event_type.includes("fail") || event_type.includes("error");
  // Support all HeyGen event shapes: video_translate_id (v3 lipsync), id, or video_id
  const video_id = event_data.video_translate_id ?? event_data.id ?? event_data.video_id ?? "";
  const videoUrl = event_data.video_url ?? event_data.url;
  const errorMsg = event_data.message ?? event_data.error;

  // ── Lipsync clip (RepurposedClip.opusClipId = "heygen:<video_id>") ─────────
  // Check this BEFORE the AiVideoJob lookup so lipsync clips take priority.
  const lipsyncClip = await db.repurposedClip.findFirst({
    where: { opusClipId: `heygen:${video_id}` },
  });

  if (lipsyncClip) {
    if (isFailed) {
      logger.error("Lipsync job failed", { clipId: lipsyncClip.id, error: errorMsg });
      await db.repurposedClip.update({ where: { id: lipsyncClip.id }, data: { status: "FAILED" } });
      return NextResponse.json({ received: true });
    }

    if (isSuccess) {
      if (!videoUrl) {
        // Log the raw payload — HeyGen may use a different field name for lipsync
        logger.warn("Lipsync success but no URL in event_data — check raw payload above", {
          clipId: lipsyncClip.id,
        });
        return NextResponse.json({ received: true });
      }

      const wordTimings =
        ((lipsyncClip.metadata as Record<string, unknown> | null)?.wordTimings as
          Array<{ word: string; start: number; end: number }>) ?? [];
      const durationSec = lipsyncClip.duration ?? 30;

      logger.info("Lipsync complete, queuing Remotion render", {
        clipId: lipsyncClip.id,
        wordTimings: wordTimings.length,
        durationSec,
        videoUrl,
      });

      waitUntil(
        remotionRenderService
          .renderClipAndWait({
            segments: [{ type: 'heygen', src: videoUrl, startFrom: 0, duration: durationSec, offsetFrom: 0 }],
            wordTimings,
            captionStyle: 'KARAOKE',
            totalDurationSec: durationSec,
          })
          .then(async (outputUrl) => {
            await db.repurposedClip.update({
              where: { id: lipsyncClip.id },
              data: { storagePath: outputUrl, status: 'READY' },
            });
            logger.info("Type 2 clip ready", { clipId: lipsyncClip.id, outputUrl });
          })
          .catch(async (err) => {
            logger.error("Remotion render failed for lipsync clip", {
              clipId: lipsyncClip.id,
              error: err instanceof Error ? err.message : String(err),
            });
            await db.repurposedClip.update({
              where: { id: lipsyncClip.id },
              data: { status: 'FAILED' },
            });
          })
      );

      return NextResponse.json({ received: true });
    }

    // Other event types (e.g. progress) — ack and continue
    return NextResponse.json({ received: true });
  }

  // ── Avatar video job (legacy AiVideoJob) ────────────────────────────────────
  try {
    if (isSuccess) {
      await db.aiVideoJob.updateMany({
        where: { heygenJobId: video_id },
        data: {
          status: "completed",
          outputUrl: videoUrl ?? null,
          metadata: {
            thumbnailUrl: event_data.thumbnail_url ?? null,
            duration: event_data.duration ?? null,
          },
        },
      });
      logger.info("Avatar video completed", { videoId: video_id });
    }

    if (isFailed) {
      await db.aiVideoJob.updateMany({
        where: { heygenJobId: video_id },
        data: {
          status: "failed",
          errorMsg: errorMsg ?? "Unknown error",
        },
      });
      logger.error("Avatar video failed", { videoId: video_id, error: errorMsg });
    }
  } catch (err) {
    logger.error("DB update failed", { err });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
