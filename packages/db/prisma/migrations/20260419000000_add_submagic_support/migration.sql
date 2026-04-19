-- AlterTable: add submagicProjectId to UploadedVideo
ALTER TABLE "UploadedVideo" ADD COLUMN "submagicProjectId" TEXT;

-- AlterTable: add thumbnailUrl to RepurposedClip
ALTER TABLE "RepurposedClip" ADD COLUMN "thumbnailUrl" TEXT;