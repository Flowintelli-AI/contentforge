import { db } from "@contentforge/db";
import { NextResponse } from "next/server";

export const maxDuration = 60;

// Loose types — Submagic API field names may vary by plan/version
type SubmagicPayload = Record<string, unknown>;

function getStr(obj: SubmagicPayload, ...keys: string[]): string | undefined {
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

  // Submagic sends the project object directly — directUrl is the captioned video.
  // magicClips array exists only when "magic clips" feature is used (we use it for captioning only).
  const directVideoUrl = getStr(payload, "directUrl", "downloadUrl", "videoUrl", "video_url", "url");

  // --- Hybrid pipeline: per-clip webhook ---
  if (clipId) {
    if (!directVideoUrl) {
      console.error(`[submagic] clip=${clipId} completed but no directUrl in payload`);
      return NextResponse.json({ ok: true });
    }

    const projectRef = getStr(payload, "id", "projectId");
    const previewUrl = getStr(payload, "previewUrl", "thumbnailUrl");

    await db.repurposedClip.update({
      where: { id: clipId },
      data: {
        storagePath: directVideoUrl,
        thumbnailUrl: previewUrl ?? null,
        opusClipId: projectRef ?? null,
        status: "READY",
      },
    });
    console.log(`[submagic] clip=${clipId} READY → ${directVideoUrl}`);

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
  // Submagic doesn't return a clips array — just mark the video READY.
  if (videoId) {
    if (directVideoUrl) {
      console.log(`[submagic] legacy video=${videoId} completed → ${directVideoUrl}`);
    } else {
      console.warn(`[submagic] legacy video=${videoId} completed but no directUrl`);
    }
    await db.uploadedVideo.update({ where: { id: videoId }, data: { status: "READY" } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Missing clipId or videoId" }, { status: 400 });
}
