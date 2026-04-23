import OpenAI from "openai";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { execFile } from "child_process";
import { promisify } from "util";
import { createReadStream, createWriteStream, existsSync } from "fs";
import { unlink, chmod } from "fs/promises";
import { pipeline } from "stream/promises";
import * as path from "path";
import { db } from "@contentforge/db";

// Path where we cache a downloaded ffmpeg binary in /tmp (persists across warm invocations)
const TMP_FFMPEG = "/tmp/ffmpeg-bin";

let ffmpegBin: string | null = null;
try {
  // eslint-disable-next-line no-eval
  ffmpegBin = eval('require')('ffmpeg-static') as string;
} catch {}

/**
 * Resolves the ffmpeg binary path.
 * Priority:
 *   1. ffmpeg-static from node_modules (works locally, may work on Vercel if tracing picks it up)
 *   2. /tmp/ffmpeg-bin cached from a previous cold-start download
 *   3. Download from FFMPEG_BINARY_URL env var into /tmp/ffmpeg-bin
 *
 * Throws if no binary can be resolved — we do NOT silently fall back to sending
 * a 5-minute source video to HeyGen (that costs $2/min in Speed mode).
 */
async function resolveFfmpegBin(): Promise<string> {
  // 1. From node_modules (local dev or if Vercel tracing worked)
  if (ffmpegBin && existsSync(ffmpegBin)) {
    return ffmpegBin;
  }

  // 2. Already downloaded in this lambda instance's /tmp
  if (existsSync(TMP_FFMPEG)) {
    return TMP_FFMPEG;
  }

  // 3. Download from FFMPEG_BINARY_URL
  const binaryUrl = process.env.FFMPEG_BINARY_URL?.trim();
  if (!binaryUrl) {
    throw new Error(
      "[video-trim] ffmpeg-static not found and FFMPEG_BINARY_URL is not set. " +
      "Upload a Linux x64 ffmpeg binary to R2 and set FFMPEG_BINARY_URL in Vercel env vars."
    );
  }

  console.log(`[video-trim] Downloading ffmpeg binary from ${binaryUrl} ...`);
  const res = await fetch(binaryUrl);
  if (!res.ok || !res.body) {
    throw new Error(`[video-trim] Failed to download ffmpeg binary: HTTP ${res.status}`);
  }
  await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(TMP_FFMPEG));
  await chmod(TMP_FFMPEG, 0o755);
  console.log("[video-trim] ✅ ffmpeg binary downloaded and ready at", TMP_FFMPEG);
  return TMP_FFMPEG;
}

const execFileAsync = promisify(execFile);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});
const R2_BUCKET = "contentforge-videos";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContentFormat =
  | "jabber"
  | "ranking"
  | "man-on-the-street"
  | "clone"
  | "day-in-the-life"
  | "storytelling"
  | "screen"
  | "reactions"
  | "whiteboard"
  | "split-screen";

export interface ReelScript {
  hook: string;
  painPoint: string;
  authority: string;
  solution: string;
  cta: string;
  narrationScript: string; // ~75-85 words = ~25 seconds voiced
}

export interface VideoSegment {
  title: string;
  format: ContentFormat;
  reelScript: ReelScript;
  startTime: number;
  endTime: number;
  transcript: string;
  brollKeywords: string[]; // 3-5 keywords for Pexels B-roll search
}

export interface WordTiming {
  word: string;
  start: number; // seconds into the voiceover audio
  end: number;
}

export interface VoiceoverResult {
  url: string;
  wordTimings: WordTiming[];
  /** Exact audio duration in seconds — use this for face video trim, not wordTimings.at(-1).end */
  audioDurationSec: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── AssemblyAI ───────────────────────────────────────────────────────────────

export async function submitTranscriptionJob(
  videoUrl: string,
  webhookUrl: string
): Promise<string> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY is not set");

