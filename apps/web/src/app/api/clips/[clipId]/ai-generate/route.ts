import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@contentforge/db";
import { elevenLabsService } from "@/lib/integrations/elevenlabs/service";
import { searchBroll } from "@/lib/pexels";

export const maxDuration = 300;

// Fallback voice when no clone exists (ElevenLabs "Rachel")
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = "contentforge-videos";

async function uploadAudioToR2(clipId: string, audioBase64: string): Promise<string> {
  const key = `narration/${clipId}.mp3`;
  const buffer = Buffer.from(audioBase64, "base64");

  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: "audio/mpeg",
    })
  );

  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

async function submitShotstackCompose(
  brollClips: { url: string; duration: number }[],
  audioUrl: string,
  totalDuration: number,
  callbackUrl: string
): Promise<string> {
  const shotstackBase =
    process.env.SHOTSTACK_ENV === "production"
      ? "https://api.shotstack.io/v1"
      : "https://api.shotstack.io/stage";

  // Build video track — loop/trim B-roll clips to fill totalDuration
  const videoTrackClips: object[] = [];
  let cursor = 0;
  let brollIndex = 0;

  while (cursor < totalDuration && brollClips.length > 0) {
    const clip = brollClips[brollIndex % brollClips.length];
    const remaining = totalDuration - cursor;
    const clipLen = Math.min(clip.duration, remaining);

    videoTrackClips.push({
      asset: { type: "video", src: clip.url },
      start: cursor,
      length: clipLen,
      fit: "crop",
    });

    cursor += clipLen;
    brollIndex++;
  }

  // Fallback: black background if no B-roll
  if (videoTrackClips.length === 0) {
    videoTrackClips.push({
      asset: { type: "color", color: "#111111" },
      start: 0,
      length: totalDuration,
    });
  }

  const body = {
    timeline: {
      tracks: [
        { clips: videoTrackClips }, // track 0 — video / B-roll
        {
          clips: [
            {
              asset: { type: "audio", src: audioUrl },
              start: 0,
              length: totalDuration,
            },
          ],
        }, // track 1 — narration audio
      ],
    },
    output: {
      format: "mp4",
      resolution: "sd",
      fps: 30,
      aspectRatio: "9:16",
    },
    callback: callbackUrl,
  };

  const res = await fetch(`${shotstackBase}/render`, {
    method: "POST",
    headers: {
      "x-api-key": process.env.SHOTSTACK_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Shotstack compose failed: ${err}`);
  }

  const data = (await res.json()) as { response: { id: string } };
  return data.response.id;
}

export async function POST(
  _req: Request,
  { params }: { params: { clipId: string } }
) {
  const { clipId } = params;

  // Load clip + video + creator
  const clip = await db.repurposedClip.findUnique({
    where: { id: clipId },
    include: {
      video: {
        include: { creator: true },
      },
    },
  });

  if (!clip) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }

  if (clip.status !== "GENERATING_AI") {
    return NextResponse.json({ error: "Clip is not in GENERATING_AI state" }, { status: 400 });
  }

  const reel = clip.reelScript as {
    suggestedScript: string;
    targetSec: number;
    minSec: number;
    maxSec: number;
    frameworkName: string;
  } | null;

  if (!reel?.suggestedScript) {
    await db.repurposedClip.update({ where: { id: clipId }, data: { status: "FAILED" } });
    return NextResponse.json({ error: "No suggestedScript on clip" }, { status: 400 });
  }

  const video = clip.video;
  const creator = video.creator;

  console.log(`[ai-generate] clipId=${clipId} framework=${clip.format} creator=${creator?.id}`);

  try {
    // ── Step 1: Resolve or create voice clone ──────────────────────────────────
    let voiceId = video.clonedVoiceId ?? creator?.voiceCloneId ?? null;

    if (!voiceId && creator?.consentAiVoice && video.storagePath) {
      console.log(`[ai-generate] cloning voice for creator=${creator.id}`);
      try {
        const cloneResult = await elevenLabsService.cloneVoice({
          name: `${creator.displayName} — ContentForge`,
          sampleUrls: [video.storagePath],
        });
        voiceId = cloneResult.voiceId;

        // Cache on video + creator profile
        await Promise.all([
          db.uploadedVideo.update({
            where: { id: video.id },
            data: { clonedVoiceId: voiceId },
          }),
          db.creatorProfile.update({
            where: { id: creator.id },
            data: { voiceCloneId: voiceId },
          }),
        ]);
        console.log(`[ai-generate] voice cloned voiceId=${voiceId}`);
      } catch (err) {
        console.warn("[ai-generate] voice clone failed, falling back to default voice:", err);
        voiceId = DEFAULT_VOICE_ID;
      }
    }

    if (!voiceId) {
      console.log("[ai-generate] no voice clone available, using default Rachel voice");
      voiceId = DEFAULT_VOICE_ID;
    }

    // ── Step 2: Generate TTS narration ────────────────────────────────────────
    console.log(`[ai-generate] generating TTS voiceId=${voiceId} words=${reel.suggestedScript.split(" ").length}`);
    const ttsResult = await elevenLabsService.generateSpeech({
      voiceId,
      text: reel.suggestedScript,
      scriptId: clipId,
      modelId: "eleven_turbo_v2_5",
    });

    // ── Step 3: Upload narration audio to R2 ─────────────────────────────────
    const audioUrl = await uploadAudioToR2(clipId, ttsResult.audioBase64);
    console.log(`[ai-generate] narration uploaded audioUrl=${audioUrl}`);

    // Estimate actual audio duration from word count (~2.3 words/sec)
    const wordCount = reel.suggestedScript.trim().split(/\s+/).length;
    const estimatedAudioSec = Math.ceil(wordCount / 2.3);
    // Clamp to framework range with 1s head-room
    const totalDuration = Math.min(
      Math.max(estimatedAudioSec, reel.minSec),
      reel.maxSec + 3
    );

    // ── Step 4: Fetch Pexels B-roll ───────────────────────────────────────────
    const brollQuery = `${clip.format?.replace(/_/g, " ")} ${video.title ?? "creator"}`.trim();
    const brollClips = await searchBroll(brollQuery, totalDuration);

    // ── Step 5: Submit Shotstack compose render ───────────────────────────────
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const callbackUrl = `${appUrl}/api/webhooks/shotstack?clipId=${clipId}`;

    const shotstackId = await submitShotstackCompose(
      brollClips,
      audioUrl,
      totalDuration,
      callbackUrl
    );

    console.log(`[ai-generate] Shotstack render submitted shotstackId=${shotstackId}`);

    // ── Step 6: Update clip to PROCESSING ─────────────────────────────────────
    await db.repurposedClip.update({
      where: { id: clipId },
      data: {
        status: "PROCESSING",
        opusClipId: shotstackId,
        duration: totalDuration,
        isAIGenerated: true,
      },
    });

    return NextResponse.json({ ok: true, shotstackId, totalDuration, audioUrl });
  } catch (err) {
    console.error(`[ai-generate] failed for clipId=${clipId}:`, err);
    await db.repurposedClip.update({ where: { id: clipId }, data: { status: "FAILED" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI generation failed" },
      { status: 500 }
    );
  }
}
