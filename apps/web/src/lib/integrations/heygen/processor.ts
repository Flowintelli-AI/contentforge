// ─── AI clip processor: ElevenLabs TTS → HeyGen lipsync ─────────────────────
// Called via waitUntil after AssemblyAI webhook creates GENERATING_AI clips.

import { db } from "@contentforge/db";
import type { Prisma } from "@contentforge/db";
import { generateAndUploadVoiceover, trimAndUploadFaceVideo, cloneVoiceFromVideo } from "@/lib/video-processing";
import { heyGenService } from "@/lib/integrations/heygen/service";
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
  // Hybrid Type 1+hook: TTS only the hook, then Remotion combines with original footage
  isHybridWithOriginal?: boolean;
  hookText?: string;
  originalStart?: number;
  originalEnd?: number;
  originalSrc?: string;
  originalWordTimings?: Array<{ word: string; start: number; end: number }>;
  videoRotation?: number;
}

/**
 * Returns the voice ID to use for this video's clips.
 * Priority: video.clonedVoiceId → creator.voiceCloneId (instant reuse) → poll for background clone → inline clone fallback.
 */
async function ensureVoiceCloned(
  video: { id: string; storagePath: string; clonedVoiceId: string | null; creatorId: string },
  clipId: string,
  maxWaitMs = 90_000,
): Promise<string | null> {
  if (video.clonedVoiceId) return video.clonedVoiceId;

  const logger = createLogger("heygen-processor");

  // Fast path: creator already has a cloned voice — reuse it immediately
  const creator = await db.creatorProfile.findUnique({
    where: { id: video.creatorId },
    select: { voiceCloneId: true },
  });
  if (creator?.voiceCloneId) {
    logger.info("Reusing existing creator voice clone (no new clone needed)", { clipId, voiceId: creator.voiceCloneId });
    await db.uploadedVideo.update({ where: { id: video.id }, data: { clonedVoiceId: creator.voiceCloneId } });
    return creator.voiceCloneId;
  }

  const pollIntervalMs = 10_000;
  const polls = Math.floor(maxWaitMs / pollIntervalMs);

  logger.info("clonedVoiceId null — polling DB while background clone runs", { clipId, videoId: video.id, maxWaitMs });
  for (let i = 0; i < polls; i++) {
    await new Promise(r => setTimeout(r, pollIntervalMs));
    const updated = await db.uploadedVideo.findUnique({ where: { id: video.id }, select: { clonedVoiceId: true } });
    if (updated?.clonedVoiceId) {
      logger.info(`Background voice clone finished after ${(i + 1) * pollIntervalMs / 1000}s`, { clipId, voiceId: updated.clonedVoiceId });
      return updated.clonedVoiceId;
    }
  }

  // Background clone didn't finish — clone inline as final fallback
  logger.info("Background clone still pending after polling — cloning inline", { clipId, videoId: video.id });
  try {
    const newVoiceId = await cloneVoiceFromVideo(video.storagePath, video.id);
    // Save to video AND creator profile
    await Promise.all([
      db.uploadedVideo.update({ where: { id: video.id }, data: { clonedVoiceId: newVoiceId } }),
      db.creatorProfile.update({ where: { id: video.creatorId }, data: { voiceCloneId: newVoiceId } }),
    ]);
    logger.info("Inline voice clone succeeded", { clipId, voiceId: newVoiceId });
    return newVoiceId;
  } catch (cloneErr) {
    logger.warn("Inline voice clone also failed, will use fallback voice", { clipId, cloneErr });
    return null;
  }
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

  let video = await db.uploadedVideo.findUnique({ where: { id: clip.videoId } });
  if (!video) {
    logger.warn("Parent video not found", { clipId, videoId: clip.videoId });
    await db.repurposedClip.update({ where: { id: clipId }, data: { status: "FAILED" } });
    return;
  }

  const reelScript = clip.reelScript as ReelScriptJson | null;

  // ── Hybrid mode: Type 1 clip that needs a hook prepend ──────────────────────
  // TTS only the hook text; HeyGen lipsync will produce the short hook face video.
  // The HeyGen webhook then combines [hook face] + [original footage] in Remotion.
  if (reelScript?.isHybridWithOriginal) {
    const hookText = reelScript.hookText;
    if (!hookText) {
      logger.error("Hybrid clip missing hookText", { clipId });
      await db.repurposedClip.update({ where: { id: clipId }, data: { status: "FAILED" } });
      return;
    }

    // Wait for background voice clone to finish (or clone inline as fallback)
    if (!video.clonedVoiceId) {
      const clonedId = await ensureVoiceCloned(video, clipId);
      if (clonedId) video = { ...video, clonedVoiceId: clonedId };
    }

    const voiceId = video.clonedVoiceId ?? process.env.ELEVENLABS_VOICE_ID;
    if (!voiceId) {
      logger.error("No voice ID for hybrid clip hook", { clipId });
      await db.repurposedClip.update({ where: { id: clipId }, data: { status: "FAILED" } });
      return;
    }

    logger.info("Generating hook voiceover (hybrid Type 1+hook)", { clipId, hookText, voiceId });

    try {
      const { url: audioUrl, wordTimings: hookWordTimings, audioDurationSec: hookDuration } = await generateAndUploadVoiceover(
        hookText,
        voiceId,
        `hook-${clipId}`,
      );
      logger.info("Hook voiceover ready", { clipId, audioUrl, words: hookWordTimings.length, hookDuration });

      // Store hook word timings + char count for cost tracking
      const existingMeta = (clip.metadata as Record<string, unknown> | null) ?? {};
      await db.repurposedClip.update({
        where: { id: clipId },
        data: { metadata: { ...existingMeta, hookWordTimings, elevenlabsChars: hookText.length } as unknown as Prisma.InputJsonValue },
      });

      // Trim face video to hook duration + bake in rotation, then submit to HeyGen directly
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://contentforge-web-nine.vercel.app";

      const existingVideoMeta = (video.metadata as Record<string, unknown> | null) ?? {};
      const rotationDeg = (existingVideoMeta.videoRotation as number | undefined) ?? 0;
      if (rotationDeg !== 0) {
        logger.info("Applying rotation to hook face video", { clipId, rotationDeg });
      }

      const faceVideoUrl = await trimAndUploadFaceVideo(
        video.storagePath,
        `hook-${clipId}`,
        hookDuration,
        rotationDeg,
      );
      logger.info("Hook face video trimmed", { clipId, faceVideoUrl, hookDuration });

      const { lipsyncId } = await heyGenService.submitLipsync({
        faceVideoUrl,
        audioUrl,
        title: clip.title ?? undefined,
        callbackUrl: `${appUrl}/api/webhooks/heygen`,
      });

      await db.repurposedClip.update({
        where: { id: clipId },
        data: {
          opusClipId: `heygen:${lipsyncId}`,
          status: "PROCESSING",
          isAIGenerated: false, // This is a hybrid: has original footage component
        },
      });
      logger.info("Hook submitted to HeyGen lipsync", { clipId, lipsyncId });
    } catch (err) {
      const errDetail = err instanceof Error ? { message: err.message, name: err.name } : err;
      logger.error("Failed to process hybrid clip hook", { clipId, err: errDetail });
      await db.repurposedClip.update({ where: { id: clipId }, data: { status: "FAILED" } });
    }
    return;
  }

  // ── Standard Type 2 mode ─────────────────────────────────────────────────────
  const script = reelScript?.suggestedScript;
  if (!script) {
    logger.error("No suggestedScript in reelScript — cannot generate voiceover", { clipId });
    await db.repurposedClip.update({ where: { id: clipId }, data: { status: "FAILED" } });
    return;
  }

  // Wait for background voice clone to finish (or clone inline as fallback)
  if (!video.clonedVoiceId) {
    const clonedId = await ensureVoiceCloned(video, clipId);
    if (clonedId) video = { ...video, clonedVoiceId: clonedId };
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
    const { url: audioUrl, wordTimings, audioDurationSec } = await generateAndUploadVoiceover(
      script,
      voiceId,
      `ai-clip-${clipId}`,
    );
    logger.info("Voiceover ready", { clipId, audioUrl, wordTimings: wordTimings.length, audioDurationSec });

    // Persist word timings + char count so the HeyGen webhook can pass them to Remotion for captions.
    // ElevenLabs timings are already in seconds, relative to the TTS audio start — perfect for Remotion.
    const existingClipMeta = (clip.metadata as Record<string, unknown> | null) ?? {};
    await db.repurposedClip.update({
      where: { id: clipId },
      data: { metadata: { ...existingClipMeta, wordTimings, elevenlabsChars: script.length } as unknown as Prisma.InputJsonValue },
    });

    // 2. Trim face video to exact audio duration — identical length, 0% diff for HeyGen.
    const trimDuration = audioDurationSec;

    // 3. Trim video with ffmpeg (bakes in rotation) + submit directly to HeyGen lipsync.
    //    Bypasses Shotstack entirely — eliminates the scale-then-rotate zoom bug on
    //    Samsung/portrait videos.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://contentforge-web-nine.vercel.app";

    // Read cached rotation (set at process time in /process/route.ts).
    const existingMeta = (video.metadata as Record<string, unknown> | null) ?? {};
    const rotationDeg = (existingMeta.videoRotation as number | undefined) ?? 0;
    if (rotationDeg !== 0) {
      logger.info("Applying rotation to face video", { clipId, rotationDeg });
    }

    const faceVideoUrl = await trimAndUploadFaceVideo(
      video.storagePath,
      clipId,
      trimDuration,
      rotationDeg,
    );
    logger.info("Face video trimmed", { clipId, faceVideoUrl, trimDuration });

    const { lipsyncId } = await heyGenService.submitLipsync({
      faceVideoUrl,
      audioUrl,
      title: clip.title ?? undefined,
      callbackUrl: `${appUrl}/api/webhooks/heygen`,
    });

    // 4. Mark as PROCESSING — HeyGen webhook fires when lipsync is done → Remotion render → READY
    await db.repurposedClip.update({
      where: { id: clipId },
      data: {
        opusClipId: `heygen:${lipsyncId}`,
        status: "PROCESSING",
        isAIGenerated: true,
      },
    });
    logger.info("Submitted to HeyGen lipsync", { clipId, lipsyncId, trimDuration });
  } catch (err) {
    const errDetail = err instanceof Error
      ? { message: err.message, name: err.name, status: (err as any).status }
      : err;
    logger.error("Failed to process AI clip", { clipId, err: errDetail });
    await db.repurposedClip.update({ where: { id: clipId }, data: { status: "FAILED" } });
  }
}