  const res = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: {
      authorization: apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      audio_url: videoUrl,
      punctuate: true,
      format_text: true,
      word_boost: [],
      webhook_url: webhookUrl,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AssemblyAI submit error ${res.status}: ${err}`);
  }

  const { id } = (await res.json()) as { id: string };
  return id;
}

// ─── ElevenLabs ───────────────────────────────────────────────────────────────

/**
 * Clones the speaker's voice from the uploaded video.
 *
 * IMPORTANT: ElevenLabs only accepts these extensions: mp3, wav, ogg, flac,
 * m4a, opus, aac, mp4, mov, webm, mkv. We always upload as "video.mp4"
 * regardless of the original file extension (fixes the .mpeg4 rejection).
 */
export async function cloneVoiceFromVideo(
  videoUrl: string,
  videoId: string
): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  // Before cloning, ensure we have capacity. If at limit, prune oldest Speaker- voices.
  await pruneElevenLabsVoicesIfNeeded(apiKey);

  // ElevenLabs IVC rejects files > 11 MB. Full phone videos are typically 30-100 MB.
  // Fix: use ffmpeg to extract the first 30 s of audio as MP3 (~480 KB) and send that.
  const bin = await resolveFfmpegBin();
  const inputPath = path.join("/tmp", `${videoId}-voice-input.mp4`);
  const audioPath = path.join("/tmp", `${videoId}-voice-sample.mp3`);

  try {
    console.log(`[clone-voice] Downloading video for ${videoId}...`);
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`Failed to fetch video: ${videoRes.status}`);
    if (!videoRes.body) throw new Error("Video response has no body");
    await pipeline(videoRes.body as unknown as NodeJS.ReadableStream, createWriteStream(inputPath));

    console.log(`[clone-voice] Extracting 30s audio sample with ffmpeg...`);
    // -vn = no video, -t 30 = first 30 s, -q:a 4 = ~128kbps VBR MP3
    await execFileAsync(bin, [
      "-i", inputPath,
      "-vn", "-t", "30", "-q:a", "4",
      "-y", audioPath,
    ]);

    const { readFile } = await import("fs/promises");
    const audioBuffer = await readFile(audioPath);
    const audioSizeMB = audioBuffer.length / 1024 / 1024;
    console.log(`[clone-voice] Audio sample size: ${audioSizeMB.toFixed(2)} MB`);

    const audioFile = new File([audioBuffer], "voice_sample.mp3", { type: "audio/mpeg" });

    const form = new FormData();
    form.append("name", `Speaker-${videoId.slice(-8)}`);
    form.append("description", "Auto-cloned via ContentForge");
    form.append("remove_background_noise", "true");
    form.append("files", audioFile);

    console.log(`[clone-voice] Submitting ${audioSizeMB.toFixed(2)} MB to ElevenLabs IVC...`);
    const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });

    const responseText = await res.text();
    if (!res.ok) {
      throw new Error(
        `ElevenLabs voice clone failed (${res.status}): ${responseText}`
      );
    }

    const { voice_id } = JSON.parse(responseText) as { voice_id: string };
    console.log(`[clone-voice] ✅ Voice cloned successfully: ${voice_id}`);
    return voice_id;
  } finally {
    await Promise.allSettled([unlink(inputPath), unlink(audioPath)]);
  }
}

/**
 * Deletes old "Speaker-" voices (auto-cloned by ContentForge) when at or near the 30-voice limit.
 * Keeps voices that are still referenced in the DB. Deletes oldest first.
 */
async function pruneElevenLabsVoicesIfNeeded(apiKey: string): Promise<void> {
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
    });
    if (!res.ok) return;
    const { voices } = (await res.json()) as { voices: Array<{ voice_id: string; name: string; created_at_unix: number }> };

    // Only auto-cloned voices are candidates for deletion
    const autoVoices = voices
      .filter(v => v.name.startsWith("Speaker-"))
      .sort((a, b) => (a.created_at_unix ?? 0) - (b.created_at_unix ?? 0)); // oldest first

    if (voices.length < 28) return; // plenty of space, nothing to prune

    // Find which voice IDs are still in active use in the DB
    const activeIds = await db.uploadedVideo
      .findMany({ where: { clonedVoiceId: { not: null } }, select: { clonedVoiceId: true } })
      .then(rows => new Set(rows.map(r => r.clonedVoiceId!)));

    // Delete oldest Speaker- voices that aren't actively used, until we have 2 free slots
    const needed = voices.length - 28; // how many to delete to get to ≤28
    let deleted = 0;
    for (const v of autoVoices) {
      if (deleted >= needed) break;
      if (activeIds.has(v.voice_id)) continue; // skip active voices
      await fetch(`https://api.elevenlabs.io/v1/voices/${v.voice_id}`, {
        method: "DELETE",
        headers: { "xi-api-key": apiKey },
      });
      console.log(`[clone-voice] Pruned old voice ${v.voice_id} (${v.name})`);
      deleted++;
    }
  } catch (err) {
    console.warn("[clone-voice] Voice pruning failed (non-fatal):", err);
  }
}

/**
 * Converts ElevenLabs character-level alignment into word-level timings.
 */
function buildWordTimings(
  characters: string[],
  startTimes: number[],
  endTimes: number[]
): WordTiming[] {
  const timings: WordTiming[] = [];
  let wordChars = "";
  let wordStart = 0;

  for (let i = 0; i <= characters.length; i++) {
    const isLast = i === characters.length;
    const char = isLast ? " " : characters[i];

    if (char === " " || char === "\n") {
      if (wordChars.trim()) {
        timings.push({
          word: wordChars.trim(),
          start: wordStart,
          end: endTimes[i - 1],
        });
        wordChars = "";
      }
    } else {
      if (!wordChars) wordStart = startTimes[i];
      wordChars += char;
    }
  }

  return timings;
}

