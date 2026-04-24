import { auth } from "@clerk/nextjs/server";
import { db } from "@contentforge/db";
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { detectVideoRotation, cloneVoiceFromVideo } from "@/lib/video-processing";

export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
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
        speech_models: ["best"],
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

    // Voice clone: if creator already has a cloned voice, reuse it immediately.
    // Otherwise fire-and-forget via waitUntil so HTTP response is returned quickly.
    const elevenKey = process.env.ELEVENLABS_API_KEY;
    if (elevenKey) {
      if (profile.voiceCloneId && !video.clonedVoiceId) {
        // Reuse existing creator voice — instant, no new clone needed
        await db.uploadedVideo.update({
          where: { id: video.id },
          data: { clonedVoiceId: profile.voiceCloneId },
        });
        console.log(`[clone-voice] Reusing creator voice ${profile.voiceCloneId} for video=${video.id}`);
      } else if (!video.clonedVoiceId && !profile.voiceCloneId) {
        waitUntil(performVoiceClone(video.id, video.storagePath, elevenKey, profile.id));
      }
    }

    // Detect rotation once and cache it — both pipelines will read the cached value.
    // Most videos are already correctly oriented; this is a lightweight background check.
    const existingMeta = (video.metadata ?? {}) as Record<string, unknown>;
    if (existingMeta.videoRotation === undefined) {
      waitUntil(detectAndCacheRotation(video.id, video.storagePath, existingMeta));
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

async function detectAndCacheRotation(
  videoId: string,
  storagePath: string,
  existingMeta: Record<string, unknown>,
) {
  try {
    const rotationDeg = await detectVideoRotation(storagePath);
    await db.uploadedVideo.update({
      where: { id: videoId },
      data: { metadata: { ...existingMeta, videoRotation: rotationDeg } },
    });
    if (rotationDeg !== 0) {
      console.log(`[process] video=${videoId} rotation cached: ${rotationDeg}°`);
    }
  } catch (err) {
    console.warn(`[process] rotation detection failed for video=${videoId} (non-fatal):`, err);
  }
}
async function performVoiceClone(
  videoId: string,
  storagePath: string,
  _elevenKey: string,  // kept for call-site compatibility; cloneVoiceFromVideo reads env directly
  creatorId: string,
) {
  try {
    console.log(`[clone-voice] Starting ffmpeg voice clone for video=${videoId}`);
    const voice_id = await cloneVoiceFromVideo(storagePath, videoId);
    // Save to both the video AND the creator profile so future videos skip cloning
    await Promise.all([
      db.uploadedVideo.update({
        where: { id: videoId },
        data: { clonedVoiceId: voice_id },
      }),
      db.creatorProfile.update({
        where: { id: creatorId },
        data: { voiceCloneId: voice_id },
      }),
    ]);
    console.log(`[clone-voice] ✅ Cloned voice_id=${voice_id} for video=${videoId} creator=${creatorId}`);
  } catch (err) {
    console.warn(`[clone-voice] Failed (non-fatal) for video=${videoId}:`, err);
  }
}
