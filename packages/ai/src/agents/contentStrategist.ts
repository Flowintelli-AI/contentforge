import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface RefinedIdea {
  refinedTitle: string;
  targetAudience: string;
  contentAngle: string;
  suggestedPillars: string[];
  estimatedEngagementPotential: "LOW" | "MEDIUM" | "HIGH";
  whyThisWorks: string;
  suggestedHashtags: string[];
}

export async function refineIdea(
  rawIdea: string,
  niche: string,
  creatorBio: string
): Promise<RefinedIdea> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an expert content strategist specializing in UGC (User Generated Content) for social media. 
Your job is to refine raw content ideas into structured, high-potential content angles.
Always respond with valid JSON matching the RefinedIdea schema.`,
      },
      {
        role: "user",
        content: `Refine this content idea for a ${niche} creator.

Creator bio: ${creatorBio}
Raw idea: ${rawIdea}

Return JSON with:
{
  "refinedTitle": "engaging, specific title for this content",
  "targetAudience": "exactly who this content is for",
  "contentAngle": "the unique angle/perspective that will make this stand out",
  "suggestedPillars": ["EDUCATION" | "ENTERTAINMENT" | "INSPIRATION" | "PROMOTION" | "STORYTELLING"],
  "estimatedEngagementPotential": "LOW" | "MEDIUM" | "HIGH",
  "whyThisWorks": "1-2 sentences on why this will resonate",
  "suggestedHashtags": ["array of 5-8 relevant hashtags without #"]
}`,
      },
    ],
    temperature: 0.7,
    max_tokens: 600,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");
  return JSON.parse(content) as RefinedIdea;
}