/**
 * Generates a voiceover using the cloned (or fallback) voice via
 * ElevenLabs /with-timestamps, which returns audio + character-level timing.
 * Uploads the MP3 to R2 and returns the URL + word-level timings for
 * perfectly synced captions.
 */
export async function generateAndUploadVoiceover(
  narrationScript: string,
  voiceId: string,
  clipKey: string
): Promise<VoiceoverResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  console.log(`[voiceover] Generating TTS for clip ${clipKey} (${narrationScript.length} chars)...`);

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        text: narrationScript,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.85,
          style: 0.2,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs TTS error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as {
    audio_base64: string;
    alignment: {
      characters: string[];
      character_start_times_seconds: number[];
      character_end_times_seconds: number[];
    };
  };

  const audioBuffer = Buffer.from(data.audio_base64, "base64");
  const key = `voiceovers/${clipKey}.mp3`;

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: audioBuffer,
      ContentType: "audio/mpeg",
    })
  );

  const url = `${process.env.R2_PUBLIC_URL}/${key}`;
  const wordTimings = buildWordTimings(
    data.alignment.characters,
    data.alignment.character_start_times_seconds,
    data.alignment.character_end_times_seconds
  );
  // Use the raw last character end time as the authoritative audio duration.
  // This is what ElevenLabs actually rendered — identical to what HeyGen will measure.
  const endTimes = data.alignment.character_end_times_seconds;
  const audioDurationSec = endTimes.length > 0 ? endTimes[endTimes.length - 1] : 0;

  console.log(`[voiceover] ✅ Uploaded: ${url} (${wordTimings.length} words, ${audioDurationSec.toFixed(3)}s)`);
  return { url, wordTimings, audioDurationSec };
}

// ─── Face-video trimmer ───────────────────────────────────────────────────────

/**
 * Downloads the source video, trims it to `durationSec` seconds using ffmpeg,
 * bakes in any EXIF rotation so HeyGen always receives a correctly-oriented
 * portrait clip, uploads to R2 `face-clips/{clipId}.mp4`, and returns the
 * public URL.
 *
 * @param rotationDeg  EXIF/device rotation in degrees (0, 90, 180, 270).
 *                     When non-zero the pixels are physically rotated via the
 *                     ffmpeg `transpose` filter so the output is always
 *                     upright — eliminating the Shotstack scale-then-rotate
 *                     zoom bug.
 */
export async function trimAndUploadFaceVideo(
  sourceVideoUrl: string,
  clipId: string,
  durationSec: number,
  rotationDeg = 0,
): Promise<string> {
  // Resolve binary — throws if unavailable (no silent fallback; full video = expensive HeyGen bill)
  const bin = await resolveFfmpegBin();

  // Trim to exact audio duration — HeyGen rejects if video/audio differ by >15%.
  // No buffer: face video must precisely match the TTS audio length.
  const trimSec = durationSec;
  const tmpDir = "/tmp";
  const inputPath = path.join(tmpDir, `${clipId}-input.mp4`);
  const outputPath = path.join(tmpDir, `${clipId}-trimmed.mp4`);

  try {
    // Download source video to /tmp
    console.log(`[video-trim] Downloading source video (trim=${trimSec}s, rotation=${rotationDeg}°)...`);
    const res = await fetch(sourceVideoUrl);
    if (!res.ok || !res.body) throw new Error(`Failed to fetch source video: ${res.status}`);
    await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(inputPath));

    // For rotated videos: ffmpeg auto-rotates decoded frames by default (autorotate=1).
    // We rely on that behavior — no explicit -vf transpose needed. Re-encoding with
    // libx264 bakes the correctly-oriented pixels into the output. We then zero out
    // the residual rotate tag so HeyGen/Remotion don't double-rotate.
    // Keep audio (-c:a copy) — HeyGen requires an audio track even though it replaces it.
    const ffmpegArgs: string[] = rotationDeg !== 0
      ? [
          "-i", inputPath,
          "-t", String(trimSec),
          "-c:v", "libx264",
          "-preset", "fast",
          "-crf", "23",
          "-c:a", "copy",
          "-metadata:s:v:0", "rotate=0",
          "-y", outputPath,
        ]
      : [
          "-i", inputPath,
          "-t", String(trimSec),
          "-c:v", "copy",
          "-c:a", "copy",
          "-avoid_negative_ts", "make_zero",
          "-y", outputPath,
        ];

    await execFileAsync(bin, ffmpegArgs);

    // Upload trimmed video to R2
    const key = `face-clips/${clipId}.mp4`;
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: createReadStream(outputPath),
      ContentType: "video/mp4",
    }));

    const url = `${process.env.R2_PUBLIC_URL}/${key}`;
    console.log(`[video-trim] ✅ Trimmed to ${trimSec}s (rotation=${rotationDeg}°) → ${url}`);
    return url;
  } finally {
    await Promise.allSettled([unlink(inputPath), unlink(outputPath)]);
  }
}

