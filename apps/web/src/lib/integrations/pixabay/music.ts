/**
 * Pixabay Music API integration.
 * Queries royalty-free tracks by mood at clip processing time.
 * Free, no attribution required, commercial use allowed.
 *
 * API docs: https://pixabay.com/api/docs/#api_music
 * Requires env var: PIXABAY_API_KEY
 */

import { createLogger } from "../shared/logger";

const logger = createLogger("pixabay-music");

const PIXABAY_MUSIC_BASE = "https://pixabay.com/api/music/";

// Maps our mood taxonomy → Pixabay category + search query
const MOOD_MAP: Record<string, { category: string; q: string }> = {
  motivational: { category: "corporate",  q: "motivational upbeat inspiring" },
  educational:  { category: "ambient",    q: "calm focus background study" },
  inspiring:    { category: "cinematic",  q: "inspiring uplifting emotional" },
  energetic:    { category: "electronic", q: "energetic upbeat driving" },
};

const FALLBACK = MOOD_MAP.motivational;

interface PixabayMusicHit {
  id: number;
  audio: string;   // direct MP3 CDN URL
  name: string;
  duration: number;
}

interface PixabayMusicResponse {
  totalHits: number;
  hits: PixabayMusicHit[];
}

/**
 * Fetches a random royalty-free track URL from Pixabay matching the given mood.
 * Returns null if PIXABAY_API_KEY is not configured (music is skipped silently).
 */
export async function fetchMoodTrack(mood?: string | null): Promise<string | null> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) {
    logger.warn("PIXABAY_API_KEY not set — skipping background music");
    return null;
  }

  const { category, q } = MOOD_MAP[mood ?? ""] ?? FALLBACK;

  const params = new URLSearchParams({
    key: apiKey,
    category,
    q,
    per_page: "10",
    order: "popular",
  });

  try {
    const res = await fetch(`${PIXABAY_MUSIC_BASE}?${params}`);
    if (!res.ok) {
      logger.warn("Pixabay music API error", { status: res.status, mood });
      return null;
    }

    const data = (await res.json()) as PixabayMusicResponse;
    const hits = data.hits?.filter((h) => h.audio && h.duration >= 10);

    if (!hits?.length) {
      logger.warn("No Pixabay tracks found for mood", { mood, category, q });
      return null;
    }

    // Pick randomly from top results for variety
    const pick = hits[Math.floor(Math.random() * hits.length)]!;
    logger.info("Pixabay track selected", { mood, name: pick.name, duration: pick.duration, url: pick.audio });

    return pick.audio;
  } catch (err) {
    logger.warn("Pixabay music fetch failed", { mood, err: String(err) });
    return null;
  }
}
