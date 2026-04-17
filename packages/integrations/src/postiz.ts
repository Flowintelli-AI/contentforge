// Postiz integration wrapper
// Docs: https://docs.postiz.com/api-reference

const POSTIZ_BASE = process.env.POSTIZ_BASE_URL ?? "http://localhost:4007";
const POSTIZ_API_KEY = process.env.POSTIZ_API_KEY ?? "";

interface PostizPost {
  channelId: string;
  content: string;
  scheduledDate: string; // ISO 8601
  mediaUrls?: string[];
  tags?: string[];
}

interface PostizPostResponse {
  id: string;
  status: "scheduled" | "published" | "failed";
  publishedUrl?: string;
}

async function postizFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${POSTIZ_BASE}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${POSTIZ_API_KEY}`,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Postiz error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ── Schedule a post ───────────────────────────────────────────────────────────

export async function schedulePost(post: PostizPost): Promise<PostizPostResponse> {
  return postizFetch<PostizPostResponse>("/posts", {
    method: "POST",
    body: JSON.stringify({
      channel: post.channelId,
      content: post.content,
      date: post.scheduledDate,
      media: post.mediaUrls ?? [],
      tags: post.tags ?? [],
    }),
  });
}

// ── Cancel / delete a scheduled post ─────────────────────────────────────────

export async function cancelPost(postizPostId: string): Promise<void> {
  await postizFetch(`/posts/${postizPostId}`, { method: "DELETE" });
}

// ── List connected channels ───────────────────────────────────────────────────

export interface PostizChannel {
  id: string;
  name: string;
  platform: string;
  profilePicture?: string;
}

export async function listChannels(): Promise<PostizChannel[]> {
  return postizFetch<PostizChannel[]>("/channels");
}

// ── Get post status (for polling / webhook fallback) ──────────────────────────

export async function getPostStatus(postizPostId: string): Promise<PostizPostResponse> {
  return postizFetch<PostizPostResponse>(`/posts/${postizPostId}`);
}