/** Maps a device rotation angle to the correct ffmpeg transpose filter string. */
function transposeFilter(rotationDeg: number): string {
  switch (rotationDeg) {
    case 90:  return "transpose=1"; // 90° CW (most Samsung portrait videos)
    case 180: return "vflip,hflip";
    case 270: return "transpose=2"; // 90° CCW
    default:  return "transpose=1"; // fallback
  }
}

// ─── Pexels B-roll ────────────────────────────────────────────────────────────

interface PexelsVideo {
  duration: number;
  video_files: Array<{ quality: string; width: number; height: number; link: string }>;
}

// Minimum quality score (0-10) required to include B-roll in the render.
// Below this threshold the speaker-face-only composition looks cleaner.
const BROLL_QUALITY_THRESHOLD = 7;

/**
 * Scores a Pexels video result on a 0-10 scale.
 *
 * Scoring rubric:
 *   Position in results (max 5): 1st=5, 2nd=4, 3rd=3, 4th=2, 5th+=1
 *   Quality  (max 2):            HD=2,  SD=1,  other=0
 *   Orientation (max 2):         portrait=2, landscape=0
 *   Duration  (max 1):           >= minDuration=1, else 0
 */
function scoreBrollVideo(
  video: PexelsVideo,
  positionIndex: number,
  minDurationSeconds: number
): { file: PexelsVideo["video_files"][0] | null; score: number } {
  const bestFile =
    video.video_files
      .filter((f) => f.height > f.width)
      .sort((a, b) => {
        const q = (s: string) => (s === "hd" ? 2 : s === "sd" ? 1 : 0);
        return q(b.quality) - q(a.quality);
      })[0] ??
    video.video_files.sort((a, b) => b.width - a.width)[0] ??
    null;

  if (!bestFile) return { file: null, score: 0 };

  const posScore = Math.max(0, 5 - positionIndex);   // 5→1 by rank
  const qScore = bestFile.quality === "hd" ? 2 : bestFile.quality === "sd" ? 1 : 0;
  const orientScore = bestFile.height > bestFile.width ? 2 : 0;
  const durScore = video.duration >= minDurationSeconds ? 1 : 0;

  return { file: bestFile, score: posScore + qScore + orientScore + durScore };
}

/**
 * Searches Pexels for a portrait B-roll clip matching the given keywords.
 * Only returns a URL if the best matching video scores >= BROLL_QUALITY_THRESHOLD.
 * This prevents generic or low-relevance stock footage from diluting the reel.
 */
