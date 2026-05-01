-- CreateTable
CREATE TABLE IF NOT EXISTS "InspireNiche" (
  "id"          TEXT NOT NULL,
  "creatorId"   TEXT NOT NULL,
  "hashtag"     TEXT NOT NULL,
  "lastFetched" TIMESTAMPTZ,
  "posts"       JSONB NOT NULL DEFAULT '[]',
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "InspireNiche_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "InspireAccount" (
  "id"             TEXT NOT NULL,
  "creatorId"      TEXT NOT NULL,
  "username"       TEXT NOT NULL,
  "displayName"    TEXT,
  "avatarUrl"      TEXT,
  "followersCount" INTEGER,
  "lastFetched"    TIMESTAMPTZ,
  "posts"          JSONB NOT NULL DEFAULT '[]',
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "InspireAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique)
CREATE UNIQUE INDEX IF NOT EXISTS "InspireNiche_creatorId_hashtag_key" ON "InspireNiche"("creatorId", "hashtag");
CREATE UNIQUE INDEX IF NOT EXISTS "InspireAccount_creatorId_username_key" ON "InspireAccount"("creatorId", "username");

-- CreateIndex (lookup)
CREATE INDEX IF NOT EXISTS "InspireNiche_creatorId_idx" ON "InspireNiche"("creatorId");
CREATE INDEX IF NOT EXISTS "InspireAccount_creatorId_idx" ON "InspireAccount"("creatorId");

-- AddForeignKey
ALTER TABLE "InspireNiche"
  ADD CONSTRAINT "InspireNiche_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InspireAccount"
  ADD CONSTRAINT "InspireAccount_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
