import { db } from "@contentforge/db";
import { NextResponse } from "next/server";
import {
  selectBestSegments,
  submitShotstackRender,
  generateAndUploadVoiceover,
} from "@/lib/video-processing";

export const maxDuration = 60;

interface AssemblyAIWord {
  start: number;
  end: number;
  text: string;
  confidence: number;
}

interface AssemblyAIWebhookPayload {
  transcript_id: string;
  status: "completed" | "error";
}

interface AssemblyAITranscript {
  id: string;
  status: "completed" | "error";
  text?: string;
  words?: AssemblyAIWord[];
  error?: string;
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");

  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  const payload = (await req.json()) as AssemblyAIWebhookPayload;
  console.log(
    `AssemblyAI webhook for video ${videoId}: status=${payload.status}, id=${payload.transcript_id}`
  );

  if (payload.status === "error") {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    const errRes = await fetch(
      `https://api.assemblyai.com/v2/transcript/${payload.transcript_id}`,
      { headers: { authorization: apiKey! } }
    );
    const errData = errRes.ok ? await errRes.json() : {};
    console.error(
      `AssemblyAI error for video ${videoId}:`,
      errData.error ?? "unknown error",
      "| url:",
      errData.audio_url
    );
    await db.uploadedVideo.update({
      where: { id: videoId },
      data: { status: "READY" },
    });
    return NextResponse.json({ ok: true });
  }

  if (payload.status !== "completed") {
    return NextResponse.json({ ok: true });
  }

  // Idempotency: skip if clips already exist
  const existingClips = await db.repurposedClip.count({ where: { videoId } });
  if (existingClips > 0) {
    console.log(
      `Video ${videoId} already has ${existingClips} clips, skipping duplicate webhook`
    );
    return NextResponse.json({ ok: true });
  }

  // Fetch full transcript from AssemblyAI
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  const transcriptRes = await fetch(
    `https://api.assemblyai.com/v2/transcript/${payload.transcript_id}`,
    { headers: { authorization: apiKey! } }
  );
  if (!transcriptRes.ok) {
    console.error(`Failed to fetch transcript ${payload.transcript_id}`);
    await db.uploadedVideo.update({
      where: { id: videoId },
      data: { status: "READY" },
    });
    return NextResponse.json({ ok: true });
  }
  const transcript = (await transcriptRes.json()) as AssemblyAITranscript;

  if (!transcript.text) {
    console.error(`Transcript ${payload.transcript_id} has no text`);
    await db.uploadedVideo.update({
      where: { id: videoId },
      data: { status: "READY" },
    });
    return NextResponse.json({ ok: true });
  }

  const video = await db.uploadedVideo.findUnique({ where: { id: videoId } });
  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  try {
    // Build word-level segments (ms → seconds)
    const words = transcript.words ?? [];
    const segments =
      words.length > 0
        ? words.map((w) => ({
            start: w.start / 1000,
            end: w.end / 1000,
            text: w.text,
          }))
        : [{ start: 0, end: 999, text: transcript.text }];

    // Persist transcript
    await db.uploadedVideo.update({
      where: { id: videoId },
      data: { transcript: transcript.text },
    });

    // GPT-4o: pick 10 best moments with full reel scripts + formats
    console.log(`[pipeline] Selecting best segments for video ${videoId}...`);
    const selectedSegments = await selectBestSegments(
      transcript.text,
      segments,
      10
    );

    // ElevenLabs voice selection:
    // 1. Use voice already cloned for this video (stored in DB)
    // 2. Use ELEVENLABS_VOICE_ID env var (pre-created voice clone from ElevenLabs dashboard)
    // 3. Fall back to Rachel (default ElevenLabs voice)
    //
    // NOTE: Runtime cloning is skipped here because the webhook runs in a 60s
    // serverless function — downloading + uploading a 5-min video reliably exceeds
    // that limit. Create your voice clone at elevenlabs.io, copy the Voice ID,
    // and set ELEVENLABS_VOICE_ID in Vercel env vars.
    const voiceId =
      video.clonedVoiceId ??
      process.env.ELEVENLABS_VOICE_ID ??
      "21m00Tcm4TlvDq8ikWAM"; // Rachel fallback

    console.log(`[pipeline] Using voice ID: ${voiceId} for video ${videoId}`);

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      "https://contentforge-web-nine.vercel.app";
    const shotstackWebhook = `${appUrl}/api/webhooks/shotstack`;

    // Generate voiceovers + submit Shotstack renders in parallel
    const results = await Promise.allSettled(
      selectedSegments.map(async (seg, idx) => {
        const clipKey = `${videoId}-clip-${idx}`;

        // Generate ElevenLabs voiceover for this clip
        let voiceoverUrl: string | undefined;
        try {
          voiceoverUrl = await generateAndUploadVoiceover(
            seg.reelScript.narrationScript,
            voiceId!,
            clipKey
          );
        } catch (err) {
          console.warn(`[pipeline] Voiceover failed for clip ${idx}:`, err);
        }

        // Submit Shotstack render (voiceover optional — falls back to original audio)
        const renderId = await submitShotstackRender(
          video.storagePath,
          seg,
          shotstackWebhook,
          voiceoverUrl
        );

        return db.repurposedClip.create({
          data: {
            videoId: video.id,
            title: seg.title,
            startTime: seg.startTime,
            endTime: seg.endTime,
            captions: seg.transcript,
            opusClipId: renderId,
            format: seg.format,
            reelScript: seg.reelScript as object,
            status: "PROCESSING",
            hashtags: [],
          },
        });
      })
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results
      .filter((r) => r.status === "rejected")
      .map((r) => (r as PromiseRejectedResult).reason);
    if (failed.length > 0) {
      console.warn(`[pipeline] ${failed.length} clips failed:`, failed);
    }

    await db.uploadedVideo.update({
      where: { id: videoId },
      data: { status: "READY" },
    });

    console.log(`Video ${videoId}: ${succeeded}/10 clips queued for rendering`);
    return NextResponse.json({ ok: true, clipsQueued: succeeded });
  } catch (err) {
    console.error(
      `AssemblyAI webhook processing failed for video ${videoId}:`,
      err
    );
    await db.uploadedVideo.update({
      where: { id: videoId },
      data: { status: "READY" },
    });
    return NextResponse.json({ ok: true });
  }
}