export async function fetchPexelsBroll(
  keywords: string[],
  minDurationSeconds: number
): Promise<string | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    console.warn("[broll] PEXELS_API_KEY not set — skipping B-roll");
    return null;
  }

  const query = keywords.slice(0, 3).join(" ");
  console.log(`[broll] Searching Pexels for "${query}" (min ${minDurationSeconds}s)`);

  const res = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=8&orientation=portrait&size=medium`,
    { headers: { Authorization: apiKey } }
  );

  if (!res.ok) {
    console.warn(`[broll] Pexels search failed: ${res.status}`);
    return null;
  }

  const data = (await res.json()) as { videos: PexelsVideo[] };

  for (let i = 0; i < data.videos.length; i++) {
    const video = data.videos[i];
    const { file, score } = scoreBrollVideo(video, i, minDurationSeconds);

    if (!file) continue;

    if (score < BROLL_QUALITY_THRESHOLD) {
      console.log(`[broll] Skipping video[${i}] "${query}" score=${score}/${10} (< threshold ${BROLL_QUALITY_THRESHOLD})`);
      // Still try next candidate — maybe it scores higher
      continue;
    }

    // Validate that Shotstack's rendering servers can actually reach this URL.
    // Pexels sometimes returns Vimeo CDN links that block non-browser requests.
    try {
      const headRes = await fetch(file.link, { method: "HEAD" });
      if (!headRes.ok) {
        console.warn(`[broll] URL not reachable (${headRes.status}), trying next`);
        continue;
      }
    } catch {
      console.warn("[broll] HEAD request failed, trying next");
      continue;
    }

    console.log(`[broll] ✅ Accepted: score=${score}/10 ${file.quality} ${file.width}x${file.height} pos=${i}`);
    return file.link;
  }

  console.warn(`[broll] No video met quality threshold ${BROLL_QUALITY_THRESHOLD} for "${query}" — omitting B-roll`);
  return null;
}

// ─── GPT-4o ───────────────────────────────────────────────────────────────────

export async function selectBestSegments(
  transcript: string,
  segments: { start: number; end: number; text: string }[],
  count = 10
): Promise<VideoSegment[]> {
  const MAX_TRANSCRIPT_CHARS = 80_000;
  const MAX_SEGMENTS = 500;

  const truncatedTranscript =
    transcript.length > MAX_TRANSCRIPT_CHARS
      ? transcript.slice(0, MAX_TRANSCRIPT_CHARS) + "\n[transcript truncated]"
      : transcript;

  const sampledSegments =
    segments.length > MAX_SEGMENTS
      ? segments.filter((_, i) => i % Math.ceil(segments.length / MAX_SEGMENTS) === 0)
      : segments;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          `You are a world-class viral short-form content strategist specializing in 9:16 reels.`,
          `Your job: find ${count} powerful moments in a video transcript and transform each into`,
          `a structured viral reel (20-27 seconds, spoken aloud).`,
          ``,
          `CONTENT FORMATS — pick the best one per clip, max 2 clips per format:`,
          `- jabber: energetic direct-to-camera rant/monologue, fast-paced`,
          `- ranking: "Top 3/5/7..." numbered list with punchy insights`,
          `- man-on-the-street: conversational Q&A energy, relatable reactions`,
          `- clone: call-and-response or "here's what most people think vs reality"`,
          `- day-in-the-life: sequential "first... then... finally..." narrative`,
          `- storytelling: tight narrative arc — setup / tension / payoff / lesson`,
          `- screen: tutorial / step-by-step walkthrough energy`,
          `- reactions: commentary on a surprising fact or moment from the video`,
          `- whiteboard: "3 things you need to know about X" explanation style`,
          `- split-screen: before/after or stark comparison`,
          ``,
          `REEL STRUCTURE for each clip:`,
          `- hook: 1 sentence (≤12 words) that STOPS the scroll. Make it provocative, bold, or counterintuitive.`,
          `- painPoint: 1-2 sentences on the relatable struggle the audience faces right now`,
          `- authority: 1 sentence explaining why this insight deserves their attention`,
          `- solution: 2-3 sentences with the KEY insight from the video moment — this is the value`,
          `- cta: 1 sentence with a clear specific action (save, comment, follow, DM)`,
          `- narrationScript: ALL sections woven naturally into flowing spoken prose, ≤85 words total.`,
          `  Must sound like a human speaking — NOT bullet points read aloud.`,
          `  This is what the voiceover will say. The hook must be the opening words.`,
          ``,
          `BROLL KEYWORDS:`,
          `- For each clip, provide 3-5 specific visual keywords for searching stock B-roll footage.`,
          `- Think visually: what scenes, environments, or objects would LOOK GREAT behind the narration?`,
          `- Be concrete: "busy coffee shop laptop" not "work". "hands shaking" not "anxiety". "city skyline night" not "success".`,
          ``,
          `QUALITY RULES:`,
          `- Hook must not start with "Are you", "Have you", "Do you" — too generic`,
          `- Avoid filler words: "very", "really", "actually", "just"`,
          `- Every sentence should earn its place`,
          `- The clip should feel complete and satisfying in 25 seconds`,
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Full transcript:\n${truncatedTranscript}`,
          `\nWord-level timestamps (seconds):\n${JSON.stringify(sampledSegments, null, 2)}`,
          `\nReturn EXACTLY ${count} clips as JSON. Each clip covers a UNIQUE non-overlapping moment.`,
          `Duration of each clip: between 20 and 27 seconds.`,
          ``,
          `{
  "clips": [
    {
      "title": "Punchy title ≤60 chars",
      "format": "jabber",
      "startTime": 12.3,
      "endTime": 37.1,
      "transcript": "Verbatim quote from the source video at this timestamp",
      "brollKeywords": ["busy office team meeting", "whiteboard brainstorm", "handshake deal"],
      "reelScript": {
        "hook": "Bold 1-sentence scroll-stopper (≤12 words)",
        "painPoint": "Relatable struggle 1-2 sentences",
        "authority": "Why this insight matters — 1 sentence",
        "solution": "The key value/insight from this moment — 2-3 sentences",
        "cta": "Specific action for the viewer",
        "narrationScript": "Full naturally flowing voiced script ≤85 words. Hook opens. Flows without sounding like a list."
      }
    }
  ]
}`,
        ].join("\n"),
      },
    ],
  });

  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error("GPT-4o returned empty response");

  const json = JSON.parse(content) as { clips: VideoSegment[] };
  return json.clips.slice(0, count);
}

// ─── Shotstack ────────────────────────────────────────────────────────────────

