// ─── Opus Clip webhook handler ────────────────────────────────────────────────
// Opus Clip sends a POST when a repurposing job completes or fails.
// Configure webhook URL in Opus Clip dashboard: <APP_URL>/api/webhooks/opusclip

import { NextResponse } from "next/server";
import { db } from "@contentforge/db";
import { createLogger } from "@/lib/integrations/shared/logger";

const logger = createLogger("opusclip-webhook");

interface OpusClipWebhookPayload {
  event: "job.completed" | "job.failed";
  jobId: string;
  webhook_metadata?: { videoId?: string };
  clips?: Array<{
    id: string;
    download_url: string;
    duration: number;
    thumbnail_url?: string;
    score?: number;
  }>;
  error?: string;
}

export async function POST(req: Request) {
  const signature = req.headers.get("x-opus-signature");
  if (process.env.OPUS_CLIP_WEBHOOK_SECRET) {
    // TODO: verify HMAC-SHA256 signature against raw body
    if (!signature) {
      logger.warn("Missing Opus Clip signature header");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let payload: OpusClipWebhookPayload;
  try {
    payload = (await req.json()) as OpusClipWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  logger.info("Received webhook", { event: payload.event, jobId: payload.jobId });

  const videoId = payload.webhook_metadata?.videoId;
  if (!videoId) {
    return NextResponse.json({ received: true });
  }

  try {
    if (payload.event === "job.completed" && payload.clips?.length) {
      // Upsert each clip by opusClipId (not @unique in schema, use findFirst pattern)
      await db.$transaction(
        payload.clips.map((clip) => {
          const clipData = {
            opusClipId: clip.id,
            videoId,
            title: `Clip ${clip.id.slice(0, 8)}`,
            storagePath: clip.download_url,
            duration: Math.round(clip.duration),
            status: "READY" as const,
            metadata: {
              thumbnailUrl: clip.thumbnail_url ?? null,
              score: clip.score ?? null,
              downloadUrl: clip.download_url,
            },
          };
          return db.repurposedClip.upsert({
            where: { id: `opus-${clip.id}` },
            create: { id: `opus-${clip.id}`, ...clipData },
            update: { storagePath: clip.download_url, status: "READY", metadata: clipData.metadata },
          });
        })
      );
      logger.info("Clips stored", { videoId, count: payload.clips.length });

      // Mark the source video as ready (metadata tracks repurposing outcome)
      await db.uploadedVideo.update({
        where: { id: videoId },
        data: {
          status: "READY",
          metadata: { repurposingStatus: "COMPLETE", repurposedAt: new Date().toISOString() },
        },
      });
    }

    if (payload.event === "job.failed") {
      await db.uploadedVideo.update({
        where: { id: videoId },
        data: {
          metadata: { repurposingStatus: "FAILED", repurposingError: payload.error ?? "Unknown" },
        },
      });
      logger.error("Repurposing failed", { videoId, error: payload.error });
    }
  } catch (err) {
    logger.error("DB update failed", { err });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
