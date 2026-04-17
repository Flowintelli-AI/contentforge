// ─── HeyGen webhook handler ───────────────────────────────────────────────────
// HeyGen sends a POST when a video generation job completes or fails.
// Configure callback URL in HeyGen account settings: <APP_URL>/api/webhooks/heygen

import { NextResponse } from "next/server";
import { db } from "@contentforge/db";
import { createLogger } from "@/lib/integrations/shared/logger";

const logger = createLogger("heygen-webhook");

interface HeyGenWebhookPayload {
  event_type: "avatar_video.success" | "avatar_video.fail";
  event_data: {
    video_id: string;
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
  logger.info("Received webhook", { event_type, videoId: event_data.video_id });

  try {
    // AiVideoJob tracks HeyGen generation jobs (heygenJobId maps to HeyGen's video_id)
    if (event_type === "avatar_video.success") {
      await db.aiVideoJob.updateMany({
        where: { heygenJobId: event_data.video_id },
        data: {
          status: "completed",
          outputUrl: event_data.url ?? null,
          metadata: {
            thumbnailUrl: event_data.thumbnail_url ?? null,
            duration: event_data.duration ?? null,
          },
        },
      });
      logger.info("Avatar video completed", { videoId: event_data.video_id });
    }

    if (event_type === "avatar_video.fail") {
      await db.aiVideoJob.updateMany({
        where: { heygenJobId: event_data.video_id },
        data: {
          status: "failed",
          errorMsg: event_data.error ?? "Unknown error",
        },
      });
      logger.error("Avatar video failed", { videoId: event_data.video_id, error: event_data.error });
    }
  } catch (err) {
    logger.error("DB update failed", { err });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
