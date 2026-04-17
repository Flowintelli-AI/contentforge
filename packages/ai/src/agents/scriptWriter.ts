import OpenAI from "openai";
import { Platform } from "@prisma/client";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ScriptInput {
  refinedIdea: string;
  niche: string;
  platform?: Platform;
  creatorStyle?: string;        // extracted from influencer analysis
  targetAudience?: string;
  pillarType?: string;
  estimatedDuration?: number;   // seconds
}

export interface ScriptOutput {
  title: string;
  hook: string;
  painPoint: string;
  authority: string;
  solution: string;
  callToAction: string;
  fullScript: string;
  hashtags: string[];
  postCopy: string;
  wordCount: number;
}

const PLATFORM_CONSTRAINTS: Record<Platform, { maxWords: number; tone: string }> = {
  TIKTOK:    { maxWords: 150, tone: "casual, energetic, trend-aware" },
  INSTAGRAM: { maxWords: 200, tone: "aspirational, visual, conversational" },
  YOUTUBE:   { maxWords: 500, tone: "educational, engaging, thorough" },
  TWITTER_X: { maxWords: 80,  tone: "punchy, direct, opinionated" },
  LINKEDIN:  { maxWords: 300, tone: "professional, insightful, authoritative" },
  FACEBOOK:  { maxWords: 250, tone: "conversational, community-focused" },
  PINTEREST: { maxWords: 100, tone: "inspirational, how-to focused" },
};

export async function generateScript(input: ScriptInput): Promise<ScriptOutput> {
  const platformConfig = input.platform
    ? PLATFORM_CONSTRAINTS[input.platform]
    : { maxWords: 200, tone: "engaging, conversational" };

  const systemPrompt = `You are an expert UGC content strategist and script writer with 10+ years creating 
viral short-form content for top creators. You write scripts that convert viewers into followers and followers 
into buyers. You are deeply familiar with proven content frameworks used by McKinsey-level content strategists.`;

  const userPrompt = `Write a complete short-form video script for this idea:

IDEA: ${input.refinedIdea}
NICHE: ${input.niche}
PLATFORM: ${input.platform ?? "general"}
TONE: ${platformConfig.tone}
MAX WORDS: ${platformConfig.maxWords}
TARGET AUDIENCE: ${input.targetAudience ?? "general audience interested in " + input.niche}
PILLAR TYPE: ${input.pillarType ?? "education"}
${input.creatorStyle ? `CREATOR STYLE: ${input.creatorStyle}` : ""}

Return a JSON object with these exact fields:
{
  "title": "compelling 5-8 word title",
  "hook": "the opening 2-3 sentences that stop the scroll (pattern interrupt)",
  "painPoint": "agitate the problem the viewer faces (1-2 sentences)",
  "authority": "why should they trust you / social proof (1 sentence)",
  "solution": "the core value delivery — the 'how' (3-5 sentences max)",
  "callToAction": "single specific CTA (comment X, save this, follow for more)",
  "fullScript": "the complete assembled script ready to read on camera",
  "hashtags": ["array", "of", "10", "relevant", "hashtags"],
  "postCopy": "150-word caption copy optimized for ${input.platform ?? "social media"}",
  "wordCount": 150
}

RULES:
- Hook must create curiosity or shock in the first 3 words
- Never start with "In this video" or "Today I want to"
- Every sentence must earn its place
- CTA must be specific (not generic "like and subscribe")
- Script must sound natural when spoken aloud`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.8,
    max_tokens: 2000,
  });

  const raw = JSON.parse(response.choices[0].message.content ?? "{}");

  return {
    title: raw.title ?? "Untitled Script",
    hook: raw.hook ?? "",
    painPoint: raw.painPoint ?? "",
    authority: raw.authority ?? "",
    solution: raw.solution ?? "",
    callToAction: raw.callToAction ?? "",
    fullScript: raw.fullScript ?? "",
    hashtags: raw.hashtags ?? [],
    postCopy: raw.postCopy ?? "",
    wordCount: raw.wordCount ?? 0,
  };
}

// ── BATCH: Generate multiple platform variants ────────────────────────────────

export async function generatePlatformVariants(
  baseScript: ScriptOutput,
  niche: string,
  platforms: Platform[]
): Promise<Record<Platform, ScriptOutput>> {
  const variants = await Promise.allSettled(
    platforms.map((platform) =>
      generateScript({
        refinedIdea: baseScript.fullScript,
        niche,
        platform,
      }).then((v) => ({ platform, variant: v }))
    )
  );

  const result: Partial<Record<Platform, ScriptOutput>> = {};
  for (const v of variants) {
    if (v.status === "fulfilled") {
      result[v.value.platform] = v.value.variant;
    }
  }
  return result as Record<Platform, ScriptOutput>;
}
