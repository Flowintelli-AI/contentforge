/**
 * Pipeline diagnostic test endpoint.
 *
 * Usage:
 *   GET /api/test/pipeline?secret=<TEST_SECRET>&stage=<stage>&videoId=<id>
 *
 * Stages:
 *   rotation       — detect rotation angle from the video URL
 *   voice-clone    — clone voice via ElevenLabs (creates a real voice — delete after test)
 *   tts            — generate TTS audio from a sample script (uploads to R2)
 *   transcription  — submit video to AssemblyAI (async — check AssemblyAI dashboard)
 *   shotstack      — submit a Shotstack trim render job
 *   reap           — submit video to Reap captions
 *   heygen         — submit a lipsync job to HeyGen (costs credits — use with care)
 *   db-video       — inspect DB record for videoId (no external calls)
 *
 * Required env var: TEST_SECRET (add in Vercel dashboard — any random string)
 *
 * Example:
 *   curl "https://contentforge-web-nine.vercel.app/api/test/pipeline?secret=abc123&stage=rotation&videoId=cmo7t0uuh0007113g3bpu2rzo"
 */

import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { db } from "@contentforge/db";
import { detectVideoRotation, cloneVoiceFromVideo, generateAndUploadVoiceover } from "@/lib/video-processing";
import { reapService } from "@/lib/integrations/reap/service";
import { heyGenService } from "@/lib/integrations/heygen/service";
import { remotionRenderService } from "@/lib/integrations/remotion/service";
import { renderMediaOnLambda, getRenderProgress } from "@remotion/lambda/client";

export const maxDuration = 300;

// ─── Auth guard ───────────────────────────────────────────────────────────────

function checkSecret(req: Request): NextResponse | null {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const expected = process.env.TEST_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: "TEST_SECRET env var is not set. Add it in Vercel dashboard first." },
      { status: 500 }
    );
  }
  if (secret !== expected) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchVideoRecord(videoId: string) {
  return db.uploadedVideo.findUnique({
    where: { id: videoId },
    include: { creator: { select: { id: true } } },
  });
}

function ok(stage: string, result: Record<string, unknown>) {
  return NextResponse.json({ stage, status: "ok", ...result });
}

