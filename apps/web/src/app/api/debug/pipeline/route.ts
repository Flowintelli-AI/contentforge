import { NextResponse } from "next/server";
import { db } from "@contentforge/db";

export const dynamic = "force-dynamic";

// Quick debug endpoint — remove after diagnosis
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pipelines = await db.carouselPipeline.findMany({
    where: { isActive: true },
    include: {
      creator: {
        include: {
          brandKit: true,
          igConnection: true,
        },
      },
    },
  });

  const summary = pipelines.map((p) => ({
    pipelineId: p.id,
    creatorId: p.creatorId,
    isActive: p.isActive,
    platforms: p.platforms,
    maxPerDay: p.maxPerDay,
    lastRanAt: p.lastRanAt,
    hasIgConnection: !!p.creator.igConnection,
    igUserId: p.creator.igConnection?.igUserId ?? null,
    igUsername: p.creator.igConnection?.igUsername ?? null,
    igTokenExpiry: p.creator.igConnection?.tokenExpiry ?? null,
    hasBrandKit: !!p.creator.brandKit,
  }));

  return NextResponse.json({ pipelines: summary });
}
