/**
 * Seed NicheRssSource records — curated RSS feeds per niche slug.
 *
 * Run with: npx ts-node packages/db/prisma/seed.ts
 * or via Prisma seed config in package.json.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const RSS_SOURCES: Array<{
  nicheSlug: string;
  sourceName: string;
  rssUrl: string;
  priority: number;
}> = [
  // ─── Tech & AI ───────────────────────────────────────────────────────────────
  { nicheSlug: "tech-ai", sourceName: "TechCrunch AI", rssUrl: "https://techcrunch.com/category/artificial-intelligence/feed/", priority: 10 },
  { nicheSlug: "tech-ai", sourceName: "MIT Technology Review", rssUrl: "https://www.technologyreview.com/feed/", priority: 9 },
  { nicheSlug: "tech-ai", sourceName: "The Verge AI", rssUrl: "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml", priority: 8 },
  { nicheSlug: "tech-ai", sourceName: "Ars Technica AI", rssUrl: "https://feeds.arstechnica.com/arstechnica/technology-lab", priority: 7 },
  { nicheSlug: "tech-ai", sourceName: "Wired AI", rssUrl: "https://www.wired.com/feed/tag/ai/latest/rss", priority: 6 },

  // ─── Business & Entrepreneurship ─────────────────────────────────────────────
  { nicheSlug: "business-entrepreneurship", sourceName: "Harvard Business Review", rssUrl: "https://hbr.org/resources/rss/rss_editorial.xml", priority: 10 },
  { nicheSlug: "business-entrepreneurship", sourceName: "Inc. Magazine", rssUrl: "https://www.inc.com/rss", priority: 9 },
  { nicheSlug: "business-entrepreneurship", sourceName: "Entrepreneur", rssUrl: "https://www.entrepreneur.com/latest.rss", priority: 8 },
  { nicheSlug: "business-entrepreneurship", sourceName: "Fast Company", rssUrl: "https://www.fastcompany.com/latest/rss?source=rss", priority: 7 },
  { nicheSlug: "business-entrepreneurship", sourceName: "Forbes Entrepreneurs", rssUrl: "https://www.forbes.com/entrepreneurs/feed2/", priority: 6 },

  // ─── Personal Finance ────────────────────────────────────────────────────────
  { nicheSlug: "personal-finance", sourceName: "NerdWallet", rssUrl: "https://www.nerdwallet.com/blog/feed/", priority: 10 },
  { nicheSlug: "personal-finance", sourceName: "The Motley Fool", rssUrl: "https://www.fool.com/feeds/index.aspx", priority: 9 },
  { nicheSlug: "personal-finance", sourceName: "Money Magazine", rssUrl: "https://money.com/money/feed/", priority: 8 },
  { nicheSlug: "personal-finance", sourceName: "Investopedia", rssUrl: "https://www.investopedia.com/feedbuilder/feed/getfeed/?feedName=rss_headline", priority: 7 },
  { nicheSlug: "personal-finance", sourceName: "Yahoo Finance", rssUrl: "https://finance.yahoo.com/news/rssindex", priority: 6 },

  // ─── Marketing ───────────────────────────────────────────────────────────────
  { nicheSlug: "marketing", sourceName: "HubSpot Blog", rssUrl: "https://blog.hubspot.com/marketing/rss.xml", priority: 10 },
  { nicheSlug: "marketing", sourceName: "Neil Patel", rssUrl: "https://neilpatel.com/blog/feed/", priority: 9 },
  { nicheSlug: "marketing", sourceName: "Content Marketing Institute", rssUrl: "https://contentmarketinginstitute.com/feed/", priority: 8 },
  { nicheSlug: "marketing", sourceName: "Search Engine Journal", rssUrl: "https://www.searchenginejournal.com/feed/", priority: 7 },
  { nicheSlug: "marketing", sourceName: "Marketing Land", rssUrl: "https://martech.org/feed/", priority: 6 },

  // ─── Fitness & Health ────────────────────────────────────────────────────────
  { nicheSlug: "fitness-health", sourceName: "Healthline", rssUrl: "https://www.healthline.com/nutrition/feed", priority: 10 },
  { nicheSlug: "fitness-health", sourceName: "Men's Health", rssUrl: "https://www.menshealth.com/rss/all.xml/", priority: 9 },
  { nicheSlug: "fitness-health", sourceName: "Women's Health", rssUrl: "https://www.womenshealthmag.com/rss/all.xml/", priority: 8 },
  { nicheSlug: "fitness-health", sourceName: "Breaking Muscle", rssUrl: "https://www.breakingmuscle.com/feed/", priority: 7 },
  { nicheSlug: "fitness-health", sourceName: "Precision Nutrition", rssUrl: "https://www.precisionnutrition.com/blog/feed", priority: 6 },

  // ─── Career & Productivity ───────────────────────────────────────────────────
  { nicheSlug: "career-productivity", sourceName: "Lifehacker", rssUrl: "https://lifehacker.com/rss", priority: 10 },
  { nicheSlug: "career-productivity", sourceName: "Fast Company Work Life", rssUrl: "https://www.fastcompany.com/work-life/rss?source=rss", priority: 9 },
  { nicheSlug: "career-productivity", sourceName: "Harvard Business Review", rssUrl: "https://hbr.org/resources/rss/rss_editorial.xml", priority: 8 },
  { nicheSlug: "career-productivity", sourceName: "Zapier Blog", rssUrl: "https://zapier.com/blog/feeds/latest/", priority: 7 },

  // ─── Real Estate ─────────────────────────────────────────────────────────────
  { nicheSlug: "real-estate", sourceName: "Inman News", rssUrl: "https://www.inman.com/feed/", priority: 10 },
  { nicheSlug: "real-estate", sourceName: "BiggerPockets", rssUrl: "https://www.biggerpockets.com/blog/feed", priority: 9 },
  { nicheSlug: "real-estate", sourceName: "Realtor Magazine", rssUrl: "https://magazine.realtor/rss/", priority: 8 },
  { nicheSlug: "real-estate", sourceName: "REtipster", rssUrl: "https://retipster.com/feed/", priority: 7 },
];

async function main() {
  console.log("Seeding NicheRssSource records...");

  // Upsert by (nicheSlug + rssUrl) to avoid duplicates on re-runs
  for (const source of RSS_SOURCES) {
    const existing = await db.nicheRssSource.findFirst({
      where: { nicheSlug: source.nicheSlug, rssUrl: source.rssUrl },
    });

    if (existing) {
      await db.nicheRssSource.update({
        where: { id: existing.id },
        data: { sourceName: source.sourceName, priority: source.priority, isActive: true },
      });
    } else {
      await db.nicheRssSource.create({ data: source });
    }
  }

  const count = await db.nicheRssSource.count();
  console.log(`Done. Total NicheRssSource records: ${count}`);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
