// ─── Thumbnail extraction service ────────────────────────────────────────────
// Extracts 5 candidate frames from a rendered clip, uploads to S3,
// and persists thumbnailCandidates + thumbnailUrl on the RepurposedClip.
//
// Uses ffmpeg-static so no binary install is needed (it's in package.json).
// Frames are written to /tmp/{clipId}/ and cleaned up after upload.

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import ffmpegPath from "ffmpeg-static";
import { db } from "@contentforge/db";
import { createLogger } from "../shared/logger";

const logger = createLogger("thumbnail");

function getS3Client() {
  const accessKeyId =
    process.env.AWS_ACCESS_KEY_ID ?? process.env.REMOTION_AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.AWS_SECRET_ACCESS_KEY ??
    process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
  const region = process.env.REMOTION_AWS_REGION ?? "us-east-1";
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS credentials not configured (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)"
    );
  }
  return new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
}

function getBucketName() {
  const bucket = process.env.REMOTION_BUCKET_NAME;
  if (!bucket) throw new Error("REMOTION_BUCKET_NAME not set");
  return bucket;
}

/** Returns the CloudFront/S3 public URL for an object key. */
function publicUrl(bucket: string, key: string, region: string) {
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

/** Run ffmpeg to extract a single frame at `timestamp` seconds → writes to `outputFile`. */
function extractFrame(
  videoUrl: string,
  timestamp: number,
  outputFile: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg-static binary not found"));
      return;
    }
    // Seek before -i for fast input seeking (keyframe-accurate is close enough for thumbnails)
    const proc = spawn(ffmpegPath, [
      "-ss", String(timestamp.toFixed(3)),
      "-i", videoUrl,
      "-frames:v", "1",
      "-q:v", "3",               // JPEG quality 3 ≈ ~85% — good quality, small file
      "-vf", "scale=720:-2",     // 720px wide, preserve aspect ratio
      "-f", "image2",
      outputFile,
      "-y",
    ]);
    const stderr: string[] = [];
    proc.stderr.on("data", (d: Buffer) => stderr.push(d.toString()));
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(`ffmpeg exited ${code}\n${stderr.slice(-5).join("")}`)
        );
      }
    });
    proc.on("error", reject);
  });
}

/** Rough pixel-variance heuristic — returns the index of the most "energetic" frame. */
async function pickBestFrame(framePaths: string[]): Promise<number> {
  // Simple heuristic: largest file size = more detail = more interesting frame.
  const sizes = await Promise.all(
    framePaths.map((p) =>
      fs.stat(p).then((s) => s.size).catch(() => 0)
    )
  );
  return sizes.indexOf(Math.max(...sizes));
}

class ThumbnailService {
  async extractAndSave(clipId: string, videoUrl: string): Promise<void> {
    const region = process.env.REMOTION_AWS_REGION ?? "us-east-1";
    const bucket = getBucketName();
    const s3 = getS3Client();

    // Create a temp dir for this clip
    const tmpDir = path.join("/tmp", "thumbnails", clipId);
    await fs.mkdir(tmpDir, { recursive: true });

    try {
      // Probe duration via ffmpeg -i (writes to stderr)
      const durationSec = await probeDuration(videoUrl);

      // Calculate 5 frame timestamps
      const timestamps = [
        0.5,
        durationSec * 0.25,
        durationSec * 0.5,
        durationSec * 0.75,
        Math.max(0, durationSec - 1),
      ].map((t) => Math.max(0, Math.min(t, durationSec - 0.1)));

      logger.info("Extracting thumbnail frames", {
        clipId,
        durationSec,
        timestamps: timestamps.map((t) => t.toFixed(2)),
      });

      // Extract all frames in parallel
      const framePaths = timestamps.map((_, i) =>
        path.join(tmpDir, `frame-${i}.jpg`)
      );
      await Promise.all(
        timestamps.map((ts, i) => extractFrame(videoUrl, ts, framePaths[i]))
      );

      // Pick the best frame (largest = most detail)
      const bestIdx = await pickBestFrame(framePaths);

      // Upload all frames to S3
      const uploadedUrls: string[] = [];
      for (let i = 0; i < framePaths.length; i++) {
        const fileData = await fs.readFile(framePaths[i]).catch(() => null);
        if (!fileData) {
          logger.warn("Frame file missing, skipping", { clipId, frame: i });
          continue;
        }
        const key = `clips/${clipId}/thumbnails/frame-${i}.jpg`;
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: fileData,
            ContentType: "image/jpeg",
            ACL: "public-read",
          })
        );
        uploadedUrls.push(publicUrl(bucket, key, region));
      }

      if (uploadedUrls.length === 0) {
        throw new Error("All frame extractions failed");
      }

      const thumbnailUrl = uploadedUrls[bestIdx] ?? uploadedUrls[0];

      await db.repurposedClip.update({
        where: { id: clipId },
        data: { thumbnailCandidates: uploadedUrls, thumbnailUrl },
      });

      logger.info("Thumbnails saved", {
        clipId,
        count: uploadedUrls.length,
        bestIdx,
        thumbnailUrl,
      });
    } finally {
      // Clean up temp files
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => null);
    }
  }
}

/** Probe video duration via ffmpeg stderr output. Returns seconds (float). */
async function probeDuration(videoUrl: string): Promise<number> {
  return new Promise((resolve) => {
    if (!ffmpegPath) { resolve(30); return; }
    const proc = spawn(ffmpegPath, ["-i", videoUrl, "-f", "null", "-"]);
    const stderr: string[] = [];
    proc.stderr.on("data", (d: Buffer) => stderr.push(d.toString()));
    proc.on("close", () => {
      const output = stderr.join("");
      // Duration line looks like: "Duration: 00:00:27.43, start: ..."
      const match = output.match(/Duration:\s+(\d+):(\d+):(\d+\.\d+)/);
      if (match) {
        const h = parseInt(match[1]);
        const m = parseInt(match[2]);
        const s = parseFloat(match[3]);
        resolve(h * 3600 + m * 60 + s);
      } else {
        resolve(30); // fallback
      }
    });
    proc.on("error", () => resolve(30));
  });
}

class MockThumbnailService {
  async extractAndSave(clipId: string, _videoUrl: string): Promise<void> {
    logger.info("MOCK thumbnail extraction (no AWS configured)", { clipId });
  }
}

export const thumbnailService: { extractAndSave: (clipId: string, videoUrl: string) => Promise<void> } =
  process.env.REMOTION_BUCKET_NAME
    ? new ThumbnailService()
    : new MockThumbnailService();
