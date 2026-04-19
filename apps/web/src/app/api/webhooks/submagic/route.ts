import { db } from "@contentforge/db";
import { NextResponse } from "next/server";

export const maxDuration = 60;

// Loose types — Submagic API field names may vary by plan/version
type SubmagicPayload = Record<string, unknown>;
type SubmagicClipRaw = Record<string, unknown>;

function getStr(obj: SubmagicPayload | SubmagicClipRaw, ...keys: string[]): string | undefined {
  for (const k of keys) {
    if (typeof obj[k] === "string" && obj[k]) return obj[k] as string;
  }
  return undefined;
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const clipId = searchParams.get("clipId");   // hybrid pipeline: per-clip webhook
  const videoId = searchParams.get("videoId"); // legacy: per-video webhook

  const payload = (await req.json()) as SubmagicPayload;
  // Log full raw payload so we can see the actual structure
  console.log(
    `[submagic] webhook clipId=${clipId ?? "-"} videoId=${videoId ?? "-"} raw=`,
    JSON.stringify(payload)
  );

  const status = getStr(payload, "status") as string | undefined;
  const errorMsg = getStr(payload, "error", "message", "errorMessage");

  if (status === "failed") {
    console.error(`[submagic] failed:`, errorMsg ?? "unknown");
    if (clipId) {
      await db.repurposedClip.update({ where: { id: clipId }, data: { status: "FAILED" } });
    } else if (videoId) {
      await db.uploadedVideo.update({ where: { id: videoId }, data: { status: "READY" } });
    }
    return NextResponse.json({ ok: true });
  }

  if (status !== "completed") {
    console.log(`[submagic] status=${status}, ignoring`);
    return NextResponse.json({ ok: true });
  }

  // Clips array — try common field names
  const rawClips = (
    Array.isArray(payload.clips) ? payload.clips :
    Array.isArray(payload.results) ? payload.results :
    Array.isArray(payload.data) ? payload.data :
    []
  ) as SubmagicClipRaw[];

  if (!rawClips.length) {
    console.warn(`[submagic] status=completed but no clips array found in payload`);
    return NextResponse.json({ ok: true });
  }

  // --- Hybrid pipeline: per-clip webhook ---
  if (clipId) {
    const best = rawClips[0];
    const videoUrl   = getStr(best, "videoUrl", "video_url", "url", "mp4Url", "outputUrl");
    const thumbUrl   = getStr(best, "thumbnailUrl", "thumbnail_url", "thumbnail", "thumb");
    const clipRefId  = getStr(best, "clipId", "clip_id", "id", "projectId");

    if (!videoUrl) {
      console.error(`[submagic] clip=${clipId} completed but no videoUrl in:`, JSON.stringify(best));
      return NextResponse.json({ ok: true });
    }

    await db.repurposedClip.update({
      where: { id: clipId },
      data: {
        storagePath: videoUrl,
        thumbnailUrl: thumbUrl ?? null,
        opusClipId: clipRefId ?? null,
        status: "READY",
      },
    });
    console.log(`[submagic] clip=${clipId} READY → ${videoUrl}`);

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
      rawClips.map((clip, idx) => {
        const vUrl = getStr(clip, "videoUrl", "video_url", "url", "mp4Url", "outputUrl");
        const tUrl = getStr(clip, "thumbnailUrl", "thumbnail_url", "thumbnail");
        const cId  = getStr(clip, "clipId", "clip_id", "id");
        const title = typeof clip.title === "string" ? clip.title : `Clip ${idx + 1}`;
        const dur   = typeof clip.duration === "number" ? clip.duration : 0;
        const start = typeof clip.start === "number" ? clip.start : 0;
        const end   = typeof clip.end === "number" ? clip.end : 0;
        if (!vUrl) return Promise.reject(new Error(`No videoUrl for clip ${idx}`));
        return db.repurposedClip.create({
          data: {
            videoId: videoId!,
            title,
            storagePath: vUrl,
            thumbnailUrl: tUrl ?? null,
            duration: Math.round(dur),
            startTime: start,
            endTime: end,
            opusClipId: cId ?? null,
            status: "READY",
            hashtags: [],
          },
        });
      })
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
