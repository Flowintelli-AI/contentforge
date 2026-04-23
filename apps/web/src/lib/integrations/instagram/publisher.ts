// ─── Instagram Graph API publisher ───────────────────────────────────────────
// Wraps the three calls needed to schedule a Reel via the Instagram Graph API:
//   1. createReelsContainer — creates the media object (scheduled or published)
//   2. publishContainer     — immediate publish (for "post now" path)
//   3. getContainerStatus   — poll container status (FINISHED / IN_PROGRESS / ERROR)
//
// Instagram schedules posts natively — no cron/queue needed for scheduled publishing.
// Requirements: Creator or Business account, token with instagram_basic +
//   instagram_content_publish + pages_read_engagement scopes.

const IG_API = "https://graph.instagram.com";
const MIN_SCHEDULE_OFFSET_MS = 10 * 60 * 1000;  // 10 minutes
const MAX_SCHEDULE_OFFSET_MS = 75 * 24 * 60 * 60 * 1000; // 75 days

export interface IgContainerStatus {
  statusCode: "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED";
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Create a scheduled Reels container.
 * @param scheduledAtMs Unix milliseconds — must be 10 min to 75 days from now.
 * @returns Instagram container ID (pass to publishContainer for immediate or leave for scheduled).
 */
export async function createReelsContainer(
  accessToken: string,
  igUserId: string,
  videoUrl: string,
  caption: string,
  scheduledAtMs: number
): Promise<string> {
  const nowMs = Date.now();
  if (scheduledAtMs < nowMs + MIN_SCHEDULE_OFFSET_MS) {
    throw new Error(
      "Scheduled time must be at least 10 minutes in the future"
    );
  }
  if (scheduledAtMs > nowMs + MAX_SCHEDULE_OFFSET_MS) {
    throw new Error("Scheduled time cannot be more than 75 days in the future");
  }

  const scheduledPublishTime = Math.floor(scheduledAtMs / 1000); // Unix seconds

  const params = new URLSearchParams({
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    published: "false",
    scheduled_publish_time: String(scheduledPublishTime),
    access_token: accessToken,
  });

  const res = await fetch(`${IG_API}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = (await res.json()) as { id?: string; error?: { message: string; code: number } };
  if (!res.ok || !data.id) {
    const msg = data.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Instagram container creation failed: ${msg}`);
  }

  return data.id;
}

/**
 * Immediately publish an existing container (for "post now" path).
 * The container must be in FINISHED status before calling this.
 */
export async function publishContainer(
  accessToken: string,
  igUserId: string,
  containerId: string
): Promise<string> {
  const params = new URLSearchParams({
    creation_id: containerId,
    access_token: accessToken,
  });

  const res = await fetch(`${IG_API}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = (await res.json()) as { id?: string; error?: { message: string } };
  if (!res.ok || !data.id) {
    const msg = data.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Instagram publish failed: ${msg}`);
  }

  return data.id; // IG media ID
}

/**
 * Poll the status of a container (useful for "post now" flow to wait for video processing).
 */
export async function getContainerStatus(
  accessToken: string,
  containerId: string
): Promise<IgContainerStatus> {
  const url = new URL(`${IG_API}/${containerId}`);
  url.searchParams.set("fields", "status_code,status");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  const data = (await res.json()) as {
    status_code?: string;
    status?: string;
    error?: { message: string; error_subcode?: number };
  };

  if (!res.ok) {
    const msg = data.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Instagram container status check failed: ${msg}`);
  }

  return {
    statusCode: (data.status_code ?? "IN_PROGRESS") as IgContainerStatus["statusCode"],
    errorMessage: data.status ?? undefined,
  };
}
