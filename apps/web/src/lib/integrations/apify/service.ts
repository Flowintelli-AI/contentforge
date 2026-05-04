/**
 * Apify Instagram Scraper integration.
 *
 * Uses the official `apify/instagram-scraper` actor to scrape:
 *  - Top posts for a hashtag (niche trend analysis)
 *  - Recent posts from a public profile (competitor monitoring)
 *
 * API key is read from APIFY_API_KEY env var — never hardcode it.
 * Actor docs: https://apify.com/apify/instagram-scraper
 */

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "apify~instagram-scraper";

export type ScrapedPost = {
  id: string;
  url: string;
  username: string;
  caption: string | null;
  thumbnailUrl: string | null;
  likesCount: number;
  commentsCount: number;
  playsCount: number;
  audioTitle: string | null;
  audioArtist: string | null;
  audioUrl: string | null;
  timestamp: string; // ISO date string
  type: "Video" | "Image" | "Sidecar";
};

// ─── Raw Apify response shape (partial) ──────────────────────────────────────

type ApifyPost = {
  id?: string;
  shortCode?: string;
  url?: string;
  displayUrl?: string;
  ownerUsername?: string;
  caption?: string;
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number;
  videoPlayCount?: number;
  timestamp?: string;
  type?: string;
  musicInfo?: {
    artist_name?: string;
    song_name?: string;
    music_canonical_id?: string;
  };
};

function normalise(raw: ApifyPost): ScrapedPost {
  return {
    id: raw.shortCode ?? raw.id ?? Math.random().toString(36).slice(2),
    url: raw.url ?? `https://www.instagram.com/p/${raw.shortCode}/`,
    username: raw.ownerUsername ?? "",
    caption: raw.caption ?? null,
    thumbnailUrl: raw.displayUrl ?? null,
    likesCount: raw.likesCount ?? 0,
    commentsCount: raw.commentsCount ?? 0,
    playsCount: raw.videoPlayCount ?? raw.videoViewCount ?? 0,
    audioTitle: raw.musicInfo?.song_name ?? null,
    audioArtist: raw.musicInfo?.artist_name ?? null,
    audioUrl: raw.musicInfo?.music_canonical_id
      ? `https://www.instagram.com/reels/audio/${raw.musicInfo.music_canonical_id}/`
      : null,
    timestamp: raw.timestamp ?? new Date().toISOString(),
    type: (raw.type as ScrapedPost["type"]) ?? "Video",
  };
}

// ─── Core scraper ─────────────────────────────────────────────────────────────

async function runActor(input: Record<string, unknown>, limit = 20): Promise<ScrapedPost[]> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) {
    console.warn("[apify] APIFY_API_KEY not set — returning mock data");
    return [];
  }

  // Use synchronous run endpoint — waits for completion, returns dataset items directly
  // timeout=50 leaves headroom for DB writes within Vercel's 60s serverless limit
  const url = `${APIFY_BASE}/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${apiKey}&timeout=50&memory=512`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, resultsLimit: limit, addParentData: false }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify error ${res.status}: ${text.slice(0, 200)}`);
  }

  const items = (await res.json()) as ApifyPost[];
  return items.map(normalise).filter((p) => p.url);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Scrape top posts for a niche hashtag (e.g. "fitness") */
export async function scrapeHashtag(hashtag: string, limit = 20): Promise<ScrapedPost[]> {
  const tag = hashtag.replace(/^#/, "").toLowerCase().trim();
  return runActor(
    {
      directUrls: [`https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`],
      resultsType: "posts",
    },
    limit
  );
}

/** Scrape recent Reel posts from a public Instagram profile */
export async function scrapeProfile(username: string, limit = 20): Promise<ScrapedPost[]> {
  const handle = username.replace(/^@/, "").toLowerCase().trim();
  return runActor(
    {
      directUrls: [`https://www.instagram.com/${handle}/`],
      resultsType: "posts",
    },
    limit
  );
}
