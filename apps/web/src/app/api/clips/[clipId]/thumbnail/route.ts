import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";
import { db } from "@contentforge/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clipId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clipId } = await params;

  // Verify clip belongs to user
  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const profile = await db.creatorProfile.findUnique({ where: { userId: user.id } });
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const clip = await db.repurposedClip.findFirst({
    where: { id: clipId, video: { creatorId: profile.id } },
  });
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

  const contentType = req.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await req.arrayBuffer());

  const blob = await put(`clips/${clipId}/thumbnail-final.jpg`, buffer, {
    access: "public",
    contentType,
    addRandomSuffix: false,
  });

  await db.repurposedClip.update({
    where: { id: clipId },
    data: { thumbnailUrl: blob.url },
  });

  return NextResponse.json({ url: blob.url });
}
