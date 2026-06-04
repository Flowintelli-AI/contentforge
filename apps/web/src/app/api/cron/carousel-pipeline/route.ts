/**
 * Cron: /api/cron/carousel-pipeline
 *
 * Runs hourly (see vercel.json). For each creator with an active CarouselPipeline:
 *   1. Fetch their dynamic RSS feed (/api/feeds/[creatorId])
 *   2. Find articles newer than lastRanAt
 *   3. Pick the most relevant article (top score, skip already-processed links)
 *   4. Call Azure Function to generate carousel slides
 *   5. Post to Instagram as a multi-image carousel
 *   6. Save CarouselRun record
 *   7. Update lastRanAt + enforce maxPerDay cap
 */

import { NextResponse } from "next/server";
import { db } from "@contentforge/db";
import { publishCarouselPost } from "@/lib/integrations/instagram/publisher";
import { createLogger } from "@/lib/integrations/shared/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const logger = createLogger("cron-carousel-pipeline");

const CAROUSEL_API_URL = process.env.CAROUSEL_API_URL ?? "";
const CAROUSEL_API_KEY = process.env.CAROUSEL_API_KEY ?? "";
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://contentforge.app";

interface RssFeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
}

async function fetchFeedItems(creatorId: string): Promise<RssFeedItem[]> {
  const res = await fetch(`${APP_BASE_URL}/api/feeds/${creatorId}`, {
    headers: { "User-Agent": "ContentForge-Cron/1.0" },
    next: { revalidate: 0 },
  });
  if (!res.ok) return [];
  const xml = await res.text();

  const items: RssFeedItem[] = [];
  const itemPattern = /<item[\s\S]*?<\/item>/gi;
  const blocks = xml.match(itemPattern) ?? [];

  for (const block of blocks) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const description = extractTag(block, "description");
    const pubDate = extractTag(block, "pubDate");
    if (title && link) items.push({ title, link, description, pubDate });
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() ?? "" : "";
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!CAROUSEL_API_URL || !CAROUSEL_API_KEY) {
    logger.error("CAROUSEL_API_URL or CAROUSEL_API_KEY not set");
    return NextResponse.json({ error: "Carousel API not configured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const forceRun = url.searchParams.get("force") === "true";

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Load all active pipelines with brand + IG connection
  const activePipelines = await db.carouselPipeline.findMany({
    where: { isActive: true },
    include: {
      creator: {
        include: {
          brandKit: true,
          igConnection: true,
        },
      },
    },
  });

  logger.info("Cron scan", { activePipelines: activePipelines.length });

  if (activePipelines.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, results: [] });
  }

  const results = await Promise.allSettled(
    activePipelines.map(async (pipeline) => {
      const creatorId = pipeline.creatorId;
      const creator = pipeline.creator;

      try {
        // Enforce maxPerDay cap (skip if force=true)
        if (!forceRun) {
        const todayRuns = await db.carouselRun.count({
          where: {
            creatorId,
            createdAt: { gte: todayStart },
            status: "DONE",
          },
        });
        if (todayRuns >= pipeline.maxPerDay) {
          logger.info("maxPerDay reached, skipping", { creatorId, todayRuns, maxPerDay: pipeline.maxPerDay });
          return { creatorId, skipped: true, reason: "maxPerDay" };
        }
        }

        // Fetch feed items
        const feedItems = await fetchFeedItems(creatorId);
        if (feedItems.length === 0) {
          logger.info("No feed items", { creatorId });
          return { creatorId, skipped: true, reason: "no_feed_items" };
        }

        // Find articles newer than lastRanAt that haven't been processed
        const lastRanAt = pipeline.lastRanAt ?? new Date(0);
        const processedRuns = await db.carouselRun.findMany({
          where: { creatorId },
          select: { webhookPayload: true },
          take: 50,
          orderBy: { createdAt: "desc" },
        });
        const processedLinks = new Set<string>(
          processedRuns
            .map((r) => (r.webhookPayload as { article_url?: string })?.article_url)
            .filter(Boolean) as string[]
        );

        const newItems = feedItems.filter((item) => {
          const pubDate = item.pubDate ? new Date(item.pubDate) : new Date(0);
          return pubDate > lastRanAt && !processedLinks.has(item.link);
        });

        if (newItems.length === 0) {
          logger.info("No new articles", { creatorId });
          return { creatorId, skipped: true, reason: "no_new_articles" };
        }

        // Pick the first (highest-scored) new article
        const article = newItems[0]!;

        // Build brand config from stored BrandKit
        const kit = creator.brandKit;
        const brand = kit
          ? {
              name: kit.brandName ?? undefined,
              handle: kit.handle ?? undefined,
              niche: kit.niche ?? undefined,
              primary_color: kit.primaryColor ?? undefined,
              accent_color: kit.accentColor ?? undefined,
              logo_url: kit.logoUrl ?? undefined,
              website: kit.website ?? undefined,
              voice_notes: kit.voiceNotes ?? undefined,
            }
          : {};

        // Create PENDING run
        const run = await db.carouselRun.create({
          data: {
            creatorId,
            title: article.title,
            platform: "instagram",
            status: "PENDING",
            webhookPayload: { article_title: article.title, article_url: article.link, brand } as object,
          },
        });

        // Call Azure Function to generate carousel
        const azureRes = await fetch(CAROUSEL_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": CAROUSEL_API_KEY,
          },
          body: JSON.stringify({
            article_title: article.title,
            article_body: article.description,
            platform: "instagram",
            brand,
          }),
        });

        if (!azureRes.ok) {
          throw new Error(`Azure Function returned ${azureRes.status}`);
        }

        const carouselResult = (await azureRes.json()) as {
          slides_png_urls?: string[];
          slides_cloudinary_urls?: string[];
          pdf_base64?: string;
          caption?: string;
        };

        const slideUrls = carouselResult.slides_png_urls ?? carouselResult.slides_cloudinary_urls ?? [];
        const caption = carouselResult.caption ?? article.title;

        // Post to Instagram if connected and enough slides
        let mediaId: string | undefined;
        const igConn = creator.igConnection;
        if (igConn && slideUrls.length >= 2 && pipeline.platforms.includes("instagram")) {
          mediaId = await publishCarouselPost(
            igConn.accessToken,
            igConn.igUserId,
            slideUrls.slice(0, 10),
            caption
          );
          logger.info("Posted to Instagram", { creatorId, mediaId });
        }

        // Update run to DONE
        await db.carouselRun.update({
          where: { id: run.id },
          data: {
            status: "DONE",
            slideUrls,
            caption,
            pdfUrl: carouselResult.pdf_base64 ? `data:application/pdf;base64,${carouselResult.pdf_base64}` : null,
          },
        });

        // Update pipeline lastRanAt
        await db.carouselPipeline.update({
          where: { id: pipeline.id },
          data: { lastRanAt: now },
        });

        return { creatorId, runId: run.id, mediaId, articleTitle: article.title };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        logger.error("Pipeline run failed", { creatorId, reason });

        // Mark last run as failed if we can find a pending one
        await db.carouselRun
          .updateMany({
            where: { creatorId, status: "PENDING" },
            data: { status: "FAILED" },
          })
          .catch(() => {});

        throw err;
      }
    })
  );

  const summary = results.map((r) =>
    r.status === "fulfilled"
      ? { ok: true, ...r.value }
      : { ok: false, error: String(r.reason) }
  );

  const processed = summary.filter((r) => r.ok && !(r as { skipped?: boolean }).skipped).length;
  return NextResponse.json({ ok: true, processed, results: summary });
}
