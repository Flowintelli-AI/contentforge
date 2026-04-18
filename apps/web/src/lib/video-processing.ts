import OpenAI from "openai";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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
}

export interface WordTiming {
  word: string;
  start: number; // seconds into the voiceover audio
  end: number;
}

export interface VoiceoverResult {
  url: string;
  wordTimings: WordTiming[];
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

  console.log(`[clone-voice] Downloading video for ${videoId}...`);
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error(`Failed to fetch video: ${videoRes.status}`);

  const videoBuffer = await videoRes.arrayBuffer();
  const fileSizeMB = videoBuffer.byteLength / 1024 / 1024;
  console.log(`[clone-voice] Video size: ${fileSizeMB.toFixed(1)} MB`);

  const form = new FormData();
  form.append("name", `Speaker-${videoId.slice(-8)}`);
  form.append("description", "Auto-cloned via ContentForge");
  form.append("remove_background_noise", "true");
  // Always use .mp4 extension — ElevenLabs rejects .mpeg4, .mpeg, etc.
  form.append(
    "files",
    new Blob([videoBuffer], { type: "video/mp4" }),
    "video.mp4"
  );

  console.log(`[clone-voice] Submitting to ElevenLabs IVC...`);
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

  console.log(`[voiceover] ✅ Uploaded: ${url} (${wordTimings.length} words timed)`);
  return { url, wordTimings };
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
 * Builds word-group captions using precise ElevenLabs character-level timing.
 * Groups words into 3-word phrases with accurate start/end times.
 * Alternates white and yellow text for visual rhythm.
 * Style: Impact font with black outline — the standard viral reel look.
 */
function buildCaptionTrack(wordTimings: WordTiming[], duration: number) {
  if (!wordTimings.length) return [];

  const WORDS_PER_GROUP = 3;
  const MIN_DISPLAY = 0.25; // seconds — floor so very fast words still show

  const captions = [];
  for (let i = 0; i < wordTimings.length; i += WORDS_PER_GROUP) {
    const group = wordTimings.slice(i, i + WORDS_PER_GROUP);
    const text = group.map((w) => w.word).join(" ").toUpperCase();
    const start = group[0].start;
    const end = Math.min(group[group.length - 1].end, duration);
    const length = Math.max(end - start, MIN_DISPLAY);

    const groupIndex = Math.floor(i / WORDS_PER_GROUP);
    const totalGroups = Math.ceil(wordTimings.length / WORDS_PER_GROUP);
    const isYellow = groupIndex % 3 === 2 || groupIndex === totalGroups - 1;
    const color = isYellow ? "#FFE135" : "#FFFFFF";

    captions.push({
      asset: {
        type: "html",
        html: `<p style="font-family:Impact,'Arial Black',sans-serif;font-size:92px;font-weight:900;color:${color};-webkit-text-stroke:5px #000000;text-align:center;padding:0 48px;line-height:1.1;letter-spacing:2px;margin:0;word-break:break-word;">${escapeHtml(text)}</p>`,
        width: 1080,
        height: 220,
        background: "transparent",
      },
      start,
      length,
      position: "bottom",
      offset: { x: 0, y: 0.12 },
      transition: { in: "fade", out: "fade" },
    });
  }

  return captions;
}

/**
 * Submits a Shotstack render for a single vertical reel clip.
 *
 * Audio strategy:
 * - If voiceoverUrl present: video audio = MUTED (volume 0), voiceover = primary audio via soundtrack
 * - If no voiceover: original video audio plays normally at full volume
 */
export async function submitShotstackRender(
  videoUrl: string,
  segment: VideoSegment,
  webhookUrl: string,
  voiceoverUrl?: string,
  wordTimings?: WordTiming[]
): Promise<string> {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  if (!apiKey) throw new Error("SHOTSTACK_API_KEY is not set");

  const env = process.env.SHOTSTACK_ENV ?? "stage";
  const duration = Math.min(
    27,
    Math.max(20, segment.endTime - segment.startTime)
  );

  const captionClips = wordTimings?.length
    ? buildCaptionTrack(wordTimings, duration)
    : [];

  const edit: Record<string, unknown> = {
    timeline: {
      tracks: [
        // Track 0 (top): captions
        { clips: captionClips },
        // Track 1 (bottom): source video, audio completely off when voiceover is handling it
        {
          clips: [
            {
              asset: {
                type: "video",
                src: videoUrl,
                trim: segment.startTime,
                // KEY FIX: volume 0 = completely silent so voiceover is the ONLY voice
                volume: voiceoverUrl ? 0 : 1.0,
              },
              start: 0,
              length: duration,
              fit: "cover",
              scale: 0,
            },
          ],
        },
      ],
      // Voiceover as the primary audio; plays exclusively (video audio is 0)
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
    `[shotstack] Submitting render: ${segment.format} | ${duration}s | voiceover=${!!voiceoverUrl}`
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
