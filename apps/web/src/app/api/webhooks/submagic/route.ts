import { db } from "@contentforge/db";
import { NextResponse } from "next/server";

export const maxDuration = 60;

interface SubmagicClip {
  clipId: string;
  title: string;
  start: number;
  end: number;
  duration: number;
  videoUrl: string;
  thumbnailUrl?: string;
  captionsUrl?: string;
}

interface SubmagicWebhookPayload {
  projectId: string;
  status: "completed" | "failed" | "processing";
  clips?: SubmagicClip[];
  error?: string;
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");

  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  const payload = (await req.json()) as SubmagicWebhookPayload;
  console.log(
    `[submagic] webhook for video ${videoId}: status=${payload.status}, projectId=${payload.projectId}`
  );

  if (payload.status === "failed") {
    console.error(
      `[submagic] processing failed for video ${videoId}:`,
      payload.error ?? "unknown error"
    );
    await db.uploadedVideo.update({
      where: { id: videoId },
      data: { status: "READY" },
    });
    return NextResponse.json({ ok: true });
  }

  if (payload.status !== "completed" || !payload.clips?.length) {
    return NextResponse.json({ ok: true });
  }

  // Idempotency: skip if clips already exist for this video
  const existingClips = await db.repurposedClip.count({ where: { videoId } });
  if (existingClips > 0) {
    console.log(
      `[submagic] video ${videoId} already has ${existingClips} clips, skipping duplicate webhook`
    );
    return NextResponse.json({ ok: true });
  }

  const results = await Promise.allSettled(
    payload.clips.map((clip, idx) =>
      db.repurposedClip.create({
        data: {
          videoId,
          title: clip.title ?? `Clip ${idx + 1}`,
          storagePath: clip.videoUrl,
          thumbnailUrl: clip.thumbnailUrl,
          duration: Math.round(clip.duration),
          startTime: clip.start,
          endTime: clip.end,
          opusClipId: clip.clipId,
          status: "READY",
          hashtags: [],
        },
      })
    )
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results
    .filter((r) => r.status === "rejected")
    .map((r) => (r as PromiseRejectedResult).reason);

  if (failed.length > 0) {
    console.warn(`[submagic] ${failed.length} clip(s) failed to save:`, failed);
  }

  console.log(
    `[submagic] video ${videoId}: ${succeeded}/${payload.clips.length} clips created`
  );

  await db.uploadedVideo.update({
    where: { id: videoId },
    data: { status: "READY" },
  });

  return NextResponse.json({ ok: true, clipsCreated: succeeded });
}