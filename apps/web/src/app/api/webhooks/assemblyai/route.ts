import { db } from "@contentforge/db";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { waitUntil } from "@vercel/functions";
import { processAiClip } from "@/lib/integrations/heygen/processor";
import { remotionRenderService } from "@/lib/integrations/remotion/service";

export const maxDuration = 300;

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

// The 10 approved viral hooks — GPT picks the best fit for each clip
const VIRAL_HOOKS = [
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
] as const;

interface FoundClip {
  framework: string;
  platform: string;
  start: number;
  end: number;
  title: string;
  hook: string;
  score: number;
  hasNaturalHook: boolean;
  suggestedHook?: string; // one of VIRAL_HOOKS, only set when hasNaturalHook=false
}

interface MissingFramework {
  framework: string;
  platform: string;
  reason: string;
  suggestedScript: string; // GPT always starts this with the best-fit hook
  mood: "motivational" | "educational" | "inspiring" | "energetic";
}

interface ViralMomentsResult {
  clips: FoundClip[];
  missing: MissingFramework[];
}

// Words that should never be the last word of a clip — they signal an incomplete thought
const DANGLING_WORDS = new Set([
  "and", "but", "so", "because", "the", "a", "an", "that", "which",
  "who", "or", "if", "when", "then", "as", "with", "to", "in", "on",
  "at", "by", "for", "of", "from", "about", "into", "i", "we", "you",
  "this", "these", "those", "it", "its", "their", "our", "your",
]);

/** Snap a GPT-chosen time (seconds) to the nearest real word boundary.
 *  mode "start" → word whose start is closest at-or-after targetSec
 *  mode "end"   → last word ending at-or-before targetSec, then extend if it's a dangling word
 */
