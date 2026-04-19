import { db } from "@contentforge/db";
import { NextResponse } from "next/server";

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
  console.log(
    `[assemblyai] webhook for video ${videoId}: status=${payload.status}, id=${payload.transcript_id}`
  );

  if (payload.status === "error") {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    const errRes = await fetch(
      `https://api.assemblyai.com/v2/transcript/${payload.transcript_id}`,
      { headers: { authorization: apiKey! } }
    );
    const errData = errRes.ok ? await errRes.json() : {};
    console.error(
      `[assemblyai] error for video ${videoId}:`,
      errData.error ?? "unknown error",
      "| url:",
      errData.audio_url
    );
    await db.uploadedVideo.update({
      where: { id: videoId },
      data: { status: "READY" },
    });
    return NextResponse.json({ ok: true });
  }

  if (payload.status !== "completed") {
    return NextResponse.json({ ok: true });
  }

  const video = await db.uploadedVideo.findUnique({ where: { id: videoId } });
  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  // Idempotency: skip if already submitted to Submagic
  if (video.submagicProjectId) {
    console.log(
      `[assemblyai] video ${videoId} already submitted to Submagic (projectId=${video.submagicProjectId}), skipping`
    );
    return NextResponse.json({ ok: true });
  }

  // Fetch full transcript from AssemblyAI
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  const transcriptRes = await fetch(
    `https://api.assemblyai.com/v2/transcript/${payload.transcript_id}`,
    { headers: { authorization: apiKey! } }
  );
  if (!transcriptRes.ok) {
    console.error(`[assemblyai] failed to fetch transcript ${payload.transcript_id}`);
    await db.uploadedVideo.update({
      where: { id: videoId },
      data: { status: "READY" },
    });
    return NextResponse.json({ ok: true });
  }
  const transcript = (await transcriptRes.json()) as AssemblyAITranscript;

  // Save transcript text to DB
  await db.uploadedVideo.update({
    where: { id: videoId },
    data: { transcript: transcript.text ?? null },
  });

  if (!transcript.text) {
    console.warn(`[assemblyai] transcript ${payload.transcript_id} has no text`);
    await db.uploadedVideo.update({
      where: { id: videoId },
      data: { status: "READY" },
    });
    return NextResponse.json({ ok: true });
  }

  // Submit to Submagic Magic Clips for viral reel generation
  try {
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      "https://contentforge-web-nine.vercel.app";

    const submagicRes = await fetch(
      "https://api.submagic.co/v1/projects/magic-clips",
      {
        method: "POST",
        headers: {
          "x-api-key": process.env.SUBMAGIC_API_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: video.title ?? "ContentForge Video",
          language: "en",
          videoUrl: video.storagePath,
          webhookUrl: `${appUrl}/api/webhooks/submagic?videoId=${videoId}`,
          minClipLength: 20,
          maxClipLength: 60,
          templateName: "Hormozi 2",
        }),
      }
    );

    if (!submagicRes.ok) {
      const errText = await submagicRes.text();
      console.error(`[submagic] failed to submit video ${videoId}:`, errText);
      await db.uploadedVideo.update({
        where: { id: videoId },
        data: { status: "READY" },
      });
      return NextResponse.json({ ok: true });
    }

    const submagicData = (await submagicRes.json()) as { projectId: string };
    console.log(
      `[submagic] submitted video ${videoId} → projectId=${submagicData.projectId}`
    );

    await db.uploadedVideo.update({
      where: { id: videoId },
      data: { submagicProjectId: submagicData.projectId },
    });

    return NextResponse.json({
      ok: true,
      submagicProjectId: submagicData.projectId,
    });
  } catch (err) {
    console.error(
      `[assemblyai] Submagic submission failed for video ${videoId}:`,
      err
    );
    await db.uploadedVideo.update({
      where: { id: videoId },
      data: { status: "READY" },
    });
    return NextResponse.json({ ok: true });
  }
}