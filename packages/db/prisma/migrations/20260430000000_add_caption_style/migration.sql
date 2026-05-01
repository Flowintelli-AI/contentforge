-- Add captionStyle field to RepurposedClip for tracking which caption overlay style was used
-- Values: KARAOKE | HIGHLIGHT | CLEAN (nullable, null = not yet set / pre-feature clips)
ALTER TABLE "RepurposedClip" ADD COLUMN IF NOT EXISTS "captionStyle" TEXT;
