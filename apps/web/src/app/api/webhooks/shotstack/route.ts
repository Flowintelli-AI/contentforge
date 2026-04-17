import { db } from "@contentforge/db";
import { NextResponse } from "next/server";

/**
 * Shotstack sends a POST to this URL when a render completes or fails.
 * Payload shape: the `response` object from the render status endpoint.
 */
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

  if (!body.id) {
    return NextResponse.json({ ok: true });
  }

  const clip = await db.repurposedClip.findFirst({
    where: { opusClipId: body.id },
  });

  if (!clip) {
    return NextResponse.json({ ok: true });
  }

  if (body.status === "done" && body.url) {
    await db.repurposedClip.update({
      where: { id: clip.id },
      data: {
        storagePath: body.url,
        status: "READY",
      },
    });
  } else if (body.status === "failed") {
    await db.repurposedClip.update({
      where: { id: clip.id },
      data: { status: "FAILED" },
    });
  }

  return NextResponse.json({ ok: true });
}
