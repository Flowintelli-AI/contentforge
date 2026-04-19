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
  const clipId = searchParams.get("clipId");   // hybrid pipeline: per-clip webhook
  const videoId = searchParams.get("videoId"); // legacy: per-video webhook

  const payload = (await req.json()) as SubmagicWebhookPayload;
  console.log(
    `[submagic] webhook clipId=${clipId ?? "-"} videoId=${videoId ?? "-"} status=${payload.status} projectId=${payload.projectId}`
  );

  if (payload.status === "failed") {
    console.error(`[submagic] failed:`, payload.error ?? "unknown");
    if (clipId) {
      await db.repurposedClip.update({ where: { id: clipId }, data: { status: "FAILED" } });
    } else if (videoId) {
      await db.uploadedVideo.update({ where: { id: videoId }, data: { status: "READY" } });
    }
    return NextResponse.json({ ok: true });
  }

  if (payload.status !== "completed" || !payload.clips?.length) {
    return NextResponse.json({ ok: true });
  }

  // --- Hybrid pipeline: per-clip webhook ---
  if (clipId) {
    // Submagic may return multiple sub-clips from our already-trimmed segment.
    // Take only the first (highest-scored) result.
    const best = payload.clips[0];
    if (!best) return NextResponse.json({ ok: true });

    await db.repurposedClip.update({
      where: { id: clipId },
      data: {
        storagePath: best.videoUrl,
        thumbnailUrl: best.thumbnailUrl ?? null,
        opusClipId: best.clipId,
        status: "READY",
      },
    });
    console.log(`[submagic] clip=${clipId} READY → ${best.videoUrl}`);

    // Mark parent video READY when all its clips are no longer PROCESSING
    const clip = await db.repurposedClip.findUnique({ where: { id: clipId } });
    if (clip) {
      const stillProcessing = await db.repurposedClip.count({
        where: { videoId: clip.videoId, status: "PROCESSING" },
      });
      if (stillProcessing === 0) {
        await db.uploadedVideo.update({
          where: { id: clip.videoId },
          data: { status: "READY" },
        });
        console.log(`[submagic] all clips done → video=${clip.videoId} READY`);
      }
    }

    return NextResponse.json({ ok: true });
  }

  // --- Legacy: full-video webhook (backwards compat) ---
  if (videoId) {
    const existingClips = await db.repurposedClip.count({ where: { videoId } });
    if (existingClips > 0) {
      console.log(`[submagic] video=${videoId} already has ${existingClips} clips, skipping`);
      return NextResponse.json({ ok: true });
    }

    const results = await Promise.allSettled(
      payload.clips.map((clip, idx) =>
        db.repurposedClip.create({
          data: {
            videoId,
            title: clip.title ?? `Clip ${idx + 1}`,
            storagePath: clip.videoUrl,
            thumbnailUrl: clip.thumbnailUrl ?? null,
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
    console.log(
      `[submagic] legacy video=${videoId}: ${succeeded}/${payload.clips.length} clips created`
    );
    await db.uploadedVideo.update({ where: { id: videoId }, data: { status: "READY" } });
    return NextResponse.json({ ok: true, clipsCreated: succeeded });
  }

  return NextResponse.json({ error: "Missing clipId or videoId" }, { status: 400 });
}