function fail(stage: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack?.split("\n").slice(0, 6).join("\n") : undefined;
  return NextResponse.json({ stage, status: "error", error: message, stack }, { status: 500 });
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const authError = checkSecret(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const stage = url.searchParams.get("stage") ?? "";
  const videoId = url.searchParams.get("videoId") ?? "";

  // ── db-video ────────────────────────────────────────────────────────────────
  if (stage === "db-video") {
    if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });
    const video = await fetchVideoRecord(videoId);
    if (!video) return NextResponse.json({ error: "Video not found in DB" }, { status: 404 });

    const clips = await db.repurposedClip.findMany({
      where: { videoId },
      select: { id: true, status: true, platform: true, format: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    return ok("db-video", {
      id: video.id,
      status: video.status,
      storagePath: video.storagePath,
      clonedVoiceId: video.clonedVoiceId ?? null,
      metadata: video.metadata,
      clips,
    });
  }

  // ── rotation ────────────────────────────────────────────────────────────────
  if (stage === "rotation") {
    if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });
    const video = await fetchVideoRecord(videoId);
    if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

    try {
      const rotationDeg = await detectVideoRotation(video.storagePath);
      const cached = ((video.metadata ?? {}) as Record<string, unknown>).videoRotation;
      return ok("rotation", {
        videoUrl: video.storagePath,
        detected: rotationDeg,
        cached: cached ?? "(not yet cached)",
        interpretation:
          rotationDeg === 0   ? "No rotation — video is already upright ✅" :
          rotationDeg === 90  ? "90° clockwise correction needed (portrait phone video recorded sideways)" :
          rotationDeg === -90 ? "90° counter-clockwise correction needed" :
          rotationDeg === 180 ? "Upside down — 180° flip needed" :
          `Unusual angle: ${rotationDeg}°`,
      });
    } catch (err) {
      return fail("rotation", err);
    }
  }

  // ── voice-clone ─────────────────────────────────────────────────────────────
  if (stage === "voice-clone") {
    if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });
    const video = await fetchVideoRecord(videoId);
    if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

    try {
      console.log(`[test/voice-clone] Starting voice clone for video=${videoId}`);
      const voiceId = await cloneVoiceFromVideo(video.storagePath, videoId);
      return ok("voice-clone", {
        voiceId,
        note: "⚠️  A real ElevenLabs voice was created. Delete it from your ElevenLabs dashboard if this was just a test.",
      });
    } catch (err) {
      return fail("voice-clone", err);
    }
  }

  // ── tts ─────────────────────────────────────────────────────────────────────
  if (stage === "tts") {
    const voiceId = url.searchParams.get("voiceId") ?? process.env.ELEVENLABS_VOICE_ID ?? "";
    if (!voiceId) return NextResponse.json({ error: "voiceId param required (or set ELEVENLABS_VOICE_ID)" }, { status: 400 });

    const script = url.searchParams.get("script") ?? "This is a test of the ContentForge voice pipeline. If you can hear this, text to speech is working correctly.";
    const clipKey = `test/tts-${Date.now()}`;

    try {
      const result = await generateAndUploadVoiceover(script, voiceId, clipKey);
      return ok("tts", {
        audioUrl: result.url,
        wordCount: result.wordTimings.length,
        firstFewWords: result.wordTimings.slice(0, 5),
        note: `Audio uploaded to R2 at voiceovers/${clipKey}.mp3`,
      });
    } catch (err) {
      return fail("tts", err);
    }
  }

  // ── transcription ───────────────────────────────────────────────────────────
  if (stage === "transcription") {
    const directUrl = url.searchParams.get("videoUrl") ?? "";
    if (!directUrl && !videoId) return NextResponse.json({ error: "videoId or videoUrl required" }, { status: 400 });
    let audioUrl = directUrl;
    if (!directUrl) {
      const video = await fetchVideoRecord(videoId);
      if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });
      audioUrl = video.storagePath;
    }

    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ASSEMBLYAI_API_KEY not set" }, { status: 500 });

    try {
      const res = await fetch("https://api.assemblyai.com/v2/transcript", {
        method: "POST",
        headers: { authorization: apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          audio_url: audioUrl,
          speech_models: ["universal-2"],
          punctuate: true,
          format_text: true,
          // No webhook — poll manually; this is a diagnostic test
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        return fail("transcription", new Error(`AssemblyAI ${res.status}: ${body}`));
      }

      const { id, status } = (await res.json()) as { id: string; status: string };
      return ok("transcription", {
        transcriptId: id,
        initialStatus: status,
        videoUrl: audioUrl,
        pollUrl: `https://api.assemblyai.com/v2/transcript/${id}`,
        note: "Transcription is async — check AssemblyAI dashboard or poll the URL above. Usually takes 2-5 min.",
      });
    } catch (err) {
      return fail("transcription", err);
    }
  }

  // ── shotstack ───────────────────────────────────────────────────────────────
  if (stage === "shotstack") {
    const directUrl = url.searchParams.get("videoUrl") ?? "";
    if (!directUrl && !videoId) return NextResponse.json({ error: "videoId or videoUrl required" }, { status: 400 });
    let srcUrl = directUrl;
    if (!directUrl) {
      const video = await fetchVideoRecord(videoId);
      if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });
      srcUrl = video.storagePath;
    }

    const apiKey = process.env.SHOTSTACK_API_KEY;
    const env = process.env.SHOTSTACK_ENV ?? "stage";
    if (!apiKey) return NextResponse.json({ error: "SHOTSTACK_API_KEY not set" }, { status: 500 });

    const startSec = parseFloat(url.searchParams.get("start") ?? "0");
    const endSec = parseFloat(url.searchParams.get("end") ?? "10");
    const rotation = parseInt(url.searchParams.get("rotation") ?? "0", 10);

    try {
      const payload: Record<string, unknown> = {
        timeline: {
          tracks: [{
            clips: [{
              asset: { type: "video", src: srcUrl, trim: startSec },
              start: 0,
              length: endSec - startSec,
              ...(rotation !== 0 ? { transform: { rotate: { angle: rotation } } } : {}),
            }],
          }],
        },
        output: {
          format: "mp4",
          size: { width: 1080, height: 1920 },
          fps: 30,
        },
        // No webhook — this is diagnostic; check Shotstack dashboard
      };

      const res = await fetch(`https://api.shotstack.io/${env}/render`, {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.text();
        return fail("shotstack", new Error(`Shotstack ${res.status}: ${body}`));
      }

      const data = (await res.json()) as { response: { id: string; status: string } };
      return ok("shotstack", {
        renderId: data.response.id,
        initialStatus: data.response.status,
        videoUrl: srcUrl,
        params: { startSec, endSec, rotation },
        pollUrl: `https://api.shotstack.io/${env}/render/${data.response.id}`,
        note: "Render is async — check Shotstack dashboard or poll the URL above.",
      });
    } catch (err) {
      return fail("shotstack", err);
    }
  }

  // ── shotstack-poll ──────────────────────────────────────────────────────────
  if (stage === "shotstack-poll") {
    const renderId = url.searchParams.get("renderId") ?? "";
    if (!renderId) return NextResponse.json({ error: "renderId param required" }, { status: 400 });

    const apiKey = process.env.SHOTSTACK_API_KEY;
    const env = process.env.SHOTSTACK_ENV ?? "stage";
    if (!apiKey) return NextResponse.json({ error: "SHOTSTACK_API_KEY not set" }, { status: 500 });

    try {
      const res = await fetch(`https://api.shotstack.io/${env}/render/${renderId}`, {
        headers: { "x-api-key": apiKey },
      });
      if (!res.ok) {
        const body = await res.text();
        return fail("shotstack-poll", new Error(`Shotstack ${res.status}: ${body}`));
      }
      const data = (await res.json()) as { response: { status: string; url?: string; error?: string } };
      return ok("shotstack-poll", {
        renderId,
        status: data.response.status,
        url: data.response.url ?? null,
        error: data.response.error ?? null,
        ready: data.response.status === "done",
      });
    } catch (err) {
      return fail("shotstack-poll", err);
    }
  }

  // ── reap ─────────────────────────────────────────────────────────────────────
  if (stage === "reap") {
    const videoUrl = url.searchParams.get("videoUrl") ?? "";
    if (!videoUrl) return NextResponse.json({ error: "videoUrl param required (direct video URL to caption)" }, { status: 400 });

    try {
      const projectId = await reapService.submitCaptions(videoUrl, {
        captionsPreset: "karaoke-bold",
        enableEmojis: true,
        enableHighlights: true,
      });
      return ok("reap", {
        projectId,
        note: "Captions project submitted. Check Reap dashboard for status. Webhook will NOT fire (no webhookUrl set for test).",
      });
    } catch (err) {
      return fail("reap", err);
    }
  }

  // ── heygen ──────────────────────────────────────────────────────────────────
  if (stage === "heygen") {
    const faceVideoUrl = url.searchParams.get("faceVideoUrl") ?? "";
    const audioUrl = url.searchParams.get("audioUrl") ?? "";
    if (!faceVideoUrl || !audioUrl) {
      return NextResponse.json({
        error: "faceVideoUrl and audioUrl params required",
        example: "?stage=heygen&faceVideoUrl=https://...mp4&audioUrl=https://...mp3",
      }, { status: 400 });
    }

    try {
      const result = await heyGenService.submitLipsync({
        faceVideoUrl,
        audioUrl,
        title: `test-lipsync-${Date.now()}`,
      });
      return ok("heygen", {
        lipsyncId: result.lipsyncId,
        status: result.status,
        faceVideoUrl,
        audioUrl,
        note: "⚠️  This costs HeyGen credits. Check HeyGen dashboard for render status.",
      });
    } catch (err) {
      return fail("heygen", err);
    }
  }

  // ── heygen-status — check status of an existing lipsync job (raw API) ────────
  if (stage === "heygen-status") {
    const lipsyncId = url.searchParams.get("lipsyncId") ?? "";
    if (!lipsyncId) return NextResponse.json({ error: "lipsyncId param required" }, { status: 400 });
    try {
      const apiKey = process.env.HEYGEN_API_KEY ?? "";
      if (!apiKey) return NextResponse.json({ error: "HEYGEN_API_KEY not set" }, { status: 500 });
      const res = await fetch(`https://api.heygen.com/v3/lipsyncs/${lipsyncId}`, {
        headers: { "X-Api-Key": apiKey },
      });
      const raw = await res.json();
      return ok("heygen-status", { httpStatus: res.status, raw });
    } catch (err) {
      return fail("heygen-status", err);
    }
  }

  // ── db-clip ─────────────────────────────────────────────────────────────────
  if (stage === "db-clip") {
    const clipId = url.searchParams.get("clipId") ?? "";
    if (!clipId) return NextResponse.json({ error: "clipId param required" }, { status: 400 });

    const clip = await db.repurposedClip.findUnique({ where: { id: clipId } });
    if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

    const meta = clip.metadata as Record<string, unknown> | null;
    return ok("db-clip", {
      id: clip.id,
      status: clip.status,
      platform: clip.platform,
      format: clip.format,
      storagePath: clip.storagePath ?? null,
      duration: clip.duration ?? null,
      opusClipId: clip.opusClipId ?? null,
      hasWordTimings: Array.isArray(meta?.wordTimings) && (meta.wordTimings as unknown[]).length > 0,
      wordTimingCount: Array.isArray(meta?.wordTimings) ? (meta.wordTimings as unknown[]).length : 0,
      metadata: meta,
      createdAt: clip.createdAt,
      updatedAt: clip.updatedAt,
    });
  }

  // ── remotion — submit a test render (returns immediately with renderId) ──────
  if (stage === "remotion") {
    const videoUrl = url.searchParams.get("videoUrl") ?? "";
    const durationSec = parseFloat(url.searchParams.get("durationSec") ?? "5");
    const captionStyle = (url.searchParams.get("captionStyle") ?? "KARAOKE") as "KARAOKE" | "HIGHLIGHT" | "CLEAN";

    if (!videoUrl) return NextResponse.json({ error: "videoUrl param required" }, { status: 400 });

    const functionName = process.env.REMOTION_FUNCTION_NAME ?? "";
    const serveUrl = process.env.REMOTION_SERVE_URL ?? "";
    const bucketName = process.env.REMOTION_BUCKET_NAME ?? "";
    const region = (process.env.REMOTION_AWS_REGION ?? "us-east-1") as "us-east-1";

    if (!functionName || !serveUrl || !bucketName) {
      return NextResponse.json({
        error: "Remotion env vars not configured",
        missing: [
          !functionName && "REMOTION_FUNCTION_NAME",
          !serveUrl && "REMOTION_SERVE_URL",
          !bucketName && "REMOTION_BUCKET_NAME",
        ].filter(Boolean),
      }, { status: 500 });
    }

    if (!process.env.AWS_ACCESS_KEY_ID && process.env.REMOTION_AWS_ACCESS_KEY_ID) {
      process.env.AWS_ACCESS_KEY_ID = process.env.REMOTION_AWS_ACCESS_KEY_ID;
    }
    if (!process.env.AWS_SECRET_ACCESS_KEY && process.env.REMOTION_AWS_SECRET_ACCESS_KEY) {
      process.env.AWS_SECRET_ACCESS_KEY = process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
    }

    const totalFrames = Math.max(1, Math.round(durationSec * 30));
    const testWordTimings = [
      { word: "Testing", start: 0, end: 0.5 },
      { word: "Remotion", start: 0.5, end: 1.0 },
      { word: "captions", start: 1.0, end: 1.5 },
    ].filter(w => w.start < durationSec);

    try {
      const { renderId, bucketName: renderBucket } = await renderMediaOnLambda({
        region,
        functionName,
        serveUrl,
        composition: "VideoComposition",
        inputProps: {
          segments: [{ type: "original", src: videoUrl, startFrom: 0, duration: durationSec, offsetFrom: 0 }],
          wordTimings: testWordTimings,
          captionStyle,
          primaryColor: "#FFFFFF",
          highlightColor: "#FFD700",
        },
        codec: "h264",
        imageFormat: "jpeg",
        maxRetries: 1,
        privacy: "public",
        frameRange: [0, totalFrames - 1],
        framesPerLambda: 200,
      });

      const bucket = renderBucket ?? bucketName;
      return ok("remotion", {
        renderId,
        bucket,
        region,
        durationSec,
        totalFrames,
        videoUrl,
        captionStyle,
        note: `Render submitted ✅ — poll with: stage=remotion-poll&renderId=${renderId}&bucket=${bucket}`,
      });
    } catch (err) {
      return fail("remotion", err);
    }
  }

  // ── remotion-poll — check render progress ────────────────────────────────────
  if (stage === "remotion-poll") {
    const renderId = url.searchParams.get("renderId") ?? "";
    const bucket = url.searchParams.get("bucket") ?? process.env.REMOTION_BUCKET_NAME ?? "";

    if (!renderId) return NextResponse.json({ error: "renderId param required" }, { status: 400 });
    if (!bucket) return NextResponse.json({ error: "bucket param required (or set REMOTION_BUCKET_NAME)" }, { status: 400 });

    const functionName = process.env.REMOTION_FUNCTION_NAME ?? "";
    const region = (process.env.REMOTION_AWS_REGION ?? "us-east-1") as "us-east-1";

    if (!process.env.AWS_ACCESS_KEY_ID && process.env.REMOTION_AWS_ACCESS_KEY_ID) {
      process.env.AWS_ACCESS_KEY_ID = process.env.REMOTION_AWS_ACCESS_KEY_ID;
    }
    if (!process.env.AWS_SECRET_ACCESS_KEY && process.env.REMOTION_AWS_SECRET_ACCESS_KEY) {
      process.env.AWS_SECRET_ACCESS_KEY = process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
    }

    try {
      const progress = await getRenderProgress({
        renderId,
        bucketName: bucket,
        functionName,
        region,
      });

      return ok("remotion-poll", {
        renderId,
        done: progress.done,
        progress: `${Math.round((progress.overallProgress ?? 0) * 100)}%`,
        outputFile: progress.outputFile ?? null,
        fatalError: progress.fatalErrorEncountered,
        errors: progress.errors?.slice(0, 3) ?? [],
        ...(progress.done && progress.outputFile ? { result: "✅ Render complete — open outputFile to verify video" } : {}),
      });
    } catch (err) {
      return fail("remotion-poll", err);
    }
  }

  // ── rerender-clip — re-render a clip using stored HeyGen URL + word timings ──
  // Useful to re-render clips that were rendered with wrong duration.
  if (stage === "rerender-clip") {
    const clipId = url.searchParams.get("clipId") ?? "";
    if (!clipId) {
      return NextResponse.json({ error: "clipId param required" }, { status: 400 });
    }

    const clip = await db.repurposedClip.findUnique({ where: { id: clipId } });
    if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

    const meta = (clip.metadata as Record<string, unknown> | null) ?? {};
    const heygenVideoUrl = meta.heygenVideoUrl as string | undefined;
    if (!heygenVideoUrl) {
      return NextResponse.json({
        error: "No heygenVideoUrl stored in clip metadata. The clip was rendered before this was tracked. Pass heygenVideoUrl manually using heygen-simulate instead.",
        clipId,
        meta,
      }, { status: 400 });
    }

    const wordTimings =
      (meta.wordTimings as Array<{ word: string; start: number; end: number }>) ?? [];
    const durationFromWords =
      wordTimings.length > 0
        ? wordTimings[wordTimings.length - 1].end + 0.5
        : null;
    const durationSec = durationFromWords ?? clip.duration ?? 30;

    await db.repurposedClip.update({ where: { id: clipId }, data: { status: "PROCESSING" } });

    waitUntil(
      remotionRenderService
        .renderClipAndWait({
          segments: [{ type: "heygen", src: heygenVideoUrl, startFrom: 0, duration: durationSec, offsetFrom: 0 }],
          wordTimings,
          captionStyle: "KARAOKE",
          totalDurationSec: durationSec,
        })
        .then(async (outputUrl) => {
          await db.repurposedClip.update({
            where: { id: clipId },
            data: { storagePath: outputUrl, status: "READY" },
          });
          console.log(`[test/rerender-clip] Clip ${clipId} → READY: ${outputUrl}`);
        })
        .catch(async (err) => {
          console.error(`[test/rerender-clip] Render failed for clip ${clipId}:`, err);
          await db.repurposedClip.update({ where: { id: clipId }, data: { status: "FAILED" } });
        })
    );

    return ok("rerender-clip", {
      clipId,
      heygenVideoUrl,
      durationSec,
      durationSource: durationFromWords ? "word-timings" : "db-duration",
      wordTimingCount: wordTimings.length,
      message: `Re-render queued ✅ — poll with: stage=db-clip&clipId=${clipId}`,
    });
  }

  // ── heygen-simulate — fire Remotion render for a lipsync clip ────────────────
  // Simulates the HeyGen webhook success event without waiting for HeyGen.
  // Requires clip to exist in DB with wordTimings in metadata (set by heygen/processor.ts).
  if (stage === "heygen-simulate") {
    const clipId = url.searchParams.get("clipId") ?? "";
    const heygenVideoUrl = url.searchParams.get("heygenVideoUrl") ?? "";

    if (!clipId || !heygenVideoUrl) {
      return NextResponse.json({
        error: "clipId and heygenVideoUrl params required",
        example: "?stage=heygen-simulate&clipId=<id>&heygenVideoUrl=https://...mp4",
      }, { status: 400 });
    }

    const clip = await db.repurposedClip.findUnique({ where: { id: clipId } });
    if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

    const wordTimings =
      ((clip.metadata as Record<string, unknown> | null)?.wordTimings as
        Array<{ word: string; start: number; end: number }>) ?? [];
    const durationFromWords =
      wordTimings.length > 0 ? wordTimings[wordTimings.length - 1].end + 0.5 : null;
    const durationSec = durationFromWords ?? clip.duration ?? 30;

    waitUntil(
      remotionRenderService
        .renderClipAndWait({
          segments: [{ type: "heygen", src: heygenVideoUrl, startFrom: 0, duration: durationSec, offsetFrom: 0 }],
          wordTimings,
          captionStyle: "KARAOKE",
          totalDurationSec: durationSec,
        })
        .then(async (outputUrl) => {
          await db.repurposedClip.update({
            where: { id: clipId },
            data: { storagePath: outputUrl, status: "READY" },
          });
          console.log(`[test/heygen-simulate] Clip ${clipId} → READY: ${outputUrl}`);
        })
        .catch(async (err) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[test/heygen-simulate] Render failed for clip ${clipId}:`, errMsg);
          const existingMeta = (clip.metadata as Record<string, unknown> | null) ?? {};
          await db.repurposedClip.update({
            where: { id: clipId },
            data: { status: "FAILED", metadata: { ...existingMeta, renderError: errMsg } },
          });
        })
    );

    return ok("heygen-simulate", {
      clipId,
      heygenVideoUrl,
      durationSec,
      wordTimingCount: wordTimings.length,
      warningIfNoWordTimings: wordTimings.length === 0 ? "⚠️  No wordTimings in clip metadata — captions will be empty" : undefined,
      message: `Remotion render queued ✅ — poll with: stage=db-clip&clipId=${clipId}`,
    });
  }

  // ── hook-tts — test ElevenLabs TTS with a hook string ──────────────────────
  // Generates audio for a hook phrase using the cloned voice (or default voice).
  // Returns the audio URL and word timings — no DB writes, no HeyGen calls.
  if (stage === "hook-tts") {
    const hookText = url.searchParams.get("hookText") ?? "";
    if (!hookText) {
      return NextResponse.json({
        error: "hookText param required",
        example: "?stage=hook-tts&hookText=Nobody+mentions+this",
        availableHooks: [
          "Nobody mentions this",
          "I wish I knew this earlier",
          "Pause for a second",
          "Ever notice this pattern",
          "Here's the real truth",
          "Let me save you hours",
          "This may surprise you",
          "You need this now",
          "You may not agree with this",
          "I just figured this out",
        ],
      }, { status: 400 });
    }

    const voiceId = url.searchParams.get("voiceId") ?? process.env.ELEVENLABS_VOICE_ID ?? "";
    if (!voiceId) {
      return NextResponse.json({ error: "voiceId param required (or set ELEVENLABS_VOICE_ID env var)" }, { status: 400 });
    }

    try {
      const { url: audioUrl, wordTimings } = await generateAndUploadVoiceover(
        hookText,
        voiceId,
        `hook-test-${Date.now()}`,
      );
      const hookDurationSec = wordTimings.length > 0
        ? wordTimings[wordTimings.length - 1].end + 0.5
        : null;
      return ok("hook-tts", {
        hookText,
        voiceId,
        audioUrl,
        wordTimingCount: wordTimings.length,
        hookDurationSec,
        wordTimings,
        message: "✅ Hook TTS generated. Use audioUrl + a face video to test HeyGen lipsync.",
      });
    } catch (err) {
      return fail("hook-tts", err);
    }
  }

  // ── hybrid-render-simulate — test 2-segment Remotion render (hook + original) ─
  // Simulates the hybrid HeyGen webhook path without running the full pipeline.
  // Requires a clip that has isHybridWithOriginal in reelScript and hookWordTimings in metadata.
  // Pass heygenVideoUrl = the hook face video URL from HeyGen (or any short face video for testing).
  if (stage === "hybrid-render-simulate") {
    const clipId = url.searchParams.get("clipId") ?? "";
    const heygenVideoUrl = url.searchParams.get("heygenVideoUrl") ?? "";

    if (!clipId || !heygenVideoUrl) {
      return NextResponse.json({
        error: "clipId and heygenVideoUrl params required",
        example: "?stage=hybrid-render-simulate&clipId=<id>&heygenVideoUrl=https://...mp4",
        note: "Clip must have isHybridWithOriginal:true in reelScript + hookWordTimings in metadata",
      }, { status: 400 });
    }

    const clip = await db.repurposedClip.findUnique({ where: { id: clipId } });
    if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

    const reelScriptData = (clip.reelScript as Record<string, unknown> | null) ?? {};
    if (!reelScriptData.isHybridWithOriginal) {
      return NextResponse.json({
        error: "Clip is not a hybrid clip (missing isHybridWithOriginal:true in reelScript)",
        reelScript: reelScriptData,
      }, { status: 400 });
    }

    const meta = (clip.metadata as Record<string, unknown> | null) ?? {};
    const hookWordTimings = (meta.hookWordTimings as Array<{ word: string; start: number; end: number }>) ?? [];
    const originalWordTimings = (reelScriptData.originalWordTimings as Array<{ word: string; start: number; end: number }>) ?? [];
    const originalStart = reelScriptData.originalStart as number ?? 0;
    const originalEnd = reelScriptData.originalEnd as number ?? 0;
    const originalSrc = reelScriptData.originalSrc as string;

    if (!originalSrc) {
      return NextResponse.json({ error: "reelScript.originalSrc is missing" }, { status: 400 });
    }

    const hookDurationSec = hookWordTimings.length > 0
      ? hookWordTimings[hookWordTimings.length - 1].end + 0.5
      : 3;
    const originalDurationSec = Math.max(1, originalEnd - originalStart);
    const totalDurationSec = hookDurationSec + originalDurationSec;

    const offsetOriginalTimings = originalWordTimings.map((w) => ({
      ...w,
      start: parseFloat((w.start + hookDurationSec).toFixed(3)),
      end: parseFloat((w.end + hookDurationSec).toFixed(3)),
    }));
    const combinedWordTimings = [...hookWordTimings, ...offsetOriginalTimings];

    await db.repurposedClip.update({ where: { id: clipId }, data: { status: "PROCESSING" } });

    waitUntil(
      remotionRenderService
        .renderClipAndWait({
          segments: [
            { type: "heygen", src: heygenVideoUrl, startFrom: 0, duration: hookDurationSec, offsetFrom: 0 },
            { type: "original", src: originalSrc, startFrom: originalStart, duration: originalDurationSec, offsetFrom: hookDurationSec },
          ],
          wordTimings: combinedWordTimings,
          captionStyle: "KARAOKE",
          totalDurationSec,
        })
        .then(async (outputUrl) => {
          await db.repurposedClip.update({
            where: { id: clipId },
            data: { storagePath: outputUrl, status: "READY" },
          });
          console.log(`[test/hybrid-render-simulate] Clip ${clipId} → READY: ${outputUrl}`);
        })
        .catch(async (err) => {
          console.error(`[test/hybrid-render-simulate] Render failed for clip ${clipId}:`, err);
          await db.repurposedClip.update({ where: { id: clipId }, data: { status: "FAILED" } });
        })
    );

    return ok("hybrid-render-simulate", {
      clipId,
      heygenVideoUrl,
      hookDurationSec,
      originalStart,
      originalEnd,
      originalDurationSec,
      totalDurationSec,
      hookWords: hookWordTimings.length,
      originalWords: originalWordTimings.length,
      combinedWords: combinedWordTimings.length,
      message: `✅ 2-segment Remotion render queued — poll with: stage=db-clip&clipId=${clipId}`,
    });
  }

  // ── unknown stage ───────────────────────────────────────────────────────────
  return NextResponse.json({
    error: `Unknown stage: "${stage}"`,
    availableStages: [
      "db-video                — inspect DB video record + clips (no external calls) [?videoId=]",
      "db-clip                 — inspect a single clip (status, wordTimings, storagePath) [?clipId=]",
      "rotation                — detect rotation angle from video [?videoId=]",
      "voice-clone             — clone voice via ElevenLabs ⚠️ creates real voice [?videoId=]",
      "tts                     — generate TTS audio [?voiceId=...&script=...]",
      "hook-tts                — test hook phrase TTS (no HeyGen, no DB) [?hookText=...&voiceId=...]",
      "transcription           — submit video to AssemblyAI (async) [?videoId=]",
      "remotion                — submit a test Remotion render (returns renderId) [?videoUrl=...&durationSec=5]",
      "remotion-poll           — check Remotion render progress [?renderId=...&bucket=...]",
      "rerender-clip           — re-render a clip with correct duration from word timings [?clipId=]",
      "heygen-simulate         — simulate HeyGen webhook → triggers Remotion render [?clipId=...&heygenVideoUrl=...]",
      "hybrid-render-simulate  — test 2-segment Remotion render (hook face + original footage) [?clipId=...&heygenVideoUrl=...]",
      "shotstack               — submit a Shotstack trim render [?start=0&end=10&rotation=0]",
      "shotstack-poll          — check Shotstack render status [?renderId=...]",
      "reap                    — submit captions to Reap [?videoUrl=...]",
      "heygen                  — submit lipsync to HeyGen ⚠️ costs credits [?faceVideoUrl=...&audioUrl=...]",
    ],
    usage: "GET /api/test/pipeline?secret=<TEST_SECRET>&stage=<stage>",
  }, { status: 400 });
}
