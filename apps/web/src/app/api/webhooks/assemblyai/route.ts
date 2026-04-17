import { db } from "@contentforge/db";
import { NextResponse } from "next/server";
import { selectBestSegments, submitShotstackRender } from "@/lib/video-processing";

export const maxDuration = 60;

interface AssemblyAIWord {
  start: number;
  end: number;
  text: string;
  confidence: number;
}

interface AssemblyAIWebhookPayload {
  transcript_id: string;
  status: "completed" | "error";
}

interface AssemblyAITranscript {
  id: string;
  status: "completed" | "error";
  text?: string;
  words?: AssemblyAIWord[];
  error?: string;
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");

  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  const payload = (await req.json()) as AssemblyAIWebhookPayload;
  console.log(`AssemblyAI webhook for video ${videoId}: status=${payload.status}, id=${payload.transcript_id}`);

  if (payload.status === "error") {
    await db.uploadedVideo.update({
      where: { id: videoId },
      data: { status: "READY" },
    });
    console.error(`AssemblyAI error for video ${videoId}`);
    return NextResponse.json({ ok: true });
  }

  if (payload.status !== "completed") {
    return NextResponse.json({ ok: true });
  }

  // Fetch the full transcript from AssemblyAI (webhook only sends id + status)
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  const transcriptRes = await fetch(
    `https://api.assemblyai.com/v2/transcript/${payload.transcript_id}`,
    { headers: { authorization: apiKey! } }
  );
  if (!transcriptRes.ok) {
    console.error(`Failed to fetch transcript ${payload.transcript_id}`);
    await db.uploadedVideo.update({ where: { id: videoId }, data: { status: "READY" } });
    return NextResponse.json({ ok: true });
  }
  const transcript = (await transcriptRes.json()) as AssemblyAITranscript;

  if (!transcript.text) {
    console.error(`Transcript ${payload.transcript_id} has no text`);
    await db.uploadedVideo.update({ where: { id: videoId }, data: { status: "READY" } });
    return NextResponse.json({ ok: true });
  }

  const video = await db.uploadedVideo.findUnique({ where: { id: videoId } });
  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  try {
    // Build word-level segments from AssemblyAI words (ms → seconds)
    const words = transcript.words ?? [];
    const segments =
      words.length > 0
        ? words.map((w) => ({ start: w.start / 1000, end: w.end / 1000, text: w.text }))
        : [{ start: 0, end: 999, text: transcript.text }];

    // Save transcript
    await db.uploadedVideo.update({
      where: { id: videoId },
      data: { transcript: transcript.text },
    });

    // GPT-4o picks best 10 segments
    const selectedSegments = await selectBestSegments(transcript.text, segments, 10);

    // Submit Shotstack renders
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://contentforge-web-nine.vercel.app";
    const shotstackWebhook = `${appUrl}/api/webhooks/shotstack`;

    const results = await Promise.allSettled(
      selectedSegments.map(async (seg) => {
        const renderId = await submitShotstackRender(video.storagePath, seg, shotstackWebhook);
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

    const succeeded = results.filter((r) => r.status === "fulfilled").length;

    // Mark video as ready
    await db.uploadedVideo.update({
      where: { id: videoId },
      data: { status: "READY" },
    });

    console.log(`Video ${videoId}: ${succeeded} clips queued for rendering`);
    return NextResponse.json({ ok: true, clipsQueued: succeeded });
  } catch (err) {
    console.error(`AssemblyAI webhook processing failed for video ${videoId}:`, err);
    await db.uploadedVideo.update({
      where: { id: videoId },
      data: { status: "READY" },
    });
    return NextResponse.json({ ok: true });
  }
}
