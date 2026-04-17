import { auth } from "@clerk/nextjs/server";
import { db } from "@contentforge/db";
import { NextResponse } from "next/server";
import {
  transcribeVideo,
  selectBestSegments,
  submitShotstackRender,
} from "@/lib/video-processing";

// AssemblyAI transcription polls until done — can take several minutes for long videos
export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Resolve creator profile
  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const profile = await db.creatorProfile.findUnique({ where: { userId: user.id } });
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const video = await db.uploadedVideo.findFirst({
    where: { id: params.id, creatorId: profile.id },
  });
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  if (video.status === "PROCESSING") {
    return NextResponse.json({ error: "Video is already processing" }, { status: 409 });
  }

  // Mark video as processing
  await db.uploadedVideo.update({
    where: { id: video.id },
    data: { status: "PROCESSING" },
  });

  try {
    // Step 1: Transcribe with Whisper
    const { transcript, segments } = await transcribeVideo(video.storagePath);

    // Step 2: Select best 10 segments with GPT-4o
    const selectedSegments = await selectBestSegments(transcript, segments, 10);

    // Save transcript to DB
    await db.uploadedVideo.update({
      where: { id: video.id },
      data: { transcript },
    });

    // Step 3: Submit render jobs to Shotstack
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://contentforge-web-nine.vercel.app";
    const webhookUrl = `${appUrl}/api/webhooks/shotstack`;

    const clips = await Promise.allSettled(
      selectedSegments.map(async (seg) => {
        const renderId = await submitShotstackRender(video.storagePath, seg, webhookUrl);
        return db.repurposedClip.create({
          data: {
            videoId: video.id,
            title: seg.title,
            startTime: seg.startTime,
            endTime: seg.endTime,
            captions: seg.transcript,
            opusClipId: renderId,
            status: "PROCESSING",
            hashtags: [],
          },
        });
      })
    );

    const succeeded = clips.filter((r) => r.status === "fulfilled").length;
    const failed = clips.filter((r) => r.status === "rejected").length;

    // Restore video status to READY (Shotstack renders async)
    await db.uploadedVideo.update({
      where: { id: video.id },
      data: { status: "READY" },
    });

    return NextResponse.json({
      success: true,
      clipsQueued: succeeded,
      clipsFailed: failed,
    });
  } catch (err) {
    // Revert status so user can retry
    await db.uploadedVideo.update({
      where: { id: video.id },
      data: { status: "READY" },
    });

    const message = err instanceof Error ? err.message : "Processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
