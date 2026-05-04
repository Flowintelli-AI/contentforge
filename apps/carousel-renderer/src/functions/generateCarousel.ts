import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { generateCarouselPdf, CarouselRenderResult } from '../pipeline';
import type { CarouselInput, Platform, SlideData } from '../brand';
import { articleToCarousel } from '../articleToCarousel';

const VALID_TYPES = new Set(['hook', 'example', 'diagram', 'practical', 'cta']);
const VALID_PLATFORMS: Platform[] = ['instagram', 'linkedin'];

function parsePlatform(raw: unknown): Platform | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.toLowerCase().trim() as Platform;
  return VALID_PLATFORMS.includes(normalized) ? normalized : null;
}

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

/** Compute whether this article is recommended to post on each platform (score >= 70). */
function computePostRecommendation(fitness: CarouselInput['platform_fitness']) {
  if (!fitness) return { instagram: false, linkedin: false };
  return {
    instagram: fitness.instagram >= 70,
    linkedin:  fitness.linkedin  >= 70,
  };
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
    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await req.text();
      body = Object.fromEntries(new URLSearchParams(text).entries());
    } else {
      body = (await req.json()) as Record<string, unknown>;
    }
    for (const key of ['article_title', 'article_body']) {
      if (typeof body[key] === 'string') {
        try { body[key] = decodeURIComponent(body[key] as string); } catch { /* leave as-is */ }
      }
    }
  } catch {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  // Reject TikTok explicitly — not yet supported
  if (typeof body.platform === 'string' && body.platform.toLowerCase().trim() === 'tiktok') {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'TikTok is not yet supported. Supported platforms: instagram, linkedin.' }),
    };
  }

  // Parse and validate platform — default to "instagram" if omitted
  const rawPlatform = body.platform ?? 'instagram';
  const platform = parsePlatform(rawPlatform);
  if (!platform) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Invalid platform "${rawPlatform}". Supported: instagram, linkedin.` }),
    };
  }

  let input: CarouselInput;

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
      context.log(`articleToCarousel: calling GPT-4o-mini [${platform}] for`, body.article_title);
      input = await articleToCarousel(
        body.article_title,
        body.article_body,
        openAiKey,
        platform,
        typeof body.brand === 'object' && body.brand !== null ? body.brand as import('../brand').BrandConfig : undefined,
      );
    } catch (err) {
      context.error('articleToCarousel error:', err);
      return {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `GPT structuring failed: ${(err as Error).message}` }),
      };
    }
  } else {
    input = body as unknown as CarouselInput;
    if (!Array.isArray(input.slides) || input.slides.length !== 10) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'slides must contain exactly 10 items (or provide article_title + article_body for auto-generation)' }),
      };
    }
  }

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
    const result: CarouselRenderResult = await generateCarouselPdf(input);
    const post_recommendation = computePostRecommendation(input.platform_fitness);

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pdf_base64: result.pdf_base64,
        slides_png_urls: result.slides_png_urls,
        slides_cloudinary_urls: result.slides_cloudinary_urls,
        platform,
        format: input.format,
        caption: input.caption,
        platform_fitness: input.platform_fitness ?? null,
        post_recommendation,
        slides: input.slides,
      }),
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
