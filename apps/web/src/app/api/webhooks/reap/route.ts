// ─── Reap.video webhook handler ──────────────────────────────────────────────
// Fires when a Reap captions project completes or fails.
// Configure in Reap dashboard → Settings → Webhooks → set global URL to:
//   <APP_URL>/api/webhooks/reap
// Per-project webhookUrl (passed in create-captions) is also supported if Reap allows it.

import { db } from "@contentforge/db";
import { NextResponse } from "next/server";

export const maxDuration = 60;

// Reap sends a GET request to validate the webhook — must return empty 200
export async function GET() {
  return new Response(null, { status: 200 });
}

type ReapPayload = Record<string, unknown>;

function getStr(obj: ReapPayload, ...keys: string[]): string | undefined {
  for (const k of keys) {
    if (typeof obj[k] === "string" && obj[k]) return obj[k] as string;
  }
  return undefined;
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const clipId = searchParams.get("clipId"); // set when webhookUrl includes ?clipId=

  let payload: ReapPayload;
  try {
    payload = (await req.json()) as ReapPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log(
    `[reap] webhook clipId=${clipId ?? "-"} raw=`,
    JSON.stringify(payload)
  );

  const status = getStr(payload, "status", "event", "state");
  const projectId = getStr(payload, "projectId", "id", "project_id");
  const errorMsg = getStr(payload, "error", "message", "errorMessage");

  const isFailed =
    status === "failed" ||
    status === "error" ||
    status === "project.failed";
  const isCompleted =
    status === "completed" ||
    status === "done" ||
    status === "success" ||
    status === "project.completed";

  // Resolve clip — prefer ?clipId= param, fall back to projectId in opusClipId
  const clip = clipId
    ? await db.repurposedClip.findUnique({ where: { id: clipId } })
    : projectId
    ? await db.repurposedClip.findFirst({
        where: { opusClipId: `reap:${projectId}` },
      })
    : null;

  if (!clip) {
    console.warn(`[reap] no clip found for clipId=${clipId ?? "-"} projectId=${projectId ?? "-"}`);
    return NextResponse.json({ ok: true });
  }

  if (isFailed) {
    console.error(`[reap] project failed clip=${clip.id}:`, errorMsg ?? "unknown");
    await db.repurposedClip.update({
      where: { id: clip.id },
      data: { status: "FAILED" },
    });
    return NextResponse.json({ ok: true });
  }

  if (!isCompleted) {
    console.log(`[reap] clip=${clip.id} status=${status} — ignoring`);
    return NextResponse.json({ ok: true });
  }

  // Extract the final captioned video URL
  const captionedVideoUrl = getStr(
    payload,
    "directUrl",
    "downloadUrl",
    "videoUrl",
    "video_url",
    "url",
    "outputUrl"
  );

  if (!captionedVideoUrl) {
    console.error(`[reap] clip=${clip.id} completed but no video URL in payload`);
    return NextResponse.json({ ok: true });
  }

  const previewUrl = getStr(payload, "previewUrl", "thumbnailUrl", "thumbnail_url");

  await db.repurposedClip.update({
    where: { id: clip.id },
    data: {
      storagePath: captionedVideoUrl,
      thumbnailUrl: previewUrl ?? null,
      status: "READY",
    },
  });
  console.log(`[reap] clip=${clip.id} READY → ${captionedVideoUrl}`);

  // Mark parent video READY when all its clips are done
  const stillProcessing = await db.repurposedClip.count({
    where: { videoId: clip.videoId, status: "PROCESSING" },
  });
  if (stillProcessing === 0) {
    await db.uploadedVideo.update({
      where: { id: clip.videoId },
      data: { status: "READY" },
    });
    console.log(`[reap] all clips done → video=${clip.videoId} READY`);
  }

  return NextResponse.json({ ok: true });
}
