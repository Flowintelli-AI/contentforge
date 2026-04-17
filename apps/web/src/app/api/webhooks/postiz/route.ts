// ─── Postiz webhook handler ───────────────────────────────────────────────────
// Postiz sends a POST when a post is published or fails.
// Configure webhook URL in Postiz admin: <APP_URL>/api/webhooks/postiz

import { NextResponse } from "next/server";
import { db } from "@contentforge/db";
import { createLogger } from "@/lib/integrations/shared/logger";

const logger = createLogger("postiz-webhook");

interface PostizWebhookPayload {
  event: "post.published" | "post.failed";
  postId: string;
  /** External ID we passed when creating the post — maps to calendarItemId */
  externalId?: string;
  publishedAt?: string;
  postUrl?: string;
  errorMessage?: string;
}

export async function POST(req: Request) {
  const signature = req.headers.get("x-postiz-signature");
  if (process.env.POSTIZ_WEBHOOK_SECRET && signature !== process.env.POSTIZ_WEBHOOK_SECRET) {
    logger.warn("Invalid webhook signature");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: PostizWebhookPayload;
  try {
    payload = (await req.json()) as PostizWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  logger.info("Received webhook", { event: payload.event, postId: payload.postId });

  const calendarItemId = payload.externalId;
  if (!calendarItemId) {
    return NextResponse.json({ received: true });
  }

  try {
    if (payload.event === "post.published") {
      // Update the ContentCalendarItem status
      await db.contentCalendarItem.update({
        where: { id: calendarItemId },
        data: { status: "PUBLISHED" },
      });

      // Update the linked ScheduledPost (publishedAt and postUrl live there)
      await db.scheduledPost.updateMany({
        where: { calendarItemId },
        data: {
          status: "PUBLISHED",
          postizPostId: payload.postId,
          publishedAt: payload.publishedAt ? new Date(payload.publishedAt) : new Date(),
          postUrl: payload.postUrl ?? null,
        },
      });

      logger.info("Calendar item marked PUBLISHED", { calendarItemId });
    }

    if (payload.event === "post.failed") {
      await db.contentCalendarItem.update({
        where: { id: calendarItemId },
        data: { status: "FAILED" },
      });

      await db.scheduledPost.updateMany({
        where: { calendarItemId },
        data: {
          status: "FAILED",
          failureReason: payload.errorMessage ?? "Unknown error",
        },
      });

      logger.error("Post failed", { calendarItemId, errorMessage: payload.errorMessage });
    }
  } catch (err) {
    logger.error("DB update failed", { err });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
