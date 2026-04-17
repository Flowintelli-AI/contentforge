import { auth } from "@clerk/nextjs/server";
import { db } from "@contentforge/db";
import { NextResponse } from "next/server";
import { submitTranscriptionJob } from "@/lib/video-processing";

export const maxDuration = 30;

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  await db.uploadedVideo.update({
    where: { id: video.id },
    data: { status: "PROCESSING" },
  });

  try {
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://contentforge-web-nine.vercel.app";
    // Pass videoId as query param so the webhook knows which video to update
    const webhookUrl = `${appUrl}/api/webhooks/assemblyai?videoId=${video.id}`;

    // Submit to AssemblyAI and return immediately — webhook handles the rest
    await submitTranscriptionJob(video.storagePath, webhookUrl);

    return NextResponse.json({ success: true, message: "Transcription started. Clips will appear shortly." });
  } catch (err) {
    await db.uploadedVideo.update({
      where: { id: video.id },
      data: { status: "READY" },
    });
    const message = err instanceof Error ? err.message : "Processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
