// ─── HeyGen webhook handler ───────────────────────────────────────────────────
// Handles both avatar video jobs (AiVideoJob) and lipsync jobs (RepurposedClip).
// Configure callback URL in HeyGen account settings: <APP_URL>/api/webhooks/heygen

import { NextResponse } from "next/server";
import { db } from "@contentforge/db";
import { reapService } from "@/lib/integrations/reap/service";
import { createLogger } from "@/lib/integrations/shared/logger";

const logger = createLogger("heygen-webhook");

// HeyGen sends slightly different shapes for avatar vs lipsync — keep broad.
// v3 lipsync uses event_data.id; v2 avatar videos use event_data.video_id.
interface HeyGenWebhookPayload {
  event_type: string;
  event_data: {
    video_id?: string;
    id?: string; // v3 lipsync uses this field
    url?: string;
    thumbnail_url?: string;
    duration?: number;
    error?: string;
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
  // Support both v3 (id) and v2 (video_id) event shapes
  const video_id = event_data.id ?? event_data.video_id ?? "";
  const { url: videoUrl, error: errorMsg } = event_data;

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

      logger.info("Lipsync complete, submitting to Reap captions", {
        clipId: lipsyncClip.id,
        videoUrl,
      });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      try {
        const projectId = await reapService.submitCaptions(videoUrl, {
          captionsPreset: "system_beasty",
          enableEmojis: true,
          enableHighlights: true,
          language: "en",
          webhookUrl: appUrl
            ? `${appUrl}/api/webhooks/reap?clipId=${lipsyncClip.id}`
            : undefined,
        });

        await db.repurposedClip.update({
          where: { id: lipsyncClip.id },
          data: { opusClipId: `reap:${projectId}` },
        });

        logger.info("Submitted lipsync clip to Reap", { clipId: lipsyncClip.id, projectId });
      } catch (err) {
        logger.error("Reap submission failed for lipsync clip", { clipId: lipsyncClip.id, err });
        await db.repurposedClip.update({
          where: { id: lipsyncClip.id },
          data: { status: "FAILED" },
        });
      }

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
