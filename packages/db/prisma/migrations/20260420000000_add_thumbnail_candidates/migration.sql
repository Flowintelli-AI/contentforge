-- Add thumbnailCandidates array to RepurposedClip for multi-frame thumbnail selection
ALTER TABLE "RepurposedClip" ADD COLUMN IF NOT EXISTS "thumbnailCandidates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
