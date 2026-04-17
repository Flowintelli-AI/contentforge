import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ScriptSection {
  hook: string;
  painPoint: string;
  authority: string;
  solution: string;
  callToAction: string;
  hashtags: string[];
  caption: string;
  estimatedDurationSeconds: number;
}

const MOCK_SCRIPT = (rawIdea: string): ScriptSection => ({
  hook: `Stop scrolling — this is the #1 mistake most people make with: ${rawIdea.slice(0, 60)}`,
  painPoint:
    "You're working hard, but you're not seeing results. It's not your fault — nobody showed you the right system.",
  authority:
    "After helping 100+ creators break through plateaus, I've seen exactly what separates the ones who blow up from those who stay stuck.",
  solution:
    "Here's the 3-step framework: (1) Focus on one core message per video. (2) Lead with emotion, follow with logic. (3) End with a clear next step.",
  callToAction: "Comment 'GUIDE' below and I'll send you the full breakdown for free.",
  hashtags: ["#ugccreator", "#contentcreator", "#contentmarketing", "#creatortips", "#socialmedia"],
  caption:
    "Most creators are doing this wrong 👇 Here's what actually works (and why it's simpler than you think).",
  estimatedDurationSeconds: 60,
});

export async function generateScript(
  rawIdea: string,
  refinedIdea: string,
  niche?: string
): Promise<ScriptSection> {
  if (!process.env.OPENAI_API_KEY) {
    return MOCK_SCRIPT(rawIdea);
  }

  const systemPrompt = `You are an expert UGC content strategist and scriptwriter. 
Your job is to turn a raw content idea into a fully structured short-form video script.

The script must follow this proven framework:
1. HOOK — An attention-grabbing opening line (1-2 sentences). Make it scroll-stopping.
2. PAIN POINT — Identify the specific problem or frustration the audience feels.
3. AUTHORITY — Briefly establish credibility or relate to the audience.
4. SOLUTION — The core teaching/value/insight (2-4 sentences, clear and actionable).
5. CALL TO ACTION — One specific ask (comment trigger, follow, DM, link in bio).

Also provide:
- 5 relevant hashtags (no spaces, lowercase)
- A short post caption (under 150 chars) for Instagram/TikTok
- Estimated video duration in seconds (target 45-90 seconds for short-form)

Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
{
  "hook": "string",
  "painPoint": "string",
  "authority": "string",
  "solution": "string",
  "callToAction": "string",
  "hashtags": ["string"],
  "caption": "string",
  "estimatedDurationSeconds": number
}`;

  const userPrompt = `Raw idea: ${rawIdea}

Refined concept: ${refinedIdea}
${niche ? `Creator niche: ${niche}` : ""}

Write the full structured script now.`;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 600,
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return MOCK_SCRIPT(rawIdea);

    const parsed = JSON.parse(content) as ScriptSection;
    return parsed;
  } catch {
    return MOCK_SCRIPT(rawIdea);
  }
}
