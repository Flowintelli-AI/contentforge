-- AddInstagramIntegration
-- IgConnection: stores creator's IG Business account OAuth token
CREATE TABLE "IgConnection" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "igUserId" TEXT NOT NULL,
    "igUsername" TEXT NOT NULL,
    "pageId" TEXT,
    "accessToken" TEXT NOT NULL,
    "tokenExpiry" TIMESTAMP(3),
    "webhookActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IgConnection_pkey" PRIMARY KEY ("id")
);

-- IgSubscriber: every person who opted in via comment/DM keyword
CREATE TABLE "IgSubscriber" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "igUserId" TEXT NOT NULL,
    "igUsername" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL,
    "optedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IgSubscriber_pkey" PRIMARY KEY ("id")
);

-- AutomationEvent: audit log of every trigger
CREATE TABLE "AutomationEvent" (
    "id" TEXT NOT NULL,
    "automationId" TEXT,
    "subscriberId" TEXT,
    "eventType" TEXT NOT NULL,
    "keyword" TEXT,
    "commentId" TEXT,
    "messageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationEvent_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on IgConnection.creatorId (one per creator)
CREATE UNIQUE INDEX "IgConnection_creatorId_key" ON "IgConnection"("creatorId");

-- Unique constraint: one subscriber record per creator per IG user
CREATE UNIQUE INDEX "IgSubscriber_creatorId_igUserId_key" ON "IgSubscriber"("creatorId", "igUserId");

-- Performance indexes
CREATE INDEX "IgSubscriber_creatorId_idx" ON "IgSubscriber"("creatorId");
CREATE INDEX "AutomationEvent_automationId_idx" ON "AutomationEvent"("automationId");
CREATE INDEX "AutomationEvent_subscriberId_idx" ON "AutomationEvent"("subscriberId");

-- Foreign keys
ALTER TABLE "IgConnection" ADD CONSTRAINT "IgConnection_creatorId_fkey"
    FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IgSubscriber" ADD CONSTRAINT "IgSubscriber_creatorId_fkey"
    FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationEvent" ADD CONSTRAINT "AutomationEvent_automationId_fkey"
    FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomationEvent" ADD CONSTRAINT "AutomationEvent_subscriberId_fkey"
    FOREIGN KEY ("subscriberId") REFERENCES "IgSubscriber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
