// ─── Postiz service implementation ───────────────────────────────────────────

import { withRetry, isRetryableHttpError } from "../shared/retry";
import { createLogger } from "../shared/logger";
import type {
  IPostizService,
  SchedulePostParams,
  SchedulePostResult,
  PostStatus,
} from "./interface";

const logger = createLogger("postiz");

// ── Mock implementation ───────────────────────────────────────────────────────

class MockPostizService implements IPostizService {
  private store = new Map<string, PostStatus>();

  async schedulePost(params: SchedulePostParams): Promise<SchedulePostResult> {
    logger.info("MOCK schedulePost", { platform: params.platform, calendarItemId: params.calendarItemId });
    const id = `mock_postiz_${Date.now()}`;
    this.store.set(id, { postizPostId: id, status: "scheduled" });
    return { postizPostId: id, status: "scheduled" };
  }

  async cancelPost(postizPostId: string): Promise<void> {
    logger.info("MOCK cancelPost", { postizPostId });
    this.store.delete(postizPostId);
  }

  async getPostStatus(postizPostId: string): Promise<PostStatus> {
    return (
      this.store.get(postizPostId) ?? {
        postizPostId,
        status: "scheduled",
      }
    );
  }
}

// ── Live implementation ───────────────────────────────────────────────────────

class LivePostizService implements IPostizService {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const err = new Error(`Postiz ${init.method ?? "GET"} ${path} → ${res.status}`);
      (err as any).status = res.status;
      throw err;
    }
    return res.json() as Promise<T>;
  }

  async schedulePost(params: SchedulePostParams): Promise<SchedulePostResult> {
    return withRetry(
      async () => {
        const body = {
          profile: params.postizProfileId,
          content: params.content,
          date: params.scheduledFor.toISOString(),
          media: params.mediaUrls ?? [],
          settings: { externalId: params.calendarItemId },
        };
        const data = await this.request<{ id: string; status: string }>("/api/posts", {
          method: "POST",
          body: JSON.stringify(body),
        });
        logger.info("Post scheduled", { postizPostId: data.id });
        return {
          postizPostId: data.id,
          status: data.status as SchedulePostResult["status"],
        };
      },
      { shouldRetry: isRetryableHttpError }
    );
  }

  async cancelPost(postizPostId: string): Promise<void> {
    return withRetry(
      async () => {
        await this.request(`/api/posts/${postizPostId}`, { method: "DELETE" });
        logger.info("Post cancelled", { postizPostId });
      },
      { shouldRetry: isRetryableHttpError }
    );
  }

  async getPostStatus(postizPostId: string): Promise<PostStatus> {
    return withRetry(async () => {
      const data = await this.request<{
        id: string;
        status: string;
        publishedAt?: string;
        errorMessage?: string;
      }>(`/api/posts/${postizPostId}`);
      return {
        postizPostId: data.id,
        status: data.status as PostStatus["status"],
        publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined,
        errorMessage: data.errorMessage,
      };
    }, { shouldRetry: isRetryableHttpError });
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export const postizService: IPostizService =
  process.env.POSTIZ_API_KEY && process.env.POSTIZ_BASE_URL
    ? new LivePostizService(process.env.POSTIZ_BASE_URL, process.env.POSTIZ_API_KEY)
    : new MockPostizService();
