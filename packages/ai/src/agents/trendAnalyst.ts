import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface TrendAnalysisInput {
  niche: string;
  influencerHandles?: string[];
  recentIdeas?: string[];
}

export interface TrendReport {
  topTopics: string[];
  contentGaps: string[];
  hookPatterns: string[];
  suggestedPillars: Array<{
    type: string;
    topic: string;
    angle: string;
    urgency: "high" | "medium" | "low";
  }>;
  weeklyFocusRecommendation: string;
}

export async function analyzeTrends(input: TrendAnalysisInput): Promise<TrendReport> {
  const prompt = `You are a senior content trend analyst specializing in the ${input.niche} niche.

Analyze current trends and provide strategic content recommendations.

NICHE: ${input.niche}
${input.influencerHandles?.length ? `TOP CREATORS IN THIS NICHE: ${input.influencerHandles.join(", ")}` : ""}
${input.recentIdeas?.length ? `CREATOR'S RECENT IDEAS: ${input.recentIdeas.join(" | ")}` : ""}

Return a JSON object:
{
  "topTopics": ["5 trending topics in this niche right now"],
  "contentGaps": ["3 underserved topics competitors are missing"],
  "hookPatterns": ["5 high-performing hook patterns/formulas for this niche"],
  "suggestedPillars": [
    {
      "type": "EDUCATION|ENTERTAINMENT|INSPIRATION|PROMOTION",
      "topic": "specific topic",
      "angle": "unique angle or perspective",
      "urgency": "high|medium|low"
    }
  ],
  "weeklyFocusRecommendation": "1-2 sentence strategic focus for this week"
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  return JSON.parse(response.choices[0].message.content ?? "{}");
}

// ── Influencer style extraction ───────────────────────────────────────────────

export interface InfluencerStyleProfile {
  writingStyle: string;
  hookFormulas: string[];
  audiencePersona: string;
  contentMix: Record<string, number>; // pillar → % distribution
}

export async function extractInfluencerStyle(
  influencerHandle: string,
  sampleContent: string[]
): Promise<InfluencerStyleProfile> {
  const prompt = `Analyze this creator's content style:

CREATOR: @${influencerHandle}
SAMPLE CONTENT:
${sampleContent.slice(0, 5).map((c, i) => `${i + 1}. ${c}`).join("\n")}

Extract their style fingerprint as JSON:
{
  "writingStyle": "2-sentence description of their voice and tone",
  "hookFormulas": ["3 hook patterns they commonly use"],
  "audiencePersona": "who their audience is",
  "contentMix": { "EDUCATION": 40, "ENTERTAINMENT": 30, "INSPIRATION": 20, "PROMOTION": 10 }
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  return JSON.parse(response.choices[0].message.content ?? "{}");
}
