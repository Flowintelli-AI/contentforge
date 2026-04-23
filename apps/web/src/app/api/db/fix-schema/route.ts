import { NextRequest, NextResponse } from "next/server";
import { db } from "@contentforge/db";

// One-time migration endpoint: adds the thumbnailCandidates column to RepurposedClip.
// Protected by DB_FIX_SECRET env var. Remove after running once.
export async function POST(req: NextRequest) {
  const secret = process.env.DB_FIX_SECRET;
  if (!secret || req.headers.get("x-fix-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await db.$executeRaw`
      ALTER TABLE "RepurposedClip"
      ADD COLUMN IF NOT EXISTS "thumbnailCandidates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
    `;
    return NextResponse.json({ success: true, message: "Column added (or already existed)" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
