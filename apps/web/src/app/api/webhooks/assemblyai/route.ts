import { db } from "@contentforge/db";
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface AssemblyAIWord {
  start: number; // ms
  end: number;   // ms
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

interface SelectedSegment {
  type: "hook" | "value";
  start: number; // seconds
  end: number;   // seconds
  title: string;
  hook: string;
  score: number;
}

async function selectViralMoments(
  transcriptText: string,
  words: AssemblyAIWord[]
): Promise<SelectedSegment[]> {
  // Build timed transcript: one line per ~8 words with start timestamp
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += 8) {
    const chunk = words.slice(i, i + 8);
    const startSec = (chunk[0].start / 1000).toFixed(1);
    lines.push(`[${startSec}s] ${chunk.map((w) => w.text).join(" ")}`);
  }

  const systemPrompt = `You are a viral short-form video strategist specializing in TikTok/Reels algorithm optimization in 2026.

The algorithm rewards: completion rate (most important) → replays/loops → shares + saves.

Given a transcript with timestamps, find the best MICRO-MOMENTS for viral short clips.

## Format 1: VIRAL HOOKS (6–10 seconds each) — find 3
Single punchy statements that STOP THE SCROLL. Target 8 seconds.
Algorithm: 6-10s clips get 120-200% watch rate because they loop automatically.
Look for:
- Contrarian takes: "Stop doing X if you want Y"
- Strong claims: "Most people don't realize this..."
- Curiosity gaps: "This is exactly why you're failing at..."
- Pattern interrupts: surprising, counterintuitive, bold
- LOOP TRIGGER: last line flows naturally back to first line

## Format 2: VALUE CLIPS (12–20 seconds each) — find 3
Quick setup + payoff. Builds authority, drives saves. Target 15 seconds.
Look for:
- Problem + solution delivered in one breath
- Specific actionable tip with a stated result
- Counterintuitive insight + brief explanation
- Ends with a memorable, quotable, saveable line

CRITICAL RULES:
- start/end MUST land on COMPLETE sentence boundaries (never cut mid-sentence)
- Hooks: 6–10 seconds ONLY
- Value clips: 12–20 seconds ONLY
- Every clip must make 100% sense with ZERO context from the full video
- Hook clips must feel loopable — viewer watches it twice without realizing

Return ONLY valid JSON array, no markdown:
[
  {
    "type": "hook",
    "start": <seconds_float>,
    "end": <seconds_float>,
    "title": "<punchy 4-6 word title>",
    "hook": "<exact opening line>",
    "score": <0-100>
  }
]`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.3,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: lines.join("\n") },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "[]";
  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  const moments = JSON.parse(cleaned) as SelectedSegment[];

  const hooks = moments
    .filter((m) => m.type === "hook" && m.end - m.start >= 5 && m.end - m.start <= 12)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const valueClips = moments
    .filter((m) => m.type === "value" && m.end - m.start >= 10 && m.end - m.start <= 22)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return [...hooks, ...valueClips];
}

