import { auth } from "@clerk/nextjs/server";
import { db } from "@contentforge/db";
import { NextResponse } from "next/server";

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

    // Voice clone: download only the first 20 MB of the video and submit to
    // ElevenLabs IVC. AssemblyAI takes 3-5 min to complete, so the clone will
    // finish before the webhook fires. 20 MB covers ≈30-90 s of audio depending
    // on the video bitrate — enough for a recognisable clone.
    // Works best with "faststart" MP4s (moov at the start). Falls back silently
    // to the ELEVENLABS_VOICE_ID env var (or Rachel) if parsing fails.
    const elevenKey = process.env.ELEVENLABS_API_KEY;
    if (elevenKey && !video.clonedVoiceId) {
      try {
        const SAMPLE_BYTES = 20 * 1024 * 1024; // 20 MB

        // Check total file size first
        const headRes = await fetch(video.storagePath, { method: "HEAD" });
        const totalBytes = parseInt(
          headRes.headers.get("content-length") ?? "0",
          10
        );

        const useRange = totalBytes > SAMPLE_BYTES;
        const sampleRes = await fetch(video.storagePath, {
          headers: useRange
            ? { Range: `bytes=0-${SAMPLE_BYTES - 1}` }
            : {},
        });

        const sampleBuffer = await sampleRes.arrayBuffer();
        const sampleMB = (sampleBuffer.byteLength / 1024 / 1024).toFixed(1);
        const totalMB = totalBytes ? (totalBytes / 1024 / 1024).toFixed(0) : "?";
        console.log(
          `[clone-voice] Sample: ${sampleMB} MB of ${totalMB} MB (range=${useRange})`
        );

        const form = new FormData();
        form.append("name", `Speaker-${video.id.slice(-8)}`);
        form.append("description", "Auto-cloned via ContentForge");
        form.append("remove_background_noise", "true");
        // Always use .mp4 extension; ElevenLabs rejects .mpeg4 and similar
        form.append(
          "files",
          new Blob([sampleBuffer], { type: "video/mp4" }),
          "sample.mp4"
        );

        const cloneRes = await fetch("https://api.elevenlabs.io/v1/voices/add", {
          method: "POST",
          headers: { "xi-api-key": elevenKey },
          body: form,
        });

        if (cloneRes.ok) {
          const { voice_id } = (await cloneRes.json()) as { voice_id: string };
          await db.uploadedVideo.update({
            where: { id: video.id },
            data: { clonedVoiceId: voice_id },
          });
          console.log(`[clone-voice] ✅ Cloned: ${voice_id}`);
        } else {
          const errText = await cloneRes.text();
          console.warn(`[clone-voice] ElevenLabs rejected sample: ${errText}`);
        }
      } catch (cloneErr) {
        // Non-fatal — webhook will fall back to ELEVENLABS_VOICE_ID or Rachel
        console.warn(`[clone-voice] Failed (non-fatal):`, cloneErr);
      }
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
