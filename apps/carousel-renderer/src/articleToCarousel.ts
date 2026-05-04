import type { CarouselInput, BrandConfig, Platform } from './brand';
import { getSystemPrompt, buildUserPrompt } from './prompt';

/**
 * Calls GPT-4o-mini to convert a raw article into structured CarouselInput.
 * Platform-aware: uses appropriate voice/tone/caption prompt per platform.
 * Brand-aware: injects caller's brand into prompts (Flowintelli is the default).
 * Uses JSON mode to guarantee valid JSON output every time.
 */
export async function articleToCarousel(
  title: string,
  body: string,
  apiKey: string,
  platform: Platform,
  brand?: BrandConfig,
): Promise<CarouselInput> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: getSystemPrompt(platform, brand) },
        { role: 'user', content: buildUserPrompt(title, body, platform, brand) },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const raw = data.choices[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned empty content');

  let parsed: CarouselInput;
  try {
    parsed = JSON.parse(raw) as CarouselInput;
  } catch {
    throw new Error(`GPT output was not valid JSON: ${raw.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed.slides) || parsed.slides.length !== 10) {
    throw new Error(
      `GPT returned ${parsed.slides?.length ?? 0} slides — expected exactly 10. Output: ${raw.slice(0, 300)}`,
    );
  }

  // Validate platform_fitness if present (advisory only — range check)
  if (parsed.platform_fitness) {
    const { instagram, linkedin } = parsed.platform_fitness;
    if (typeof instagram !== 'number' || instagram < 0 || instagram > 100 ||
        typeof linkedin  !== 'number' || linkedin  < 0 || linkedin  > 100) {
      // Non-fatal: log and zero out rather than failing the whole render
      console.warn('platform_fitness scores out of range — resetting to 0', parsed.platform_fitness);
      parsed.platform_fitness = { instagram: 0, linkedin: 0 };
    }
  }

  return parsed;
}
