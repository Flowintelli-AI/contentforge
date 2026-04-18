import { auth } from "@clerk/nextjs/server";
import { db } from "@contentforge/db";
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";

export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const profile = await db.creatorProfile.findUnique({ where: { userId: user.id } });
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const video = await db.uploadedVideo.findFirst({
    where: { id: params.id, creatorId: profile.id },
  });
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  if (video.status === "PROCESSING") {
    return NextResponse.json({ error: "Video is already processing" }, { status: 409 });
  }

  await db.uploadedVideo.update({
    where: { id: video.id },
    data: { status: "PROCESSING" },
  });

  try {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY is not set");

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://contentforge-web-nine.vercel.app";
    const webhookUrl = `${appUrl}/api/webhooks/assemblyai?videoId=${video.id}`;

    console.log(`[process] submitting transcription for video=${video.id} storagePath=${video.storagePath}`);

    // Inline AssemblyAI call — no speech_models param (fixes cached build issue)
    const res = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: {
        authorization: apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        audio_url: video.storagePath,
        speech_models: ["universal-2"],
        punctuate: true,
        format_text: true,
        webhook_url: webhookUrl,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`AssemblyAI submit error ${res.status}: ${err}`);
    }

    const { id: transcriptId } = (await res.json()) as { id: string };
    console.log(`[process] ✅ transcription submitted id=${transcriptId} for video=${video.id}`);

    // Voice clone: fire-and-forget via waitUntil so the HTTP response is returned
    // immediately (~2s) while the clone runs in the background (up to maxDuration).
    // AssemblyAI takes 3-5 min to complete, so the clone finishes before the webhook.
    const elevenKey = process.env.ELEVENLABS_API_KEY;
    if (elevenKey && !video.clonedVoiceId) {
      waitUntil(performVoiceClone(video.id, video.storagePath, elevenKey));
    }

    return NextResponse.json({ success: true, message: "10 clips are rendering — check back in a few minutes!" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    console.error(`[process] ❌ error for video=${video.id}: ${message}`);
    await db.uploadedVideo.update({
      where: { id: video.id },
      data: { status: "READY" },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Runs in background via waitUntil — downloads first 20 MB of video and
// submits to ElevenLabs IVC. Non-fatal: any failure is logged, webhook falls
// back to ELEVENLABS_VOICE_ID env var or Rachel.
async function performVoiceClone(
  videoId: string,
  storagePath: string,
  elevenKey: string
) {
  try {
    const SAMPLE_BYTES = 20 * 1024 * 1024; // 20 MB

    const headRes = await fetch(storagePath, { method: "HEAD" });
    const totalBytes = parseInt(headRes.headers.get("content-length") ?? "0", 10);
    const useRange = totalBytes > SAMPLE_BYTES;

    const sampleRes = await fetch(storagePath, {
      headers: useRange ? { Range: `bytes=0-${SAMPLE_BYTES - 1}` } : {},
    });

    const sampleBuffer = await sampleRes.arrayBuffer();
    console.log(
      `[clone-voice] Sample: ${(sampleBuffer.byteLength / 1024 / 1024).toFixed(1)} MB` +
      ` of ${totalBytes ? (totalBytes / 1024 / 1024).toFixed(0) : "?"} MB (range=${useRange})`
    );

    const form = new FormData();
    form.append("name", `Speaker-${videoId.slice(-8)}`);
    form.append("description", "Auto-cloned via ContentForge");
    form.append("remove_background_noise", "true");
    // Always .mp4 — ElevenLabs rejects .mpeg4 and similar extensions
    form.append("files", new Blob([sampleBuffer], { type: "video/mp4" }), "sample.mp4");

    const cloneRes = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": elevenKey },
      body: form,
    });

    if (cloneRes.ok) {
      const { voice_id } = (await cloneRes.json()) as { voice_id: string };
      await db.uploadedVideo.update({
        where: { id: videoId },
        data: { clonedVoiceId: voice_id },
      });
      console.log(`[clone-voice] ✅ Cloned voice_id=${voice_id} for video=${videoId}`);
    } else {
      const errText = await cloneRes.text();
      console.warn(`[clone-voice] ElevenLabs rejected sample for video=${videoId}: ${errText}`);
    }
  } catch (err) {
    console.warn(`[clone-voice] Failed (non-fatal) for video=${videoId}:`, err);
  }
}
