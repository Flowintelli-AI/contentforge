// ─── Reap.video webhook handler ──────────────────────────────────────────────
// Reap requires ALL responses (validation + events) to return status 200
// with a completely empty body. Do NOT use NextResponse.json here.

import { db } from "@contentforge/db";

export const maxDuration = 60;

const empty200 = () => new Response(null, { status: 200 });

// Reap validates the URL with a GET request — must return empty 200
export async function GET() {
  return empty200();
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
  const clipId = searchParams.get("clipId");

  let payload: ReapPayload;
  try {
    payload = (await req.json()) as ReapPayload;
  } catch {
    return empty200(); // still return 200 empty — Reap may retry on non-200
  }

  console.log(`[reap] webhook clipId=${clipId ?? "-"} raw=`, JSON.stringify(payload));

  const status    = getStr(payload, "status", "event", "state");
  const projectId = getStr(payload, "projectId", "id", "project_id");
  const errorMsg  = getStr(payload, "error", "message", "errorMessage");

  const isFailed    = status === "failed" || status === "error" || status === "project.failed";
  const isCompleted = status === "completed" || status === "done" || status === "success" || status === "project.completed";

  const clip = clipId
    ? await db.repurposedClip.findUnique({ where: { id: clipId } })
    : projectId
    ? await db.repurposedClip.findFirst({ where: { opusClipId: `reap:${projectId}` } })
    : null;

  if (!clip) {
    console.warn(`[reap] no clip found clipId=${clipId ?? "-"} projectId=${projectId ?? "-"}`);
    return empty200();
  }

  if (isFailed) {
    console.error(`[reap] project failed clip=${clip.id}:`, errorMsg ?? "unknown");
    await db.repurposedClip.update({ where: { id: clip.id }, data: { status: "FAILED" } });
    return empty200();
  }

  if (!isCompleted) {
    console.log(`[reap] clip=${clip.id} status=${status} — ignoring`);
    return empty200();
  }

  const captionedVideoUrl = getStr(
    payload,
    "directUrl", "downloadUrl", "videoUrl", "video_url", "url", "outputUrl"
  );

  if (!captionedVideoUrl) {
    console.error(`[reap] clip=${clip.id} completed but no video URL in payload`);
    return empty200();
  }

  const previewUrl = getStr(payload, "previewUrl", "thumbnailUrl", "thumbnail_url");

  await db.repurposedClip.update({
    where: { id: clip.id },
    data: { storagePath: captionedVideoUrl, thumbnailUrl: previewUrl ?? null, status: "READY" },
  });
  console.log(`[reap] clip=${clip.id} READY → ${captionedVideoUrl}`);

  const stillProcessing = await db.repurposedClip.count({
    where: { videoId: clip.videoId, status: "PROCESSING" },
  });
  if (stillProcessing === 0) {
    await db.uploadedVideo.update({ where: { id: clip.videoId }, data: { status: "READY" } });
    console.log(`[reap] all clips done → video=${clip.videoId} READY`);
  }

  return empty200();
}
