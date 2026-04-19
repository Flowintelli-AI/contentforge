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

interface FrameworkDef {
  id: string;
  platform: "TIKTOK" | "INSTAGRAM" | "YOUTUBE";
  name: string;
  minSec: number;
  maxSec: number;
}

const FRAMEWORKS: FrameworkDef[] = [
  { id: "pattern_interrupt", platform: "TIKTOK",    name: "Pattern Interrupt → Curiosity → Payoff",    minSec: 8,  maxSec: 18 },
  { id: "hot_take",          platform: "TIKTOK",    name: "Hot Take / Controversial POV",               minSec: 7,  maxSec: 15 },
  { id: "relatable_hook",    platform: "INSTAGRAM", name: "Relatable Hook → Micro Value → Loop",        minSec: 7,  maxSec: 12 },
  { id: "before_after",      platform: "INSTAGRAM", name: "Mini Transformation / Before-After",         minSec: 10, maxSec: 20 },
  { id: "open_loop",         platform: "YOUTUBE",   name: "Open Loop → Deliver → Close Loop",           minSec: 12, maxSec: 25 },
  { id: "list_format",       platform: "YOUTUBE",   name: "List Format / Fast Value Stacking",          minSec: 15, maxSec: 30 },
];

interface FoundClip {
  framework: string;
  platform: string;
  start: number;
  end: number;
  title: string;
  hook: string;
  score: number;
}

interface MissingFramework {
  framework: string;
  platform: string;
  reason: string;
  suggestedScript: string;
}

interface ViralMomentsResult {
  clips: FoundClip[];
  missing: MissingFramework[];
}

/** Snap a GPT-chosen time (seconds) to the nearest real word boundary.
 *  mode "start" → find the word whose start is closest at-or-after targetSec
 *  mode "end"   → find the word whose END is closest at-or-before targetSec, then add 0.25s buffer
 */
function snapToWordBoundary(
  words: AssemblyAIWord[],
  targetSec: number,
  mode: "start" | "end"
): number {
  const targetMs = targetSec * 1000;
  if (mode === "start") {
    // Find first word that starts at or after target, fallback to closest word start
    const after = words.find((w) => w.start >= targetMs);
    if (after) return after.start / 1000;
    // fallback: closest
    const closest = words.reduce((a, b) =>
      Math.abs(a.start - targetMs) <= Math.abs(b.start - targetMs) ? a : b
    );
    return closest.start / 1000;
  } else {
    // Find last word that ends at or before target
    const candidates = words.filter((w) => w.end <= targetMs);
    if (candidates.length > 0) {
      const lastWord = candidates[candidates.length - 1];
      return lastWord.end / 1000 + 0.25; // tiny buffer so last syllable isn't clipped
    }
    // fallback: closest word end
    const closest = words.reduce((a, b) =>
      Math.abs(a.end - targetMs) <= Math.abs(b.end - targetMs) ? a : b
    );
    return closest.end / 1000 + 0.25;
  }
}

