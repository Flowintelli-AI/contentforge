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
  start: number; // seconds
  end: number;   // seconds
  title: string;
  hook: string;
  score: number;
}

async function selectViralSegments(
  transcriptText: string,
  words: AssemblyAIWord[]
): Promise<SelectedSegment[]> {
  // Build timed transcript: one line per ~10 words with start timestamp
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += 10) {
    const chunk = words.slice(i, i + 10);
    const startSec = (chunk[0].start / 1000).toFixed(1);
    lines.push(`[${startSec}s] ${chunk.map((w) => w.text).join(" ")}`);
  }

  const systemPrompt = `You are a world-class viral short-form video strategist.
Given a transcript with timestamps, identify the 3 best CONTINUOUS segments (45–75 seconds each) for standalone reels.

Each segment MUST:
1. Open with a natural hook — bold claim, surprising fact, direct question, or relatable problem
2. Build tension or curiosity that keeps viewers watching
3. Deliver a clear payoff — insight, advice, memorable quote, or story resolution
4. End at a natural sentence boundary (not mid-sentence or mid-thought)

Score each segment 0–100:
- Hook strength (0-25): How compelling is the opening line?
- Narrative arc (0-25): Does it have tension → resolution?
- Quotability (0-25): Is there a memorable shareable takeaway?
- Standalone clarity (0-25): Makes sense without full video context?

Return ONLY valid JSON array, no markdown, no explanation:
[
  { "start": <seconds_float>, "end": <seconds_float>, "title": "<4-8 word compelling title>", "hook": "<exact opening line>", "score": <0-100> }
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
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  const segments = JSON.parse(cleaned) as SelectedSegment[];

  return segments
    .filter((s) => s.end - s.start >= 30) // must be at least 30s
    .map((s) => ({ ...s, end: Math.min(s.end, s.start + 75) })) // cap at 75s
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
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

  // GPT selects top 3 cohesive narrative segments
  let segments: SelectedSegment[];
  try {
    segments = await selectViralSegments(transcript.text, transcript.words);
    console.log(
      `[assemblyai] GPT selected ${segments.length} segments for video=${videoId}:`,
      segments.map((s) => `"${s.title}" ${s.start}s–${s.end}s score=${s.score}`)
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
          hashtags: [],
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
