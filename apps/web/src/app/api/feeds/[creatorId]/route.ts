/**
 * GET /api/feeds/[creatorId]
 *
 * Dynamic RSS feed for a creator based on their niches + content pillars.
 * Fetches articles from NicheRssSource records, scores by pillar keywords,
 * and returns the top 10 as RSS 2.0 XML.
 *
 * Public endpoint — no auth required (returns only curated public articles).
 * Cache: 1 hour (CDN + browser).
 */

import { NextResponse } from "next/server";
import { db } from "@contentforge/db";

interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: Date;
  score: number;
}

/** Parse RSS 2.0 <item> or Atom <entry> elements from raw XML text. */
function parseItems(xml: string): Omit<FeedItem, "score">[] {
  const items: Omit<FeedItem, "score">[] = [];

  // Try RSS 2.0 <item> blocks first
  const rssPattern = /<item[\s\S]*?<\/item>/gi;
  const rssItems = xml.match(rssPattern) ?? [];

  for (const block of rssItems) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link") || extractAttr(block, "link", "href");
    const description = extractTag(block, "description") || extractTag(block, "summary");
    const pubDate = parseDate(extractTag(block, "pubDate") || extractTag(block, "published") || extractTag(block, "updated"));

    if (title && link) {
      items.push({ title: stripCdata(title), link: link.trim(), description: stripHtml(stripCdata(description)), pubDate });
    }
  }

  // If no <item> found, try Atom <entry> blocks
  if (items.length === 0) {
    const atomPattern = /<entry[\s\S]*?<\/entry>/gi;
    const atomItems = xml.match(atomPattern) ?? [];

    for (const block of atomItems) {
      const title = extractTag(block, "title");
      const link = extractAttr(block, "link", "href") || extractTag(block, "link");
      const description = extractTag(block, "summary") || extractTag(block, "content");
      const pubDate = parseDate(extractTag(block, "published") || extractTag(block, "updated"));

      if (title && link) {
        items.push({ title: stripCdata(title), link: link.trim(), description: stripHtml(stripCdata(description)), pubDate });
      }
    }
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1]?.trim() ?? "" : "";
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]+${attr}="([^"]+)"`, "i"));
  return m ? m[1]?.trim() ?? "" : "";
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
}

function parseDate(s: string): Date {
  if (!s) return new Date(0);
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

/** Score an article by counting pillar keyword matches in title + description. */
function scoreItem(item: Omit<FeedItem, "score">, pillars: string[]): number {
  if (pillars.length === 0) return 1;
  const text = `${item.title} ${item.description}`.toLowerCase();
  let score = 0;
  for (const pillar of pillars) {
    const words = pillar.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 3 && text.includes(word)) score++;
    }
  }
  return score;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(
  _req: Request,
  { params }: { params: { creatorId: string } }
) {
  const { creatorId } = params;

  // Load creator's niches + pillars
  const nicheLinks = await db.nicheOnCreator.findMany({
    where: { creatorId },
    include: { niche: true },
  });

  if (nicheLinks.length === 0) {
    return new NextResponse(
      `<?xml version="1.0"?><rss version="2.0"><channel><title>No niches configured</title></channel></rss>`,
      { status: 200, headers: { "Content-Type": "application/rss+xml" } }
    );
  }

  const nicheSlugs = nicheLinks.map((n) => n.niche.slug);
  const pillars = nicheLinks.flatMap((n) => (n as { pillars?: string[] }).pillars ?? []);

  // Fetch up to 15 RSS sources for this creator's niches
  const sources = await db.nicheRssSource.findMany({
    where: { nicheSlug: { in: nicheSlugs }, isActive: true },
    orderBy: [{ priority: "desc" }, { nicheSlug: "asc" }],
    take: 15,
  });

  // Fetch all sources in parallel (timeout 8s each)
  const fetchResults = await Promise.allSettled(
    sources.map(async (src) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(src.rssUrl, {
          signal: controller.signal,
          headers: { "User-Agent": "ContentForge/1.0 (+https://contentforge.app)" },
        });
        const text = await res.text();
        return parseItems(text);
      } finally {
        clearTimeout(timer);
      }
    })
  );

  const allItems: FeedItem[] = [];
  const seenLinks = new Set<string>();

  for (const result of fetchResults) {
    if (result.status !== "fulfilled") continue;
    for (const item of result.value) {
      if (seenLinks.has(item.link)) continue;
      seenLinks.add(item.link);
      allItems.push({ ...item, score: scoreItem(item, pillars) });
    }
  }

  // Sort: score desc, then recency desc; take top 10
  allItems.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.pubDate.getTime() - a.pubDate.getTime();
  });
  const top10 = allItems.slice(0, 10);

  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>ContentForge Feed — ${xmlEscape(creatorId)}</title>
    <link>https://contentforge.app</link>
    <description>Personalized content feed for creator ${xmlEscape(creatorId)}</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${top10
  .map(
    (item) => `    <item>
      <title>${xmlEscape(item.title)}</title>
      <link>${xmlEscape(item.link)}</link>
      <description>${xmlEscape(item.description)}</description>
      <pubDate>${item.pubDate.toUTCString()}</pubDate>
    </item>`
  )
  .join("\n")}
  </channel>
</rss>`;

  return new NextResponse(rssXml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
