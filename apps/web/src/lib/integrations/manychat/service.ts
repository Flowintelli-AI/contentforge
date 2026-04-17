// ─── ManyChat service implementation ─────────────────────────────────────────

import { withRetry, isRetryableHttpError } from "../shared/retry";
import { createLogger } from "../shared/logger";
import type {
  IManyChatService,
  SendDMParams,
  TriggerFlowParams,
  TagSubscriberParams,
  CommentTrigger,
} from "./interface";

const logger = createLogger("manychat");
const MC_BASE = "https://api.manychat.com";

// ── Mock implementation ───────────────────────────────────────────────────────

class MockManyChatService implements IManyChatService {
  async sendDM(params: SendDMParams): Promise<void> {
    logger.info("MOCK sendDM", { subscriberId: params.subscriberId, message: params.message.slice(0, 50) });
  }

  async triggerFlow(params: TriggerFlowParams): Promise<void> {
    logger.info("MOCK triggerFlow", params);
  }

  async tagSubscriber(params: TagSubscriberParams): Promise<void> {
    logger.info("MOCK tagSubscriber", params);
  }

  async setupCommentTrigger(trigger: CommentTrigger): Promise<{ triggerId: string }> {
    logger.info("MOCK setupCommentTrigger", { keyword: trigger.keyword });
    return { triggerId: `mock_trigger_${Date.now()}` };
  }
}

// ── Live implementation ───────────────────────────────────────────────────────

class LiveManyChatService implements IManyChatService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${MC_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const err = new Error(`ManyChat ${init.method ?? "GET"} ${path} → ${res.status}`);
      (err as any).status = res.status;
      throw err;
    }
    return res.json() as Promise<T>;
  }

  async sendDM(params: SendDMParams): Promise<void> {
    return withRetry(
      async () => {
        const body: Record<string, unknown> = {
          subscriber_id: params.subscriberId,
          data: {
            version: "v2",
            content: {
              messages: [
                {
                  type: "text",
                  text: params.message,
                  ...(params.buttons?.length
                    ? {
                        buttons: params.buttons.map((b) => ({
                          type: "url",
                          caption: b.title,
                          url: b.url,
                        })),
                      }
                    : {}),
                },
              ],
            },
          },
        };
        await this.request("/fb/sending/sendContent", {
          method: "POST",
          body: JSON.stringify(body),
        });
        logger.info("DM sent", { subscriberId: params.subscriberId });
      },
      { shouldRetry: isRetryableHttpError }
    );
  }

  async triggerFlow(params: TriggerFlowParams): Promise<void> {
    return withRetry(
      async () => {
        await this.request("/fb/sending/sendFlow", {
          method: "POST",
          body: JSON.stringify({ subscriber_id: params.subscriberId, flow_ns: params.flowNs }),
        });
        logger.info("Flow triggered", params);
      },
      { shouldRetry: isRetryableHttpError }
    );
  }

  async tagSubscriber(params: TagSubscriberParams): Promise<void> {
    return withRetry(
      async () => {
        await this.request("/fb/subscriber/addTag", {
          method: "POST",
          body: JSON.stringify({ subscriber_id: params.subscriberId, tag_name: params.tagName }),
        });
        logger.info("Tag added", params);
      },
      { shouldRetry: isRetryableHttpError }
    );
  }

  async setupCommentTrigger(trigger: CommentTrigger): Promise<{ triggerId: string }> {
    return withRetry(
      async () => {
        // ManyChat comment growth tool — keyword automations are configured
        // via the dashboard or Growth Tools API. This creates a keyword rule.
        const data = await this.request<{ data: { id: string } }>("/fb/page/createGrowthTool", {
          method: "POST",
          body: JSON.stringify({
            type: "comment",
            post_id: trigger.postId,
            keyword: trigger.keyword,
            flow_ns: trigger.flowNs,
            send_dm: trigger.sendDM,
            dm_text: trigger.dmMessage,
          }),
        });
        logger.info("Comment trigger created", { triggerId: data.data.id });
        return { triggerId: data.data.id };
      },
      { shouldRetry: isRetryableHttpError }
    );
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export const manyChatService: IManyChatService = process.env.MANYCHAT_API_KEY
  ? new LiveManyChatService(process.env.MANYCHAT_API_KEY)
  : new MockManyChatService();