async function analyzeViralFrameworks(
  transcriptText: string,
  words: AssemblyAIWord[]
): Promise<ViralMomentsResult> {
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += 8) {
    const chunk = words.slice(i, i + 8);
    const startSec = (chunk[0].start / 1000).toFixed(1);
    lines.push(`[${startSec}s] ${chunk.map((w) => w.text).join(" ")}`);
  }

  const systemPrompt = `You are a viral short-form video strategist specializing in TikTok, Instagram Reels, and YouTube Shorts in 2026.

The algorithm rewards (in order): completion rate → replays/loops → saves/shares.

Analyze this transcript and try to find moments matching 6 specific viral frameworks. ONLY include a clip if it scores 70 or higher. It is far better to return 2 elite clips than 6 mediocre ones — do NOT force a clip if the content doesn't clearly support the framework.

## FRAMEWORKS TO FIND:

1. **pattern_interrupt** (TikTok) — 8-18 seconds
   Structure: Scroll-stopping statement (0-2s) → Build curiosity (2-6s) → Fast payoff (6-12s)
   Look for: bold claim or "This is why X..." → brief tension → punchy insight
   Loop trigger: ending flows naturally back to opening

2. **hot_take** (TikTok) — 7-15 seconds
   Structure: Strong controversial opinion → Quick justification → Reinforcement
   Look for: "Stop doing X", polarizing statement, counterintuitive take + brief reasoning

3. **relatable_hook** (Instagram) — 7-12 seconds
   Structure: Relatable pain (0-2s) → Quick micro-value (2-8s) → End loops to start
   Look for: "If you're struggling with X..." → micro-solution → ending that connects back to hook

4. **before_after** (Instagram) — 10-20 seconds
   Structure: Before (specific problem/number) → After (result) → How (one key insight)
   Look for: Transformation story, before/after comparison, result + single key reason

5. **open_loop** (YouTube) — 12-25 seconds
   Structure: Tease outcome (0-2s) → Deliver steps clearly → Close the loop explicitly
   Look for: "Here's exactly how I did X" → numbered or sequential explanation → clear conclusion

6. **list_format** (YouTube) — 15-30 seconds
   Structure: Hook ("X ways to...") → Rapid-fire numbered points → Clean memorable ending
   Look for: Any content with 2+ distinct tips/points that can be delivered quickly

## RULES:
- start and end times MUST land on COMPLETE sentence boundaries (never cut mid-sentence)
- Every clip must make 100% sense with ZERO context from the rest of the video
- For MISSING frameworks: write a personalized script using the speaker's actual topic, niche, vocabulary, and tone from the transcript — make it feel native to their voice, not generic
- Suggested scripts should be the exact words the user can read on camera

Return ONLY valid JSON, no markdown, no explanation:
{
  "clips": [
    {
      "framework": "pattern_interrupt",
      "platform": "tiktok",
      "start": 12.4,
      "end": 24.1,
      "title": "Why most businesses fail",
      "hook": "This is why 99% of businesses fail on TikTok",
      "score": 87
    }
  ],
  "missing": [
    {
      "framework": "hot_take",
      "platform": "tiktok",
      "reason": "No strong controversial opinions or polarizing statements found in this content",
      "suggestedScript": "Stop [doing X specific to their topic] if you want [result]. Everyone tells you to [common advice]. That's exactly wrong. [Their specific insight]. That's the real game."
    }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.3,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: lines.join("\n") },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '{"clips":[],"missing":[]}';
  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  const result = JSON.parse(cleaned) as ViralMomentsResult;

  // Validate found clips against framework duration bounds
  result.clips = result.clips.filter((clip) => {
    const fw = FRAMEWORKS.find((f) => f.id === clip.framework);
    if (!fw) return false;
    const dur = clip.end - clip.start;
    return clip.score >= 70 && dur >= fw.minSec * 0.8 && dur <= fw.maxSec * 1.2;
  });

  return result;
}

async function submitShotstackTrim(
  videoUrl: string,
  startSec: number,
  durationSec: number,
  callbackUrl: string
): Promise<string> {
  const shotstackBase = process.env.SHOTSTACK_ENV === "production"
    ? "https://api.shotstack.io/v1"
    : "https://api.shotstack.io/stage";
  const res = await fetch(`${shotstackBase}/render`, {
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

  // Idempotency: skip if clips already created
  const existingClips = await db.repurposedClip.count({ where: { videoId } });
  if (existingClips > 0) {
    console.log(`[assemblyai] video=${videoId} already has ${existingClips} clips, skipping`);
    return NextResponse.json({ ok: true });
  }

  // Fetch full transcript with word-level timestamps
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

  // GPT analyzes for 6 viral frameworks
  let result: ViralMomentsResult;
  try {
    result = await analyzeViralFrameworks(transcript.text, transcript.words);
    console.log(
      `[assemblyai] video=${videoId}: ${result.clips.length} clips found, ${result.missing.length} frameworks need scripts`,
      result.clips.map((c) => `${c.framework}(${c.start}s-${c.end}s score=${c.score})`)
    );
  } catch (err) {
    console.error(`[assemblyai] GPT framework analysis failed for video=${videoId}:`, err);
    await db.uploadedVideo.update({ where: { id: videoId }, data: { status: "READY" } });
    return NextResponse.json({ ok: true });
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://contentforge-web-nine.vercel.app";

  let submitted = 0;

  // Create PROCESSING clips and submit Shotstack trim renders
  for (const found of result.clips) {
    const fw = FRAMEWORKS.find((f) => f.id === found.framework);
    if (!fw) continue;

    // Snap GPT timestamps to actual word boundaries to avoid mid-word cuts
    const snappedStart = snapToWordBoundary(transcript.words!, found.start, "start");
    const snappedEnd   = snapToWordBoundary(transcript.words!, found.end,   "end");
    const durationSec  = Math.max(1, snappedEnd - snappedStart);

    console.log(`[assemblyai] ${found.framework} raw=${found.start}s-${found.end}s → snapped=${snappedStart.toFixed(2)}s-${snappedEnd.toFixed(2)}s (${durationSec.toFixed(2)}s)`);

    try {
      const clip = await db.repurposedClip.create({
        data: {
          videoId,
          title: found.title,
          duration: Math.round(durationSec),
          startTime: snappedStart,
          endTime: snappedEnd,
          status: "PROCESSING",
          platform: fw.platform,
          format: found.framework,
          hashtags: [],
        },
      });

      const renderId = await submitShotstackTrim(
        video.storagePath,
        snappedStart,
        durationSec,
        `${appUrl}/api/webhooks/shotstack?clipId=${clip.id}`
      );

      await db.repurposedClip.update({
        where: { id: clip.id },
        data: { opusClipId: renderId },
      });

      console.log(
        `[assemblyai] clip=${clip.id} framework=${found.framework} platform=${fw.platform} score=${found.score} → Shotstack renderId=${renderId}`
      );
      submitted++;
    } catch (err) {
      console.error(
        `[assemblyai] failed to submit ${found.framework} clip for video=${videoId}:`, err
      );
    }
  }

  // Create SCRIPT_NEEDED clips with personalized scripts for missing frameworks
  for (const missing of result.missing) {
    const fw = FRAMEWORKS.find((f) => f.id === missing.framework);
    if (!fw) continue;

    try {
      await db.repurposedClip.create({
        data: {
          videoId,
          title: fw.name,
          status: "SCRIPT_NEEDED",
          platform: fw.platform,
          format: missing.framework,
          reelScript: {
            suggestedScript: missing.suggestedScript,
            reason: missing.reason,
            frameworkName: fw.name,
            targetLength: `${fw.minSec}-${fw.maxSec}s`,
          },
          hashtags: [],
        },
      });

      console.log(
        `[assemblyai] SCRIPT_NEEDED framework=${missing.framework} platform=${fw.platform} reason="${missing.reason}"`
      );
    } catch (err) {
      console.error(
        `[assemblyai] failed to create script-needed record for ${missing.framework}:`, err
      );
    }
  }

  console.log(
    `[assemblyai] video=${videoId}: ${submitted} Shotstack renders submitted, ${result.missing.length} script suggestions created`
  );
  return NextResponse.json({ ok: true, submitted, scriptNeeded: result.missing.length });
}