/**
 * Cron: publish scheduled Instagram Reels at their scheduled time.
 *
 * Runs every 5 minutes (see vercel.json).
 * Finds all ContentCalendarItems with status=SCHEDULED, platform=INSTAGRAM,
 * scheduledFor <= now, whose ScheduledPost has no postizPostId yet (not yet sent to IG).
 * For each: creates the Reels container, waits for FINISHED, then publishes.
 */

import { NextResponse } from "next/server";
import { db } from "@contentforge/db";
import { publishContainer, getContainerStatus } from "@/lib/integrations/instagram/publisher";
import { createLogger } from "@/lib/integrations/shared/logger";

export const maxDuration = 300;

const logger = createLogger("cron-instagram-publish");

/** Poll container status up to maxAttempts×delayMs milliseconds. */
async function waitForContainer(
  accessToken: string,
  containerId: string,
  maxAttempts = 12,
  delayMs = 5000
): Promise<"FINISHED" | "ERROR" | "TIMEOUT"> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    const { statusCode } = await getContainerStatus(accessToken, containerId);
    if (statusCode === "FINISHED") return "FINISHED";
    if (statusCode === "ERROR" || statusCode === "EXPIRED") return "ERROR";
  }
  return "TIMEOUT";
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Find SCHEDULED items due now that haven't been sent to Instagram yet
  const duePosts = await db.contentCalendarItem.findMany({
    where: {
      platform: "INSTAGRAM",
      status: "SCHEDULED",
      scheduledFor: { lte: now },
      scheduledPost: { postizPostId: null },
    },
    include: {
      scheduledPost: true,
      clip: { select: { storagePath: true, title: true, postCopy: true, hashtags: true } },
    },
    take: 10,
  });

  logger.info("Cron scan", { dueCount: duePosts.length });

  if (duePosts.length === 0) {
    return NextResponse.json({ ok: true, published: 0, results: [] });
  }

  const results = await Promise.allSettled(
    duePosts.map(async (item) => {
      if (!item.scheduledPost) throw new Error("No scheduledPost record");
      if (!item.clip?.storagePath) throw new Error("Clip has no video URL");

      // Get Instagram connection for this creator
      const igConn = await db.igConnection.findUnique({
        where: { creatorId: item.creatorId },
      });
      if (!igConn) throw new Error("No Instagram connection");

      const caption = [
        item.clip.postCopy ?? item.title,
        item.clip.hashtags?.length
          ? "\n\n" + item.clip.hashtags.map((h: string) => (h.startsWith("#") ? h : `#${h}`)).join(" ")
          : "",
      ]
        .join("")
        .trim();

      // Create container for immediate publish (no native scheduling — more reliable)
      const params = new URLSearchParams({
        media_type: "REELS",
        video_url: item.clip.storagePath,
        caption,
        access_token: igConn.accessToken,
      });
      const createRes = await fetch(`https://graph.instagram.com/${igConn.igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const createData = (await createRes.json()) as { id?: string; error?: { message: string } };
      if (!createData.id) {
        throw new Error(createData.error?.message ?? `Container create HTTP ${createRes.status}`);
      }
      const containerId = createData.id;

      // Wait for video processing
      const containerResult = await waitForContainer(igConn.accessToken, containerId);
      if (containerResult !== "FINISHED") {
        throw new Error(`Container did not reach FINISHED status: ${containerResult}`);
      }

      // Publish
      const mediaId = await publishContainer(igConn.accessToken, igConn.igUserId, containerId);

      // Update DB
      await db.scheduledPost.update({
        where: { id: item.scheduledPost.id },
        data: { postizPostId: mediaId, status: "PUBLISHED", publishedAt: new Date() },
      });
      await db.contentCalendarItem.update({
        where: { id: item.id },
        data: { status: "PUBLISHED" },
      });

      logger.info("Published", { calendarItemId: item.id, mediaId });
      return { calendarItemId: item.id, mediaId };
    })
  );

  const summary = results.map((r) =>
    r.status === "fulfilled" ? { ok: true, ...r.value } : { ok: false, error: String(r.reason) }
  );

  const published = summary.filter((r) => r.ok).length;
  return NextResponse.json({ ok: true, published, results: summary });
}
