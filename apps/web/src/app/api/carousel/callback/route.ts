import { NextRequest, NextResponse } from "next/server";
import { db } from "@contentforge/db";

export async function POST(req: NextRequest) {
  // Validate secret header
  const secret = req.headers.get("x-callback-secret");
  if (secret !== process.env.CAROUSEL_CALLBACK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    carousel_run_id?: string;
    slides_cloudinary_urls?: string[];
    caption?: string;
    pdf_base64?: string;
    platform_fitness?: Record<string, number>;
    post_recommendation?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.carousel_run_id) {
    return NextResponse.json({ error: "carousel_run_id is required" }, { status: 400 });
  }

  const slideUrls = body.slides_cloudinary_urls ?? [];
  const pdfUrl = body.pdf_base64
    ? `data:application/pdf;base64,${body.pdf_base64}`
    : null;

  await db.carouselRun.update({
    where: { id: body.carousel_run_id },
    data: {
      status: "DONE",
      slideUrls,
      caption: body.caption ?? null,
      pdfUrl,
    },
  });

  return NextResponse.json({ ok: true });
}
