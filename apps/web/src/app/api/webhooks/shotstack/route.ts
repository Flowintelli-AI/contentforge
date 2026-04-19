import { db } from "@contentforge/db";
import { NextResponse } from "next/server";

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

  console.log(`[shotstack] trim done clip=${clip.id} url=${body.url}`);

  // Trimmed clip ready → submit to Submagic for viral treatment (captions, music, template)
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://contentforge-web-nine.vercel.app";

  try {
    const submagicRes = await fetch("https://api.submagic.co/v1/projects/magic-clips", {
      method: "POST",
      headers: {
        "x-api-key": process.env.SUBMAGIC_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: clip.title ?? "ContentForge Clip",
        language: "en",
        videoUrl: body.url,
        webhookUrl: `${appUrl}/api/webhooks/submagic?clipId=${clip.id}`,
        minClipLength: 20,
        maxClipLength: 75,
        templateName: "Hormozi 2",
      }),
    });

    if (!submagicRes.ok) {
      const errText = await submagicRes.text();
      console.error(`[shotstack] Submagic submission failed clip=${clip.id}:`, errText);
      await db.repurposedClip.update({ where: { id: clip.id }, data: { status: "FAILED" } });
    } else {
      const submagicData = (await submagicRes.json()) as { projectId: string };
      // Store Submagic projectId in opusClipId (repurposing legacy field as tracking ref)
      await db.repurposedClip.update({
        where: { id: clip.id },
        data: { opusClipId: `submagic:${submagicData.projectId}` },
      });
      console.log(
        `[shotstack] clip=${clip.id} → Submagic projectId=${submagicData.projectId}`
      );
    }
  } catch (err) {
    console.error(`[shotstack] Submagic submission error clip=${clip.id}:`, err);
    await db.repurposedClip.update({ where: { id: clip.id }, data: { status: "FAILED" } });
  }

  return NextResponse.json({ ok: true });
}
