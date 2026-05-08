-- CreateEnum
CREATE TYPE "CarouselStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ClipStatus" ADD VALUE 'GENERATING_AI';
ALTER TYPE "ClipStatus" ADD VALUE 'DRAFT';

-- AlterTable
ALTER TABLE "InspireAccount" ALTER COLUMN "lastFetched" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InspireNiche" ALTER COLUMN "lastFetched" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "NicheOnCreator" ADD COLUMN     "pillars" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "RepurposedClip" ADD COLUMN     "costUsd" DOUBLE PRECISION,
ADD COLUMN     "format" TEXT,
ADD COLUMN     "isAIGenerated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reelScript" JSONB;

-- CreateTable
CREATE TABLE "BrandKit" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "brandName" TEXT,
    "handle" TEXT,
    "niche" TEXT,
    "primaryColor" TEXT DEFAULT '#06b6d4',
    "accentColor" TEXT DEFAULT '#8b5cf6',
    "logoUrl" TEXT,
    "website" TEXT,
    "voiceNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarouselRun" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'instagram',
    "status" "CarouselStatus" NOT NULL DEFAULT 'PENDING',
    "slideUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "caption" TEXT,
    "pdfUrl" TEXT,
    "webhookPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarouselRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarouselPipeline" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "maxPerDay" INTEGER NOT NULL DEFAULT 1,
    "platforms" TEXT[] DEFAULT ARRAY['instagram']::TEXT[],
    "lastRanAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarouselPipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NicheRssSource" (
    "id" TEXT NOT NULL,
    "nicheSlug" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "rssUrl" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NicheRssSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandKit_creatorId_key" ON "BrandKit"("creatorId");

-- CreateIndex
CREATE INDEX "CarouselRun_creatorId_createdAt_idx" ON "CarouselRun"("creatorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CarouselPipeline_creatorId_key" ON "CarouselPipeline"("creatorId");

-- CreateIndex
CREATE INDEX "NicheRssSource_nicheSlug_isActive_idx" ON "NicheRssSource"("nicheSlug", "isActive");

-- AddForeignKey
ALTER TABLE "BrandKit" ADD CONSTRAINT "BrandKit_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarouselRun" ADD CONSTRAINT "CarouselRun_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarouselPipeline" ADD CONSTRAINT "CarouselPipeline_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
