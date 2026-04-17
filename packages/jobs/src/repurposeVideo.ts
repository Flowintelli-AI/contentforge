// Background job: video repurposing via Opus Clip

import { createClipJob, pollClipJob } from "../../packages/integrations/src/opusclip";
import { db } from "../../packages/db/src/client";
import { VideoStatus, ClipStatus } from "@prisma/client";

export interface RepurposeVideoPayload {
  videoId: string;
  targetClipCount?: number;
  clipDurations?: number[];
}

export async function runRepurposeVideo({
  videoId,
  targetClipCount = 5,
  clipDurations = [30, 60],
}: RepurposeVideoPayload) {
  console.log(`[job:repurpose-video] Starting for videoId=${videoId}`);

  const video = await db.uploadedVideo.findUniqueOrThrow({ where: { id: videoId } });

  if (!video.storagePath) throw new Error("Video has no storage path");
  if (video.status !== VideoStatus.READY) throw new Error("Video not ready yet");

  // 1. Create Opus Clip job
  const job = await createClipJob({
    videoUrl: video.storagePath,
    numClips: targetClipCount,
    targetDurations: clipDurations,
  });

  // 2. Poll until complete (max 15 min)
  const result = await pollClipJob(job.jobId, { maxMinutes: 15 });

  if (result.status === "failed") {
    throw new Error(`Opus Clip job failed: ${result.error}`);
  }

  // 3. Save clips to DB
  const clips = await Promise.all(
    (result.clips ?? []).map((clip) =>
      db.repurposedClip.create({
        data: {
          videoId,
          title: `Clip — ${clip.duration}s`,
          storagePath: clip.url,
          duration: clip.duration,
          startTime: clip.startTime,
          endTime: clip.endTime,
          status: ClipStatus.READY,
          opusClipId: clip.id,
          captions: clip.captions,
        },
      })
    )
  );

  console.log(`[job:repurpose-video] Done — ${clips.length} clips created`);
  return { clipIds: clips.map((c) => c.id) };
}