function snapToWordBoundary(
  words: AssemblyAIWord[],
  targetSec: number,
  mode: "start" | "end"
): number {
  const targetMs = targetSec * 1000;
  if (mode === "start") {
    const after = words.find((w) => w.start >= targetMs);
    if (after) return after.start / 1000;
    const closest = words.reduce((a, b) =>
      Math.abs(a.start - targetMs) <= Math.abs(b.start - targetMs) ? a : b
    );
    return closest.start / 1000;
  } else {
    // Find last word ending at or before target
    const candidates = words.filter((w) => w.end <= targetMs + 350);
    const lastWord = candidates.length > 0
      ? candidates[candidates.length - 1]
      : words.reduce((a, b) => Math.abs(a.end - targetMs) <= Math.abs(b.end - targetMs) ? a : b);

    const snappedSec = lastWord.end / 1000 + 0.25;

    // Guard: if the last word is a dangling connector, extend to the next sentence boundary
    const lastText = lastWord.text.replace(/[^a-zA-Z]/g, "").toLowerCase();
    if (!DANGLING_WORDS.has(lastText)) return snappedSec;

    const lastIdx = words.indexOf(lastWord);
    for (let i = lastIdx + 1; i < words.length; i++) {
      const w = words[i];
      const hasPunctuation = /[.!?]$/.test(w.text);
      const nextWord = words[i + 1];
      const hasLongPause = !nextWord || (nextWord.start - w.end) > 500;
      if (hasPunctuation || hasLongPause) return w.end / 1000 + 0.25;
      // Don't extend more than 6 extra seconds
      if (w.start - (lastWord.end) > 6000) break;
    }

    return snappedSec; // couldn't find better boundary, keep snapped
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

## VIRAL HOOKS (for clips that need one):
The following hooks may be prepended to any clip. Pick the one that fits most naturally given the clip's topic and tone:
1. "Nobody mentions this"
2. "I wish I knew this earlier"
3. "Pause for a second"
4. "Ever notice this pattern"
5. "Here's the real truth"
6. "Let me save you hours"
7. "This may surprise you"
8. "You need this now"
9. "You may not agree with this"
10. "I just figured this out"

## HOOK RULES:
- For each FOUND clip: set "hasNaturalHook": true if the clip already opens with a strong, attention-grabbing statement (bold claim, surprising fact, strong opinion, relatable pain) that would stop a scroller. Set false if it opens with context-setting, mid-story, or a weak/neutral statement.
- If hasNaturalHook is false: set "suggestedHook" to the single best hook from the list above that fits the clip's specific topic and tone. Do NOT include a period after the hook — it will be joined to the content.
- For each MISSING clip: ALWAYS start "suggestedScript" with the best hook from the list above, followed by a comma or dash, then the rest of the script. Example: "Nobody mentions this — most toddler nutrition advice ignores healthy fats entirely."

## RULES:
- **#1 RULE — COMPLETE THE THOUGHT.** Never cut mid-sentence, mid-clause, or on a connector word (and, but, so, because, the, a, etc.). A clip that runs 2-3 seconds past the framework max to finish the idea is always better than one that ends on an incomplete thought.
- start and end times must land on full sentence boundaries. If the natural sentence end is slightly past the max, use that end time anyway.
- Every clip must make 100% sense with ZERO context from the rest of the video
- For MISSING frameworks: write a COMPLETE narration script using the speaker's exact topic, niche vocabulary, and tone. Write the actual words — NEVER use bracket placeholders like [insert X here].
- Each script must end on a complete sentence with terminal punctuation (. ! ?)
- Use the word counts below as a guide, not a hard limit. Always finish the thought:
  * pattern_interrupt: ~30 words (8–18 s target range)
  * hot_take: ~25 words (7–15 s target range)
  * relatable_hook: ~22 words (7–12 s target range)
  * before_after: ~35 words (10–20 s target range)
  * open_loop: ~43 words (12–25 s target range)
  * list_format: ~52 words (15–30 s target range)

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
      "score": 87,
      "hasNaturalHook": true,
      "suggestedHook": null
    }
  ],
  "missing": [
    {
      "framework": "hot_take",
      "platform": "tiktok",
      "reason": "No strong controversial opinions or polarizing statements found in this content",
      "suggestedScript": "You may not agree with this, but stop optimizing for likes. Likes do not pay your bills. The creators actually scaling their revenue track one metric: click-through on the link in bio. Vanity metrics are the enemy of real growth. Measure what converts, ignore everything else.",
      "mood": "motivational"
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
    // Allow up to 1.5× the max — a clip that runs 2-3s long to finish a complete thought
    // is always better than one cut mid-sentence at the hard max
    return clip.score >= 70 && dur >= fw.minSec * 0.8 && dur <= fw.maxSec * 1.5;
  });

  return result;
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

  const video = await db.uploadedVideo.findUnique({
    where: { id: videoId },
    include: { creator: true },
  });
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

  // ── Best clip selection: pick the single best clip ──────────────────────────
  // Priority: Type 1 (original footage, 0% HeyGen) > Type 2 (fully synthetic).
  // Among Type 1 clips, pick the highest GPT score.
  // If no Type 1 clips exist, fall back to the highest-priority Type 2 framework.
  const type2PriorityOrder = [
    "pattern_interrupt", "hot_take", "relatable_hook", "before_after", "open_loop", "list_format",
  ];

  const bestType1 = result.clips.reduce<FoundClip | null>((best, clip) => {
    if (!best || clip.score > best.score) return clip;
    return best;
  }, null);

  const bestType2 = type2PriorityOrder
    .map((id) => result.missing.find((m) => m.framework === id))
    .find(Boolean) ?? null;

  if (!bestType1 && !bestType2) {
    console.log(`[assemblyai] video=${videoId}: no viable clips found`);
    await db.uploadedVideo.update({ where: { id: videoId }, data: { status: "READY" } });
    return NextResponse.json({ ok: true });
  }

  console.log(
    `[assemblyai] video=${videoId}: best pick = ${bestType1 ? `Type1/${bestType1.framework}(score=${bestType1.score})` : `Type2/${bestType2!.framework}`}`
  );

  // ── Process the single chosen clip ──────────────────────────────────────────

  if (bestType1) {
    const found = bestType1;
    const fw = FRAMEWORKS.find((f) => f.id === found.framework)!;

    const snappedStart = snapToWordBoundary(transcript.words!, found.start, "start");
    const snappedEnd   = snapToWordBoundary(transcript.words!, found.end,   "end");
    const durationSec  = Math.max(1, snappedEnd - snappedStart);

    console.log(
      `[assemblyai] ${found.framework} raw=${found.start}s-${found.end}s → snapped=${snappedStart.toFixed(2)}s-${snappedEnd.toFixed(2)}s (${durationSec.toFixed(2)}s)`
    );

    const clipWordTimings = (transcript.words ?? [])
      .filter(w => w.start / 1000 >= snappedStart - 0.05 && w.end / 1000 <= snappedEnd + 0.35)
      .map(w => ({
        word: w.text,
        start: parseFloat((w.start / 1000 - snappedStart).toFixed(3)),
        end: parseFloat((w.end / 1000 - snappedStart).toFixed(3)),
      }));

    const needsHookPrepend = !found.hasNaturalHook && !!found.suggestedHook;

    if (needsHookPrepend) {
      // ── Type 1 + hook: GENERATING_AI hybrid clip ──────────────────────────
      // processAiClip will TTS the hook, HeyGen lipsync it, then Remotion combines
      // [hook face video] + [original footage segment].
      const hybridClip = await db.repurposedClip.create({
        data: {
          videoId,
          title: found.title,
          duration: Math.round(durationSec),
          startTime: snappedStart,
          endTime: snappedEnd,
          status: "GENERATING_AI",
          platform: fw.platform,
          format: found.framework,
          reelScript: {
            isHybridWithOriginal: true,
            hookText: found.suggestedHook,
            originalStart: snappedStart,
            originalEnd: snappedEnd,
            originalSrc: video.storagePath,
            originalWordTimings: clipWordTimings,
            mood: "motivational",
            frameworkName: fw.name,
            videoRotation: ((video.metadata as Record<string, unknown>)?.videoRotation as number) ?? 0,
          },
          metadata: {},
          hashtags: [],
        },
      });
      console.log(
        `[assemblyai] clip=${hybridClip.id} framework=${found.framework} platform=${fw.platform} hook="${found.suggestedHook}" → GENERATING_AI hybrid`
      );
      waitUntil(processAiClip(hybridClip.id));
    } else {
      // ── Type 1, no hook needed: direct Remotion render ────────────────────
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
      console.log(
        `[assemblyai] clip=${clip.id} framework=${found.framework} platform=${fw.platform} score=${found.score} words=${clipWordTimings.length} → queued for Remotion`
      );

      const videoSrc = video.storagePath;
      waitUntil(
        remotionRenderService
          .renderClipAndWait({
            segments: [{ type: 'original', src: videoSrc, startFrom: snappedStart, duration: durationSec, offsetFrom: 0, rotation: ((video.metadata as Record<string, unknown>)?.videoRotation as number) ?? 0 }],
            wordTimings: clipWordTimings,
            captionStyle: 'KARAOKE',
            totalDurationSec: durationSec,
          })
          .then(async (outputUrl) => {
            await db.repurposedClip.update({
              where: { id: clip.id },
              data: { storagePath: outputUrl, status: 'READY' },
            });
            console.log(`[assemblyai] Type 1 clip ready: clipId=${clip.id} url=${outputUrl}`);
          })
          .catch(async (err) => {
            console.error(`[assemblyai] Remotion render failed: clipId=${clip.id}`, err);
            await db.repurposedClip.update({ where: { id: clip.id }, data: { status: 'FAILED' } });
          })
      );
    }

    console.log(`[assemblyai] video=${videoId}: 1 clip queued (Type 1 ${found.framework})`);
    return NextResponse.json({ ok: true, submitted: 1, aiQueued: 0 });
  }

  // ── Type 2 fallback: fully synthetic clip (hook embedded in suggestedScript) ──
  const missing = bestType2!;
  const fw = FRAMEWORKS.find((f) => f.id === missing.framework)!;
  const targetDuration = Math.round((fw.minSec + fw.maxSec) / 2);

  const aiClip = await db.repurposedClip.create({
    data: {
      videoId,
      title: fw.name,
      duration: targetDuration,
      status: "GENERATING_AI",
      platform: fw.platform,
      format: missing.framework,
      reelScript: {
        suggestedScript: missing.suggestedScript,
        mood: missing.mood ?? "motivational",
        reason: missing.reason,
        frameworkName: fw.name,
        targetSec: targetDuration,
        minSec: fw.minSec,
        maxSec: fw.maxSec,
      },
      hashtags: [],
    },
  });

  console.log(
    `[assemblyai] GENERATING_AI framework=${missing.framework} platform=${fw.platform} targetDuration=${targetDuration}s clipId=${aiClip.id}`
  );

  waitUntil(processAiClip(aiClip.id));

  console.log(`[assemblyai] video=${videoId}: 1 clip queued (Type 2 ${missing.framework})`);
  return NextResponse.json({ ok: true, submitted: 0, aiQueued: 1 });
}