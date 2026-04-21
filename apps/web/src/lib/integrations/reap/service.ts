// ─── Reap.video service ───────────────────────────────────────────────────────
// Handles captioning videos via Reap automation API.
//
// Flow: POST /create-captions with sourceUrl → { projectId }
// Using sourceUrl (vs uploadId) enables the resolution param (1080p).

import { createLogger } from "../shared/logger";
import { withRetry, isRetryableHttpError } from "../shared/retry";

const logger = createLogger("reap");

const REAP_BASE = "https://public.reap.video/api/v1/automation";

export interface ReapCaptionsOptions {
  captionsPreset?: string;   // e.g. "karaoke-bold", "minimal-white" — see Reap dashboard for full list
  enableEmojis?: boolean;
  enableHighlights?: boolean;
  language?: string;         // ISO 639-1, default "en"
  selectedStart?: number;    // seconds — caption a sub-range of the video
  selectedEnd?: number;
  webhookUrl?: string;       // fires when project completes/fails
}

interface CreateCaptionsResponse {
  id: string;
}

class ReapService {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  // Using sourceUrl (not uploadId) so the `resolution` param is respected by the API
  private async createCaptions(
    sourceUrl: string,
    options: ReapCaptionsOptions
  ): Promise<CreateCaptionsResponse> {
    return withRetry(async () => {
      const res = await fetch(`${REAP_BASE}/create-captions`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          sourceUrl,
          captionsPreset: options.captionsPreset ?? "karaoke-bold",
          enableEmojis: options.enableEmojis ?? true,
          enableHighlights: options.enableHighlights ?? true,
          language: options.language ?? "en",
          reframeClips: true,
          resolution: 1080,
          ...(options.selectedStart != null ? { selectedStart: options.selectedStart } : {}),
          ...(options.selectedEnd != null ? { selectedEnd: options.selectedEnd } : {}),
          ...(options.webhookUrl ? { webhookUrl: options.webhookUrl } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw Object.assign(new Error(`Reap create-captions ${res.status}: ${body}`), { status: res.status });
      }
      return res.json() as Promise<CreateCaptionsResponse>;
    }, { shouldRetry: isRetryableHttpError });
  }

  /**
   * Kick off a Reap captions project directly from a video URL.
   * Returns the Reap `projectId` — store this to correlate the webhook.
   */
  async submitCaptions(videoUrl: string, options: ReapCaptionsOptions = {}): Promise<string> {
    logger.info("Starting Reap captions project", { videoUrl });

    const { id: projectId } = await this.createCaptions(videoUrl, options);
    logger.info("Reap captions project created", { projectId });

    return projectId;
  }
}

class MockReapService {
  async submitCaptions(videoUrl: string, _options: ReapCaptionsOptions = {}): Promise<string> {
    logger.info("MOCK submitCaptions", { videoUrl });
    return `mock_reap_${Date.now()}`;
  }
}

export const reapService: { submitCaptions: (videoUrl: string, options?: ReapCaptionsOptions) => Promise<string> } =
  process.env.REAP_API_KEY
    ? new ReapService(process.env.REAP_API_KEY)
    : new MockReapService();
