// ─── AI clip processor: ElevenLabs TTS → HeyGen lipsync ─────────────────────
// Called via waitUntil after AssemblyAI webhook creates GENERATING_AI clips.

import { db } from "@contentforge/db";
import { heyGenService } from "./service";
import { generateAndUploadVoiceover } from "@/lib/video-processing";
import { createLogger } from "../shared/logger";

const logger = createLogger("heygen-processor");

interface ReelScriptJson {
  suggestedScript?: string;
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
    const { url: audioUrl } = await generateAndUploadVoiceover(
      script,
      voiceId,
      `ai-clip-${clipId}`,
    );
    logger.info("Voiceover ready", { clipId, audioUrl });

    // 2. Submit to HeyGen lipsync
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const { lipsyncId } = await heyGenService.submitLipsync({
      faceVideoUrl: video.storagePath,
      audioUrl,
      title: clip.title ?? undefined,
      callbackUrl: appUrl ? `${appUrl}/api/webhooks/heygen` : undefined,
    });

    // 3. Mark as PROCESSING and store lipsyncId so the webhook can correlate
    await db.repurposedClip.update({
      where: { id: clipId },
      data: {
        opusClipId: `heygen:${lipsyncId}`,
        status: "PROCESSING",
        isAIGenerated: true,
      },
    });

    logger.info("HeyGen lipsync submitted", { clipId, lipsyncId });
  } catch (err) {
    const errDetail = err instanceof Error
      ? { message: err.message, name: err.name, status: (err as any).status }
      : err;
    logger.error("Failed to process AI clip", { clipId, err: errDetail });
    await db.repurposedClip.update({ where: { id: clipId }, data: { status: "FAILED" } });
  }
}
