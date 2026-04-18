import { auth } from "@clerk/nextjs/server";
import { db } from "@contentforge/db";
import { NextResponse } from "next/server";

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
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY is not set");

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://contentforge-web-nine.vercel.app";
    const webhookUrl = `${appUrl}/api/webhooks/assemblyai?videoId=${video.id}`;

    console.log(`[process] submitting transcription for video=${video.id} storagePath=${video.storagePath}`);

    // Inline AssemblyAI call — no speech_models param (fixes cached build issue)
    const res = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: {
        authorization: apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        audio_url: video.storagePath,
        speech_models: ["universal-2"],
        punctuate: true,
        format_text: true,
        webhook_url: webhookUrl,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`AssemblyAI submit error ${res.status}: ${err}`);
    }

    const { id: transcriptId } = (await res.json()) as { id: string };
    console.log(`[process] ✅ transcription submitted id=${transcriptId} for video=${video.id}`);

    return NextResponse.json({ success: true, message: "Transcription started. Clips will appear shortly." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    console.error(`[process] ❌ error for video=${video.id}: ${message}`);
    await db.uploadedVideo.update({
      where: { id: video.id },
      data: { status: "READY" },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
