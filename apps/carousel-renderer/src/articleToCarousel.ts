import { CarouselInput } from './brand';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';

/**
 * Calls GPT-4o-mini to convert a raw article into structured CarouselInput.
 * Uses JSON mode to guarantee valid JSON output every time.
 */
export async function articleToCarousel(
  title: string,
  body: string,
  apiKey: string,
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
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(title, body) },
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

  // Basic sanity checks before returning
  if (!Array.isArray(parsed.slides) || parsed.slides.length !== 10) {
    throw new Error(
      `GPT returned ${parsed.slides?.length ?? 0} slides — expected exactly 10. Output: ${raw.slice(0, 300)}`,
    );
  }

  return parsed;
}