/**
 * Karaoke-style captions synced to ElevenLabs word-level timestamps.
 *
 * Groups words into "lines" of up to WORDS_PER_LINE words.
 * For each word in a line, a Shotstack clip renders the ENTIRE line with
 * the CURRENT word highlighted in yellow and all other words in white.
 * This creates the word-by-word highlight effect seen on viral TikToks.
 *
 * Transitions: only the first word in each line fades in, and only the
 * last word in each line fades out — avoids glitchy micro-fades per word.
 */
function buildCaptionTrack(wordTimings: WordTiming[], duration: number) {
  if (!wordTimings.length) return [];

  const WORDS_PER_LINE = 4; // words visible at once
  const MIN_WORD_DISPLAY = 0.08; // floor for very short words

  const clips = [];

  // Split into lines
  for (let lineStart = 0; lineStart < wordTimings.length; lineStart += WORDS_PER_LINE) {
    const lineWords = wordTimings.slice(lineStart, lineStart + WORDS_PER_LINE);

    for (let wi = 0; wi < lineWords.length; wi++) {
      const word = lineWords[wi];
      const isFirstInLine = wi === 0;
      const isLastInLine = wi === lineWords.length - 1;

      // Clip spans from this word's start to the next word's start (or end of last word)
      const start = word.start;
      const rawEnd = isLastInLine
        ? Math.min(lineWords[wi].end, duration)
        : lineWords[wi + 1].start;
      const length = Math.max(rawEnd - start, MIN_WORD_DISPLAY);

      // Build HTML: each word in the line, highlight the active one
      const wordSpans = lineWords
        .map((w, idx) => {
          const isActive = idx === wi;
          if (isActive) {
            // Active word: yellow + bold stroke + slight scale-up effect via font-size bump
            return `<span style="color:#FFE135;-webkit-text-stroke:5px #000000;font-size:108px;">${escapeHtml(w.word.toUpperCase())}</span>`;
          }
          return `<span style="color:#FFFFFF;-webkit-text-stroke:4px #000000;opacity:0.75;">${escapeHtml(w.word.toUpperCase())}</span>`;
        })
        .join(" ");

      const html = `<p style="font-family:Impact,'Arial Black',sans-serif;font-size:95px;font-weight:900;text-align:center;padding:0 40px;line-height:1.1;letter-spacing:0px;margin:0;word-break:break-word;">${wordSpans}</p>`;

      clips.push({
        asset: {
          type: "html",
          html,
          width: 1080,
          height: 260,
          background: "transparent",
        },
        start,
        length,
        position: "bottom",
        offset: { x: 0, y: 0.12 },
        ...(isFirstInLine ? { transition: { in: "fade" } } : {}),
        ...(isLastInLine ? { transition: { out: "fade" } } : {}),
      });
    }
  }

  return clips;
}

/**
 * Builds a hook text card shown at the very start of the clip (0 → 2.0s).
 * Large bold text that stops the scroll before the speaker even appears.
 * Centered, full-width — impossible to miss.
 */
function buildHookCard(hookText: string) {
  return {
    asset: {
      type: "html",
      html: `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:rgba(0,0,0,0.55);padding:60px 60px;box-sizing:border-box;"><p style="font-family:Impact,'Arial Black',sans-serif;font-size:88px;font-weight:900;color:#FFE135;-webkit-text-stroke:5px #000000;text-align:center;line-height:1.1;letter-spacing:1px;margin:0;word-break:break-word;">${escapeHtml(hookText.toUpperCase())}</p></div>`,
      width: 1080,
      height: 1920,
      background: "transparent",
    },
    start: 0,
    length: 2.0,
    position: "center",
    offset: { x: 0, y: 0 },
    transition: { in: "fade", out: "fade" },
  };
}

/**
 * Viral reel composition:
 *
 * Track 0 (top)   — captions + hook text card
 * Track 1 (mid)   — 1–2 B-roll inserts (2.5s each) mid-clip, faded in/out
 * Track 2 (base)  — speaker video, portrait-cropped via fit:cover, zoomIn hook
 *
 * Audio:
 * - Voiceover as primary soundtrack (mutes original video audio)
 * - Original video audio retained when no voiceover is available
 *
 * NOTE: scale is intentionally OMITTED — setting scale:0 makes the clip
 * invisible. fit:"cover" handles all sizing for the 1080×1920 output.
 */
