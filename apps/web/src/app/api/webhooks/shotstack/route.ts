import { db } from "@contentforge/db";
import { NextResponse } from "next/server";
import { reapService } from "@/lib/integrations/reap/service";
import { heyGenService } from "@/lib/integrations/heygen/service";

interface ShotstackCallback {
  id: string;
  status: "queued" | "fetching" | "rendering" | "saving" | "done" | "failed";
  url?: string;
  error?: string;
}

export async function POST(req: Request) {
  let body: ShotstackCallback;
  try {
    body = (await req.json()) as ShotstackCallback;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const clipId = searchParams.get("clipId");
  const purpose = searchParams.get("purpose"); // "heygen" for AI clip trim jobs

  // Prefer direct clipId lookup (new pipeline); fall back to opusClipId scan (legacy)
  const clip = clipId
    ? await db.repurposedClip.findUnique({ where: { id: clipId } })
    : await db.repurposedClip.findFirst({ where: { opusClipId: body.id } });

  if (!clip) {
    console.log(`[shotstack] no clip for renderId=${body.id} clipId=${clipId ?? "n/a"}`);
    return NextResponse.json({ ok: true });
  }

  if (body.status === "failed") {
    console.error(`[shotstack] render failed clip=${clip.id}:`, body.error ?? "unknown");
    await db.repurposedClip.update({ where: { id: clip.id }, data: { status: "FAILED" } });
    return NextResponse.json({ ok: true });
  }

  if (body.status !== "done" || !body.url) {
    return NextResponse.json({ ok: true }); // still in progress
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://contentforge-web-nine.vercel.app";

  // ── AI clip path: trimmed clip → HeyGen lipsync ───────────────────────────
  if (purpose === "heygen") {
    const audioUrl = searchParams.get("audioUrl");
    if (!audioUrl) {
      console.error(`[shotstack] purpose=heygen but no audioUrl param for clip=${clip.id}`);
      await db.repurposedClip.update({ where: { id: clip.id }, data: { status: "FAILED" } });
      return NextResponse.json({ ok: true });
    }

    const decodedAudioUrl = decodeURIComponent(audioUrl);
    console.log(`[shotstack] AI trim done clip=${clip.id} → submitting to HeyGen`);
    console.log(`[shotstack] trimmedVideo=${body.url} audio=${decodedAudioUrl}`);

    try {
      const { lipsyncId } = await heyGenService.submitLipsync({
        faceVideoUrl: body.url, // short trimmed clip (10-20s) — fits in $5 budget
        audioUrl: decodedAudioUrl,
        title: clip.title ?? undefined,
        callbackUrl: `${appUrl}/api/webhooks/heygen`,
      });

      await db.repurposedClip.update({
        where: { id: clip.id },
        data: { opusClipId: `heygen:${lipsyncId}` },
      });
      console.log(`[shotstack] clip=${clip.id} → HeyGen lipsyncId=${lipsyncId}`);
    } catch (err) {
      console.error(`[shotstack] HeyGen submission error clip=${clip.id}:`, err);
      await db.repurposedClip.update({ where: { id: clip.id }, data: { status: "FAILED" } });
    }

    return NextResponse.json({ ok: true });
  }

  // ── Type 1 clip path: Shotstack final render → Reap captions ─────────────
  console.log(`[shotstack] render done clip=${clip.id} url=${body.url}`);

  try {
    const projectId = await reapService.submitCaptions(body.url, {
      captionsPreset: "karaoke-bold",
      enableEmojis: true,
      enableHighlights: true,
      language: "en",
      webhookUrl: `${appUrl}/api/webhooks/reap?clipId=${clip.id}`,
    });

    await db.repurposedClip.update({
      where: { id: clip.id },
      data: { opusClipId: `reap:${projectId}` },
    });
    console.log(`[shotstack] clip=${clip.id} → Reap projectId=${projectId}`);
  } catch (err) {
    console.error(`[shotstack] Reap submission error clip=${clip.id}:`, err);
    await db.repurposedClip.update({ where: { id: clip.id }, data: { status: "FAILED" } });
  }

  return NextResponse.json({ ok: true });
}