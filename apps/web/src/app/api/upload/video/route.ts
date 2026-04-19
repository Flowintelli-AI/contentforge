import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = "contentforge-videos";
const ALLOWED_EXTENSIONS = [".mp4", ".mov", ".avi", ".webm", ".mpeg", ".mpg", ".mpeg4", ".m4v", ".3gp", ".mkv"];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { filename, contentType, sizeBytes } = await request.json() as {
      filename: string;
      contentType: string;
      sizeBytes: number;
    };

    console.log("[upload/video] filename:", filename, "contentType:", contentType, "sizeBytes:", sizeBytes);
    const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
    if (!contentType.startsWith("video/") && !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: `Invalid file type: ${contentType} (${ext})` }, { status: 400 });
    }
    if (sizeBytes > 500 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 500 MB)" }, { status: 400 });
    }

    // Always normalise to .mp4 + video/mp4 so Shotstack can decode the video.
    // Browsers often report "" or "video/mpeg4" for .mpeg4 files, which causes R2
    // to store the object as application/octet-stream and Shotstack to render a
    // black video track.
    const safeName = filename
      .replace(/\s+/g, "-")
      .replace(/\.(mpeg4|mpeg|mov|avi|webm|m4v|3gp|mkv)$/i, ".mp4");
    const normalizedContentType = "video/mp4";

    const key = `videos/${Date.now()}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: normalizedContentType,
    });

    // Presigned URL valid for 1 hour
    const presignedUrl = await getSignedUrl(r2, command, { expiresIn: 3600 });
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

    // Return normalizedContentType so the client uses it in the XHR PUT header
    // (must match what the presigned URL was signed with, or R2 returns 403)
    return NextResponse.json({ presignedUrl, publicUrl, key, contentType: normalizedContentType });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}
