import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const hasDbUrl = !!process.env.DATABASE_URL;
  const dbUrlPrefix = process.env.DATABASE_URL?.slice(0, 30) ?? "NOT SET";

  let dbOk = false;
  let dbError: string | null = null;

  try {
    const { db } = await import("@contentforge/db");
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({ hasDbUrl, dbUrlPrefix, dbOk, dbError });
}