async function submitShotstackTrim(
  videoUrl: string,
  startSec: number,
  durationSec: number,
  callbackUrl: string
): Promise<string> {
  const res = await fetch("https://api.shotstack.io/v1/render", {
    method: "POST",
    headers: {
      "x-api-key": process.env.SHOTSTACK_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeline: {
        tracks: [
          {
            clips: [
              {
                asset: { type: "video", src: videoUrl, trim: startSec },
                start: 0,
                length: durationSec,
                scale: 1,
              },
            ],
          },
        ],
      },
      output: {
        format: "mp4",
        resolution: "sd",
        fps: 30,
      },
      callback: callbackUrl,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Shotstack trim render failed: ${err}`);
  }

  const data = (await res.json()) as { response: { id: string } };
  return data.response.id;
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");

  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  const payload = (await req.json()) as AssemblyAIWebhookPayload;
  console.log(
    `[assemblyai] webhook video=${videoId} status=${payload.status} id=${payload.transcript_id}`
  );

  if (payload.status === "error") {
    console.error(`[assemblyai] transcription error for video=${videoId}`);
    await db.uploadedVideo.update({ where: { id: videoId }, data: { status: "READY" } });
    return NextResponse.json({ ok: true });
  }

  if (payload.status !== "completed") {
    return NextResponse.json({ ok: true });
  }

  const video = await db.uploadedVideo.findUnique({ where: { id: videoId } });
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  // Idempotency: skip if clips are already being processed
  const existingClips = await db.repurposedClip.count({ where: { videoId } });
  if (existingClips > 0) {
    console.log(`[assemblyai] video=${videoId} already has ${existingClips} clips, skipping`);
    return NextResponse.json({ ok: true });
  }

  // Fetch full transcript with word-level timestamps from AssemblyAI
  const apiKey = process.env.ASSEMBLYAI_API_KEY!;
  const transcriptRes = await fetch(
    `https://api.assemblyai.com/v2/transcript/${payload.transcript_id}`,
    { headers: { authorization: apiKey } }
  );

  if (!transcriptRes.ok) {
    console.error(`[assemblyai] failed to fetch transcript ${payload.transcript_id}`);
    await db.uploadedVideo.update({ where: { id: videoId }, data: { status: "READY" } });
    return NextResponse.json({ ok: true });
  }

  const transcript = (await transcriptRes.json()) as AssemblyAITranscript;

  await db.uploadedVideo.update({
    where: { id: videoId },
    data: { transcript: transcript.text ?? null },
  });

  if (!transcript.text || !transcript.words?.length) {
    console.warn(`[assemblyai] no transcript text/words for video=${videoId}`);
    await db.uploadedVideo.update({ where: { id: videoId }, data: { status: "READY" } });
    return NextResponse.json({ ok: true });
  }

  // GPT selects 3 viral hooks (6-10s) + 3 value clips (12-20s)
  let segments: SelectedSegment[];
  try {
    segments = await selectViralMoments(transcript.text, transcript.words);
    console.log(
      `[assemblyai] GPT selected ${segments.length} micro-moments for video=${videoId}: ${segments.filter(s => s.type === 'hook').length} hooks, ${segments.filter(s => s.type === 'value').length} value clips`
    );
  } catch (err) {
    console.error(`[assemblyai] GPT segment selection failed for video=${videoId}:`, err);
    await db.uploadedVideo.update({ where: { id: videoId }, data: { status: "READY" } });
    return NextResponse.json({ ok: true });
  }

  if (!segments.length) {
    console.warn(`[assemblyai] no viable segments found for video=${videoId}`);
    await db.uploadedVideo.update({ where: { id: videoId }, data: { status: "READY" } });
    return NextResponse.json({ ok: true });
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://contentforge-web-nine.vercel.app";

  let submitted = 0;
  for (const seg of segments) {
    const durationSec = Math.round(seg.end - seg.start);
    try {
      // Create PROCESSING clip record — Shotstack render ID stored later
      const clip = await db.repurposedClip.create({
        data: {
          videoId,
          title: seg.title,
          duration: durationSec,
          startTime: Math.round(seg.start),
          endTime: Math.round(seg.end),
          status: "PROCESSING",
          hashtags: [seg.type], // "hook" or "value" — used for UI badge
        },
      });

      // Submit Shotstack trim-only render (no composition, just cuts at timestamps)
      const renderId = await submitShotstackTrim(
        video.storagePath,
        seg.start,
        durationSec,
        `${appUrl}/api/webhooks/shotstack?clipId=${clip.id}`
      );

      // Store Shotstack render ID so the callback can find this clip
      await db.repurposedClip.update({
        where: { id: clip.id },
        data: { opusClipId: renderId },
      });

      console.log(
        `[assemblyai] clip=${clip.id} "${seg.title}" (score=${seg.score}) → Shotstack renderId=${renderId}`
      );
      submitted++;
    } catch (err) {
      console.error(
        `[assemblyai] failed to submit segment "${seg.title}" for video=${videoId}:`,
        err
      );
    }
  }

  console.log(
    `[assemblyai] video=${videoId}: ${submitted}/${segments.length} Shotstack trim renders submitted`
  );
  return NextResponse.json({ ok: true, submitted });
}
