import { db } from "@contentforge/db";
import { NextResponse } from "next/server";
import { reapService } from "@/lib/integrations/reap/service";
import { heyGenService } from "@/lib/integrations/heygen/service";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

/** Re-host a Shotstack stage video on R2 so external services (HeyGen) can download it. */
async function reuploadFaceVideoToR2(shotstackUrl: string, clipId: string): Promise<string> {
  const res = await fetch(shotstackUrl);
  if (!res.ok) throw new Error(`Failed to download Shotstack video (${res.status}): ${shotstackUrl}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const key = `heygen-face/${clipId}.mp4`;
  await r2.send(new PutObjectCommand({
    Bucket: "contentforge-videos",
    Key: key,
    Body: buffer,
    ContentType: "video/mp4",
  }));
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

interface ShotstackCallback {
  id: string;
  status: "queued" | "fetching" | "rendering" | "saving" | "done" | "failed";
  url?: string;
  error?: string;
}

export async function POST(req: Request) {
  let body: ShotstackCallback;
  try {
    body = (await req.json()) as ShotstackCallback;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const clipId = searchParams.get("clipId");
  const purpose = searchParams.get("purpose"); // "heygen" for AI clip trim jobs

  // Prefer direct clipId lookup (new pipeline); fall back to opusClipId scan (legacy)
  const clip = clipId
    ? await db.repurposedClip.findUnique({ where: { id: clipId } })
    : await db.repurposedClip.findFirst({ where: { opusClipId: body.id } });

  if (!clip) {
    console.log(`[shotstack] no clip for renderId=${body.id} clipId=${clipId ?? "n/a"}`);
    return NextResponse.json({ ok: true });
  }

  if (body.status === "failed") {
    console.error(`[shotstack] render failed clip=${clip.id}:`, body.error ?? "unknown");
    await db.repurposedClip.update({ where: { id: clip.id }, data: { status: "FAILED" } });
    return NextResponse.json({ ok: true });
  }

  if (body.status !== "done" || !body.url) {
    return NextResponse.json({ ok: true }); // still in progress
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://contentforge-web-nine.vercel.app";

  // ── AI clip path: trimmed clip → HeyGen lipsync ───────────────────────────
  if (purpose === "heygen") {
    const audioUrl = searchParams.get("audioUrl");
    if (!audioUrl) {
      console.error(`[shotstack] purpose=heygen but no audioUrl param for clip=${clip.id}`);
      await db.repurposedClip.update({ where: { id: clip.id }, data: { status: "FAILED" } });
      return NextResponse.json({ ok: true });
    }

    const decodedAudioUrl = decodeURIComponent(audioUrl);
    console.log(`[shotstack] AI trim done clip=${clip.id} → submitting to HeyGen`);
    console.log(`[shotstack] trimmedVideo=${body.url} audio=${decodedAudioUrl}`);

    try {
      // Re-upload to R2 so HeyGen can download it (Shotstack stage S3 is not externally accessible)
      console.log(`[shotstack] re-uploading face video to R2 clip=${clip.id}`);
      const publicFaceUrl = await reuploadFaceVideoToR2(body.url, clip.id);
      console.log(`[shotstack] face video at R2: ${publicFaceUrl}`);

      const { lipsyncId } = await heyGenService.submitLipsync({
        faceVideoUrl: publicFaceUrl,
        audioUrl: decodedAudioUrl,
        title: clip.title ?? undefined,
        callbackUrl: `${appUrl}/api/webhooks/heygen`,
      });

      await db.repurposedClip.update({
        where: { id: clip.id },
        data: { opusClipId: `heygen:${lipsyncId}` },
      });
      console.log(`[shotstack] clip=${clip.id} → HeyGen lipsyncId=${lipsyncId}`);
    } catch (err) {
      console.error(`[shotstack] HeyGen submission error clip=${clip.id}:`, err);
      await db.repurposedClip.update({ where: { id: clip.id }, data: { status: "FAILED" } });
    }

    return NextResponse.json({ ok: true });
  }

  // ── Type 1 clip path: Shotstack final render → Reap captions ─────────────
  console.log(`[shotstack] render done clip=${clip.id} url=${body.url}`);

  try {
    const projectId = await reapService.submitCaptions(body.url, {
      captionsPreset: "karaoke-bold",
      enableEmojis: true,
      enableHighlights: true,
      language: "en",
      webhookUrl: `${appUrl}/api/webhooks/reap?clipId=${clip.id}`,
    });

    await db.repurposedClip.update({
      where: { id: clip.id },
      data: { opusClipId: `reap:${projectId}` },
    });
    console.log(`[shotstack] clip=${clip.id} → Reap projectId=${projectId}`);
  } catch (err) {
    console.error(`[shotstack] Reap submission error clip=${clip.id}:`, err);
    await db.repurposedClip.update({ where: { id: clip.id }, data: { status: "FAILED" } });
  }

  return NextResponse.json({ ok: true });
}