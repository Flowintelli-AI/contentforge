import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateRefinedIdea(rawIdea: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    // Mock for development
    return `[AI Refined] ${rawIdea} — with a unique angle targeting your audience's core pain point.`;
  }

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a content strategist for UGC creators. Refine the raw content idea into a clear, engaging hook-ready concept in 1-2 sentences.",
      },
      { role: "user", content: rawIdea },
    ],
    max_tokens: 150,
  });

  return completion.choices[0]?.message?.content ?? rawIdea;
}
