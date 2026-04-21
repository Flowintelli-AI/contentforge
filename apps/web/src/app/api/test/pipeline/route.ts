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
import { db } from "@contentforge/db";
import { detectVideoRotation, cloneVoiceFromVideo, generateAndUploadVoiceover } from "@/lib/video-processing";
import { reapService } from "@/lib/integrations/reap/service";
import { heyGenService } from "@/lib/integrations/heygen/service";

export const maxDuration = 60;

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
    if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });
    const video = await fetchVideoRecord(videoId);
    if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ASSEMBLYAI_API_KEY not set" }, { status: 500 });

    try {
      const res = await fetch("https://api.assemblyai.com/v2/transcript", {
        method: "POST",
        headers: { authorization: apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          audio_url: video.storagePath,
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
        videoUrl: video.storagePath,
        pollUrl: `https://api.assemblyai.com/v2/transcript/${id}`,
        note: "Transcription is async — check AssemblyAI dashboard or poll the URL above. Usually takes 2-5 min.",
      });
    } catch (err) {
      return fail("transcription", err);
    }
  }

  // ── shotstack ───────────────────────────────────────────────────────────────
  if (stage === "shotstack") {
    if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });
    const video = await fetchVideoRecord(videoId);
    if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

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
              asset: { type: "video", src: video.storagePath, trim: startSec },
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
        videoUrl: video.storagePath,
        params: { startSec, endSec, rotation },
        pollUrl: `https://api.shotstack.io/${env}/render/${data.response.id}`,
        note: "Render is async — check Shotstack dashboard or poll the URL above.",
      });
    } catch (err) {
      return fail("shotstack", err);
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

  // ── unknown stage ───────────────────────────────────────────────────────────
  return NextResponse.json({
    error: `Unknown stage: "${stage}"`,
    availableStages: [
      "db-video    — inspect DB record (no external calls)",
      "rotation    — detect rotation angle from video",
      "voice-clone — clone voice via ElevenLabs (⚠️ creates real voice)",
      "tts         — generate TTS audio (?voiceId=... &script=...)",
      "transcription — submit to AssemblyAI (async)",
      "shotstack   — submit a trim render (?start=0&end=10&rotation=0)",
      "reap        — submit captions (?videoUrl=https://...)",
      "heygen      — submit lipsync (?faceVideoUrl=...&audioUrl=...) (⚠️ costs credits)",
    ],
    usage: "Add ?secret=<TEST_SECRET>&stage=<stage>&videoId=<id> to the URL",
  }, { status: 400 });
}
