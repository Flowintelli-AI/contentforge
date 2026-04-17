// Background job: script generation
// Triggered by ideas router when an idea is submitted
// Uses Trigger.dev (or can be swapped for BullMQ)

import { generateScript } from "../../packages/ai/src/agents/scriptWriter";
import { db } from "../../packages/db/src/client";
import { ScriptStatus, IdeaStatus, Platform } from "@prisma/client";

export interface GenerateScriptPayload {
  ideaId: string;
}

export async function runGenerateScript({ ideaId }: GenerateScriptPayload) {
  console.log(`[job:generate-script] Starting for ideaId=${ideaId}`);

  // 1. Load idea + creator profile + niche
  const idea = await db.contentIdea.findUniqueOrThrow({
    where: { id: ideaId },
    include: {
      creator: {
        include: {
          niches: { include: { niche: true }, where: { isPrimary: true } },
        },
      },
    },
  });

  const niche = idea.creator.niches[0]?.niche?.name ?? "general";
  const primaryPlatform = Platform.TIKTOK; // default; can be creator preference

  // 2. Generate script via AI
  const scriptData = await generateScript({
    refinedIdea: idea.refinedIdea ?? idea.rawIdea,
    niche,
    platform: primaryPlatform,
    pillarType: idea.pillarType ?? undefined,
  });

  // 3. Save script to DB
  const script = await db.script.create({
    data: {
      ideaId: idea.id,
      title: scriptData.title,
      hook: scriptData.hook,
      painPoint: scriptData.painPoint,
      authority: scriptData.authority,
      solution: scriptData.solution,
      callToAction: scriptData.callToAction,
      fullScript: scriptData.fullScript,
      status: ScriptStatus.PENDING_REVIEW,
      platform: primaryPlatform,
      wordCount: scriptData.wordCount,
    },
  });

  // 4. Save initial version snapshot
  await db.scriptVersion.create({
    data: {
      scriptId: script.id,
      version: 1,
      snapshot: scriptData as object,
      note: "AI-generated v1",
    },
  });

  // 5. Update idea status
  await db.contentIdea.update({
    where: { id: ideaId },
    data: { status: IdeaStatus.SCRIPTED },
  });

  console.log(`[job:generate-script] Done — scriptId=${script.id}`);
  return { scriptId: script.id };
}