export async function submitShotstackRender(
  videoUrl: string,
  segment: VideoSegment,
  webhookUrl: string,
  voiceoverUrl?: string,
  wordTimings?: WordTiming[],
  brollUrl?: string
): Promise<string> {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  if (!apiKey) throw new Error("SHOTSTACK_API_KEY is not set");

  const env = process.env.SHOTSTACK_ENV ?? "stage";

  // ─── Duration = actual voiceover audio length ─────────────────────────────
  // Use the last word's end time from ElevenLabs — this is the exact moment
  // the audio stops. The video track is trimmed to this length so the clip
  // ends exactly when the speaker finishes, not arbitrarily.
  const audioDuration = wordTimings?.length
    ? wordTimings[wordTimings.length - 1].end + 0.3 // +0.3s tail before cut
    : segment.endTime - segment.startTime;
  const duration = Math.min(60, Math.max(10, audioDuration));

  // ─── Captions + hook card ─────────────────────────────────────────────────
  const captionClips = wordTimings?.length
    ? buildCaptionTrack(wordTimings, duration)
    : [];

  // Hook card — shown for first 2s. The narration script always opens with the
  // hook phrase, so the hook card is visible while those words are being spoken.
  // Captions are NOT shifted — they run from t=0 in sync with the audio.
  // Hook card occupies center-screen; captions are at the bottom — no conflict.
  const hookText = (segment.reelScript as { hook?: string } | undefined)?.hook;
  const hookCard = hookText ? buildHookCard(hookText) : null;

  const overlayClips = hookCard
    ? [hookCard, ...captionClips]
    : captionClips;

  // ─── Track layout depends on whether a voiceover is present ─────────────────
  //
  // NO voiceover  → original creator footage as base (original audio, original face).
  //                 B-roll overlaid as short inserts (~2.5s) for visual variety.
  //
  // WITH voiceover → cloned voice narrates a NEW script; showing the creator's face
  //                  would cause lip-sync desync. B-roll fills the full duration as
  //                  the base layer instead. Speaker clip is excluded entirely.
  //
  // Rule: face = original audio only. Cloned voice = B-roll only.

  let baseClips: object[];
  let midClips: object[] = [];

  if (voiceoverUrl) {
    // ── Cloned-voice path: full B-roll base, no speaker face ──────────────────
    if (brollUrl) {
      const insertDur = Math.min(2.5, duration * 0.18);
      baseClips = [
        {
          asset: { type: "video", src: brollUrl, trim: 0, volume: 0 },
          start: 0,
          length: duration * 0.5,
          fit: "cover",
          transition: { in: "fade", out: "fade" },
        },
        {
          asset: { type: "video", src: brollUrl, trim: insertDur + 0.5, volume: 0 },
          start: duration * 0.5,
          length: duration * 0.5,
          fit: "cover",
          transition: { in: "fade", out: "fade" },
        },
      ];
    } else {
      baseClips = [
        {
          asset: { type: "color", color: "#111111" },
          start: 0,
          length: duration,
        },
      ];
    }
  } else {
    // ── Original-audio path: speaker face as base, short B-roll inserts ────────
    // Original audio: show the creator's face for the full duration — no B-roll.
    baseClips = [
      {
        asset: {
          type: "video",
          src: videoUrl,
          trim: segment.startTime,
          volume: 1.0,
        },
        start: 0,
        length: duration,
        fit: "cover",
        effect: "zoomIn",
      },
    ];
  }

  // ─── Timeline assembly ────────────────────────────────────────────────────
  const tracks = [
    { clips: overlayClips },                            // Track 0: captions + hook
    ...(midClips.length ? [{ clips: midClips }] : []), // Track 1: b-roll inserts (original-audio path only)
    { clips: baseClips },                              // Track 2: base layer
  ];

  const edit: Record<string, unknown> = {
    timeline: {
      tracks,
      ...(voiceoverUrl && {
        soundtrack: {
          src: voiceoverUrl,
          effect: "fadeOut",
          volume: 1.0,
        },
      }),
    },
    output: {
      format: "mp4",
      size: { width: 1080, height: 1920 },
      fps: 30,
      quality: "medium",
    },
    callback: webhookUrl,
  };

  console.log(
    `[shotstack] Submitting render: ${segment.format} | ${duration}s | voiceover=${!!voiceoverUrl} | broll=${!!brollUrl} | hook=${!!hookText}`
  );

  const res = await fetch(`https://api.shotstack.io/${env}/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(edit),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Shotstack render error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as { response: { id: string } };
  console.log(`[shotstack] ✅ Render queued: ${data.response.id}`);
  return data.response.id;
}

/**
 * Submits a minimal Shotstack render that trims the source video to `durationSec`.
 * Used as a pre-processing step before HeyGen lipsync — Shotstack renders the
 * short clip to a public URL, then we pass that URL to HeyGen instead of the
 * full multi-minute source video (which would be rejected for insufficient credits).
 *
 * Returns the Shotstack render ID. The webhook fires when the trimmed clip is ready.
 */
/**
 * Detects the display rotation stored in a phone MP4's tkhd atom.
 * Returns the Shotstack correction angle needed (0, 90, -90, or 180).
 * Phone portrait videos are stored as landscape with rotation=-90 → returns 90.
 * Fetches the last 2MB where the moov atom lives in non-faststart MP4s.
 */
export async function detectVideoRotation(videoUrl: string): Promise<number> {
  try {
    const headRes = await fetch(videoUrl, { method: "HEAD" });
    const contentLength = parseInt(headRes.headers.get("content-length") ?? "0", 10);
    if (!contentLength) return 0;

    // Fetch last 2MB — moov is at end for non-faststart (typical phone recordings)
    const fetchStart = Math.max(0, contentLength - 2 * 1024 * 1024);
    const rangeRes = await fetch(videoUrl, {
      headers: { Range: `bytes=${fetchStart}-${contentLength - 1}` },
    });
    const raw = new Uint8Array(await rangeRes.arrayBuffer());
    const view = new DataView(raw.buffer);

    // Search for "tkhd" (0x74 0x6B 0x68 0x64) — Track Header Box contains the rotation matrix
    for (let i = 0; i < raw.length - 80; i++) {
      if (
        raw[i] === 0x74 && raw[i + 1] === 0x6b &&
        raw[i + 2] === 0x68 && raw[i + 3] === 0x64
      ) {
        const version = raw[i + 4]; // 0 or 1
        // Matrix offset from start of "tkhd" bytes:
        // version 0: 4(type)+4(ver+flags)+4(ctime)+4(mtime)+4(trackId)+4(rsv)+4(dur)+8(rsv)+2+2+2+2 = 44
        // version 1: 4(type)+4(ver+flags)+8(ctime)+8(mtime)+4(trackId)+4(rsv)+8(dur)+8(rsv)+2+2+2+2 = 56
        const matrixOffset = i + (version === 1 ? 56 : 44);
        if (matrixOffset + 36 > raw.length) continue;

        // Matrix is 3×3 in 16.16 fixed-point (last column 2.30).
        // a=[0][0], b=[0][1], d=[1][1] determine rotation.
        const a = view.getInt32(matrixOffset, false);      // [0][0]
        const b = view.getInt32(matrixOffset + 4, false);  // [0][1]
        const d = view.getInt32(matrixOffset + 16, false); // [1][1]

        // Rotation in metadata → Shotstack correction angle:
        //  -90° stored (Samsung portrait): a=0, b=+65536, d=0 → fix with +90
        //  +90° stored (upside-down portrait): a=0, b=-65536, d=0 → fix with -90
        //  180° stored: a=-65536, b=0, d=-65536 → fix with 180
        //  no rotation: a=+65536, b=0, d=+65536 → 0
        if (a === 0 && b > 0 && d === 0) return 90;
        if (a === 0 && b < 0 && d === 0) return -90;
        if (a < 0 && b === 0 && d < 0) return 180;
        return 0;
      }
    }
    return 0;
  } catch {
    return 0; // Non-fatal — assume no rotation
  }
}

export async function trimVideoWithShotstack(
  videoUrl: string,
  durationSec: number,
  webhookUrl: string,
  musicUrl?: string,
  rotationDeg: number = 0,
  startTrimSec: number = 0,
): Promise<string> {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  if (!apiKey) throw new Error("SHOTSTACK_API_KEY is not set");

  const env = process.env.SHOTSTACK_ENV ?? "stage";

  const videoClip: Record<string, unknown> = {
    asset: { type: "video", src: videoUrl, trim: startTrimSec, volume: 1.0 },
    start: 0,
    length: durationSec,
    // For rotated clips (e.g. Samsung/Android portrait stored as landscape 1920×1080):
    // Shotstack applies fit BEFORE the rotation transform, so "cover" tries to fill
    // the portrait canvas with the landscape source — heavily cropping and distorting.
    // After a 90° rotation a 1920×1080 clip naturally fills a 1080×1920 canvas exactly,
    // so no fit scaling is needed. For non-rotated videos keep "cover" as before.
    ...(rotationDeg === 0 && { fit: "cover" }),
  };
  if (rotationDeg !== 0) {
    videoClip.transform = { rotate: { angle: rotationDeg } };
  }

  const tracks: object[] = [{ clips: [videoClip] }];

  // Mix background music at 15% volume under the creator's voice
  if (musicUrl) {
    tracks.push({
      clips: [
        {
          asset: {
            type: "audio",
            src: musicUrl,
            trim: 0,
            volume: 0.15,
            effect: "fadeOut",
          },
          start: 0,
          length: durationSec,
        },
      ],
    });
  }

  const edit = {
    timeline: { tracks },
    output: {
      format: "mp4",
      size: { width: 1080, height: 1920 },
      fps: 30,
      quality: "medium",
    },
    callback: webhookUrl,
  };

  console.log(`[shotstack] Submitting trim render: ${durationSec}s`);

  const res = await fetch(`https://api.shotstack.io/${env}/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(edit),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Shotstack trim render error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as { response: { id: string } };
  console.log(`[shotstack] ✅ Trim render queued: ${data.response.id}`);
  return data.response.id;
}
