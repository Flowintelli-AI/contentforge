import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { generateCarouselPdf } from '../pipeline';
import { CarouselInput, SlideData } from '../brand';
import { articleToCarousel } from '../articleToCarousel';

const VALID_TYPES = new Set(['hook', 'example', 'diagram', 'practical', 'cta']);

function validateSlide(slide: SlideData, idx: number): string | null {
  if (!VALID_TYPES.has(slide.type))
    return `slide[${idx}]: invalid type "${slide.type}"`;
  if (!slide.headline || slide.headline.length === 0)
    return `slide[${idx}]: headline is required`;
  if (slide.headline.split(' ').length > 12)
    return `slide[${idx}]: headline exceeds 12 words`;
  if (slide.body && slide.body.split(' ').length > 40)
    return `slide[${idx}]: body exceeds 40 words`;
  if (slide.bullets && (slide.bullets.length < 1 || slide.bullets.length > 5))
    return `slide[${idx}]: bullets must be 1–5 items`;
  if (slide.steps && (slide.steps.length < 2 || slide.steps.length > 5))
    return `slide[${idx}]: steps must be 2–5 items`;
  if (slide.stats && (slide.stats.length < 1 || slide.stats.length > 4))
    return `slide[${idx}]: stats must be 1–4 items`;
  return null;
}

async function generateCarousel(
  req: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || apiKey !== process.env.CAROUSEL_API_KEY) {
    return {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  let input: CarouselInput;

  // Mode A: raw article → GPT generates slides automatically
  if (typeof body.article_title === 'string' && typeof body.article_body === 'string') {
    const openAiKey = process.env.OPENAI_API_KEY ?? '';
    if (!openAiKey) {
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'OPENAI_API_KEY is not configured on this function.' }),
      };
    }
    try {
      context.log('articleToCarousel: calling GPT-4o-mini for', body.article_title);
      input = await articleToCarousel(body.article_title, body.article_body, openAiKey);
    } catch (err) {
      context.error('articleToCarousel error:', err);
      return {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `GPT structuring failed: ${(err as Error).message}` }),
      };
    }
  } else {
    // Mode B: pre-structured slides JSON passed directly
    input = body as unknown as CarouselInput;
    if (!Array.isArray(input.slides) || input.slides.length !== 10) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'slides must contain exactly 10 items (or provide article_title + article_body for auto-generation)' }),
      };
    }
  }

  // Per-slide validation
  for (let i = 0; i < input.slides.length; i++) {
    const err = validateSlide(input.slides[i], i);
    if (err) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: err }),
      };
    }
  }

  try {
    const pdf_base64 = await generateCarouselPdf(input);
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      // Return slides so Make.com can log/store the structured content alongside the PDF
      body: JSON.stringify({ pdf_base64, format: input.format, caption: input.caption, slides: input.slides }),
    };
  } catch (err) {
    context.error('generateCarousel render error:', err);
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Render failed. Check function logs.' }),
    };
  }
}

app.http('generateCarousel', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: generateCarousel,
});
