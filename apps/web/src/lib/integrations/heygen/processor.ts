// ─── AI clip processor: ElevenLabs TTS → HeyGen lipsync ─────────────────────
// Called via waitUntil after AssemblyAI webhook creates GENERATING_AI clips.

import { db } from "@contentforge/db";
import { generateAndUploadVoiceover, trimVideoWithShotstack, detectVideoRotation } from "@/lib/video-processing";
import { fetchMoodTrack } from "@/lib/integrations/pixabay/music";
import { createLogger } from "../shared/logger";

const logger = createLogger("heygen-processor");

interface ReelScriptJson {
  suggestedScript?: string;
  mood?: string;
  reason?: string;
  frameworkName?: string;
  targetSec?: number;
  minSec?: number;
  maxSec?: number;
}

/**
 * Processes a GENERATING_AI clip through the full Type 2 pipeline:
 * ElevenLabs TTS → R2 upload → HeyGen lipsync submit → DB update
 *
 * HeyGen webhook fires on completion → Reap captions → READY
 */
export async function processAiClip(clipId: string): Promise<void> {
  logger.info("Starting AI clip processing", { clipId });

  const clip = await db.repurposedClip.findUnique({ where: { id: clipId } });
  if (!clip) {
    logger.warn("Clip not found", { clipId });
    return;
  }

  if (clip.status !== "GENERATING_AI") {
    logger.info("Clip already processed, skipping", { clipId, status: clip.status });
    return;
  }

  const video = await db.uploadedVideo.findUnique({ where: { id: clip.videoId } });
  if (!video) {
    logger.warn("Parent video not found", { clipId, videoId: clip.videoId });
    await db.repurposedClip.update({ where: { id: clipId }, data: { status: "FAILED" } });
    return;
  }

  const reelScript = clip.reelScript as ReelScriptJson | null;
  const script = reelScript?.suggestedScript;
  if (!script) {
    logger.error("No suggestedScript in reelScript — cannot generate voiceover", { clipId });
    await db.repurposedClip.update({ where: { id: clipId }, data: { status: "FAILED" } });
    return;
  }

  const voiceId = video.clonedVoiceId ?? process.env.ELEVENLABS_VOICE_ID;
  if (!voiceId) {
    logger.error("No voice ID available (clonedVoiceId null and ELEVENLABS_VOICE_ID not set)", { clipId });
    await db.repurposedClip.update({ where: { id: clipId }, data: { status: "FAILED" } });
    return;
  }

  logger.info("Generating voiceover", {
    clipId,
    voiceId,
    scriptLen: script.length,
    usingClone: !!video.clonedVoiceId,
  });

  try {
    // 1. Generate TTS audio and upload to R2
    const { url: audioUrl, wordTimings } = await generateAndUploadVoiceover(
      script,
      voiceId,
      `ai-clip-${clipId}`,
    );
    logger.info("Voiceover ready", { clipId, audioUrl });

    // 2. Trim video to exact audio duration so they end at the same time.
    // Shotstack accepts decimal seconds. HeyGen requires <15% duration diff — 0% is ideal.
    const audioDuration = wordTimings.length > 0
      ? wordTimings[wordTimings.length - 1].end
      : 30;
    const trimDuration = audioDuration;

    // 3. Use Shotstack to trim the source video to just the clip length.
    //    Shotstack renders a short public-URL clip which we then send to HeyGen.
    //    This avoids sending the full multi-minute source video to HeyGen
    //    (which exceeds the $5 API credit limit at $0.0333/s).
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://contentforge-web-nine.vercel.app";
    const encodedAudioUrl = encodeURIComponent(audioUrl);
    const shotstackCallback = `${appUrl}/api/webhooks/shotstack?clipId=${clipId}&purpose=heygen&audioUrl=${encodedAudioUrl}`;

    // Music disabled temporarily — re-enable after e2e test passes
    // const musicUrl = await fetchMoodTrack(reelScript?.mood);

    // Detect video rotation for phone recordings (Samsung/iPhone store portrait
    // as landscape with a rotation tag — Shotstack ignores it without explicit correction).
    // Cache in metadata.videoRotation so parallel clips only pay the cost once.
    const existingMeta = (video.metadata as Record<string, unknown> | null) ?? {};
    let rotationDeg: number;
    if (typeof existingMeta.videoRotation === "number") {
      rotationDeg = existingMeta.videoRotation;
      logger.info("Using cached video rotation", { clipId, rotationDeg });
    } else {
      rotationDeg = await detectVideoRotation(video.storagePath);
      logger.info("Detected video rotation", { clipId, rotationDeg });
      await db.uploadedVideo.update({
        where: { id: video.id },
        data: { metadata: { ...existingMeta, videoRotation: rotationDeg } },
      });
    }

    const renderId = await trimVideoWithShotstack(
      video.storagePath,
      trimDuration,
      shotstackCallback,
      undefined, // no music until R2 tracks are uploaded
      rotationDeg,
    );
    logger.info("Shotstack trim submitted", { clipId, renderId, trimDuration, mood: reelScript?.mood ?? "motivational" });

    // 4. Mark as PROCESSING — Shotstack webhook fires when trim is done,
    //    then submits to HeyGen, then HeyGen webhook fires → Reap → READY
    await db.repurposedClip.update({
      where: { id: clipId },
      data: {
        opusClipId: `shotstack-trim:${renderId}`,
        status: "PROCESSING",
        isAIGenerated: true,
      },
    });
  } catch (err) {
    const errDetail = err instanceof Error
      ? { message: err.message, name: err.name, status: (err as any).status }
      : err;
    logger.error("Failed to process AI clip", { clipId, err: errDetail });
    await db.repurposedClip.update({ where: { id: clipId }, data: { status: "FAILED" } });
  }
}
