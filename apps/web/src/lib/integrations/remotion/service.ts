// ─── Remotion Lambda render service ──────────────────────────────────────────
// Replaces Shotstack (trim) + Reap (captions) for both Type 1 and Type 2 clips.
// Renders video + captions together on our own AWS Lambda function.

import { renderMediaOnLambda, getRenderProgress } from '@remotion/lambda/client';
import { createLogger } from '../shared/logger';

const logger = createLogger('remotion');

export interface WordTiming {
  word: string;
  start: number; // seconds into the clip (relative, not absolute)
  end: number;
}

export interface VideoSegment {
  type: 'original' | 'heygen';
  src: string;        // public URL to the video file
  startFrom: number;  // seconds into the source video to start from
  duration: number;   // seconds of this segment to include
  offsetFrom: number; // seconds from the composition start (0 for single-segment clips)
}

export interface RenderClipInput {
  segments: VideoSegment[];
  wordTimings: WordTiming[];
  captionStyle?: 'KARAOKE' | 'HIGHLIGHT' | 'CLEAN';
  totalDurationSec: number;
  primaryColor?: string;
  highlightColor?: string;
}

const FPS = 30;
const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 270_000; // 4.5 min — comfortably within Vercel's 300s maxDuration

class RemotionRenderService {
  private get region() { return process.env.REMOTION_AWS_REGION ?? 'us-east-1'; }
  private get functionName() { return process.env.REMOTION_FUNCTION_NAME ?? ''; }
  private get serveUrl() { return process.env.REMOTION_SERVE_URL ?? ''; }
  private get bucketName() { return process.env.REMOTION_BUCKET_NAME ?? ''; }

  private ensureEnv() {
    if (!this.functionName || !this.serveUrl || !this.bucketName) {
      throw new Error(
        'Remotion not configured — missing REMOTION_FUNCTION_NAME / REMOTION_SERVE_URL / REMOTION_BUCKET_NAME'
      );
    }
    // @remotion/lambda uses the standard AWS credential chain.
    // Alias our REMOTION_AWS_* vars to the names the SDK expects.
    if (!process.env.AWS_ACCESS_KEY_ID && process.env.REMOTION_AWS_ACCESS_KEY_ID) {
      process.env.AWS_ACCESS_KEY_ID = process.env.REMOTION_AWS_ACCESS_KEY_ID;
    }
    if (!process.env.AWS_SECRET_ACCESS_KEY && process.env.REMOTION_AWS_SECRET_ACCESS_KEY) {
      process.env.AWS_SECRET_ACCESS_KEY = process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
    }
  }

  async renderClipAndWait(input: RenderClipInput): Promise<string> {
    this.ensureEnv();

    // Root.tsx registers 900 frames (30s). Use frameRange to render only what we need.
    const totalFrames = Math.max(1, Math.round(input.totalDurationSec * FPS));

    logger.info('Submitting Remotion Lambda render', {
      segments: input.segments.length,
      words: input.wordTimings.length,
      durationSec: input.totalDurationSec,
      totalFrames,
      captionStyle: input.captionStyle ?? 'KARAOKE',
    });

    const { renderId, bucketName: renderBucket } = await renderMediaOnLambda({
      region: this.region as any,
      functionName: this.functionName,
      serveUrl: this.serveUrl,
      composition: 'VideoComposition',
      inputProps: {
        segments: input.segments,
        wordTimings: input.wordTimings,
        captionStyle: input.captionStyle ?? 'KARAOKE',
        primaryColor: input.primaryColor ?? '#FFFFFF',
        highlightColor: input.highlightColor ?? '#FFD700',
      },
      codec: 'h264',
      imageFormat: 'jpeg',
      maxRetries: 1,
      privacy: 'public',
      frameRange: [0, totalFrames - 1],
    });

    const bucket = renderBucket ?? this.bucketName;
    logger.info('Render submitted', { renderId, bucket });

    const deadline = Date.now() + MAX_WAIT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const progress = await getRenderProgress({
        renderId,
        bucketName: bucket,
        functionName: this.functionName,
        region: this.region as any,
      });

      if (progress.fatalErrorEncountered) {
        const error = progress.errors?.[0]?.message ?? 'Unknown Remotion error';
        logger.error('Render failed', { renderId, error });
        throw new Error(`Remotion render failed: ${error}`);
      }

      if (progress.done) {
        const outputUrl = progress.outputFile;
        if (!outputUrl) throw new Error('Render marked done but outputFile is null');
        logger.info('Render complete', { renderId, outputUrl });
        return outputUrl;
      }

      logger.info('Render in progress', {
        renderId,
        pct: `${Math.round((progress.overallProgress ?? 0) * 100)}%`,
      });
    }

    throw new Error(`Remotion render timed out after ${MAX_WAIT_MS / 1000}s (renderId=${renderId})`);
  }
}

class MockRemotionRenderService {
  async renderClipAndWait(input: RenderClipInput): Promise<string> {
    logger.info('MOCK Remotion render (REMOTION_FUNCTION_NAME not set)', {
      segments: input.segments.length,
      durationSec: input.totalDurationSec,
    });
    await sleep(500);
    return `https://mock-remotion-output-${Date.now()}.mp4`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const remotionRenderService: { renderClipAndWait: (input: RenderClipInput) => Promise<string> } =
  process.env.REMOTION_FUNCTION_NAME
    ? new RemotionRenderService()
    : new MockRemotionRenderService();
