import { z } from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "@/server/trpc";
import { IdeaStatus, ContentPillarType } from "@prisma/client";
import { generateRefinedIdea } from "@/lib/ai/agents/contentStrategist";
import { generateScript } from "@/lib/ai/agents/scriptWriter";
import { TRPCError } from "@trpc/server";

export const ideasRouter = createTRPCRouter({
  // ── LIST ─────────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        status: z.nativeEnum(IdeaStatus).optional(),
        page: z.number().default(1),
        limit: z.number().max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { clerkId: ctx.userId } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      const profile = await ctx.db.creatorProfile.findUnique({ where: { userId: user.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Complete onboarding first" });

      const skip = (input.page - 1) * input.limit;

      const [ideas, total] = await Promise.all([
        ctx.db.contentIdea.findMany({
          where: {
            creatorId: profile.id,
            ...(input.status && { status: input.status }),
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: input.limit,
          include: { scripts: { select: { id: true, status: true } } },
        }),
        ctx.db.contentIdea.count({
          where: { creatorId: profile.id, ...(input.status && { status: input.status }) },
        }),
      ]);

      return { ideas, total, pages: Math.ceil(total / input.limit) };
    }),

  // ── GET ONE ───────────────────────────────────────────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { clerkId: ctx.userId } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      const profile = await ctx.db.creatorProfile.findUnique({ where: { userId: user.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });

      const idea = await ctx.db.contentIdea.findFirst({
        where: { id: input.id, creatorId: profile.id },
        include: { scripts: true, adminReview: true },
      });
      if (!idea) throw new TRPCError({ code: "NOT_FOUND" });
      return idea;
    }),

  // ── SUBMIT IDEA ───────────────────────────────────────────────────────
  submit: protectedProcedure
    .input(
      z.object({
        rawIdea: z.string().min(10).max(2000),
        pillarType: z.nativeEnum(ContentPillarType).optional(),
        tags: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { clerkId: ctx.userId } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      const profile = await ctx.db.creatorProfile.findUnique({
        where: { userId: user.id },
        include: { niches: { include: { niche: true } } },
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Complete onboarding first" });

      // AI refines the raw idea
      const refinedIdea = await generateRefinedIdea(input.rawIdea);

      const idea = await ctx.db.contentIdea.create({
        data: {
          creatorId: profile.id,
          rawIdea: input.rawIdea,
          refinedIdea,
          status: IdeaStatus.SUBMITTED,
          pillarType: input.pillarType,
          tags: input.tags,
        },
      });

      // Auto-generate a structured script immediately
      try {
        const primaryNiche = profile.niches[0]?.niche?.name;
        const scriptData = await generateScript(input.rawIdea, refinedIdea, primaryNiche);

        const scriptBody = [
          `🎣 HOOK\n${scriptData.hook}`,
          `😤 PAIN POINT\n${scriptData.painPoint}`,
          `🏆 AUTHORITY\n${scriptData.authority}`,
          `💡 SOLUTION\n${scriptData.solution}`,
          `📣 CALL TO ACTION\n${scriptData.callToAction}`,
        ].join("\n\n");

        const script = await ctx.db.script.create({
          data: {
            ideaId: idea.id,
            title: refinedIdea.slice(0, 100),
            hook: scriptData.hook,
            painPoint: scriptData.painPoint,
            authority: scriptData.authority,
            solution: scriptData.solution,
            callToAction: scriptData.callToAction,
            fullScript: scriptBody,
            estimatedDuration: scriptData.estimatedDurationSeconds,
            status: "DRAFT",
          },
        });

        await ctx.db.scriptVersion.create({
          data: {
            scriptId: script.id,
            version: 1,
            snapshot: {
              hook: scriptData.hook,
              painPoint: scriptData.painPoint,
              authority: scriptData.authority,
              solution: scriptData.solution,
              callToAction: scriptData.callToAction,
              hashtags: scriptData.hashtags,
              caption: scriptData.caption,
              fullScript: scriptBody,
            },
          },
        });

        // Mark idea as scripted
        await ctx.db.contentIdea.update({
          where: { id: idea.id },
          data: { status: IdeaStatus.SCRIPTED },
        });
      } catch (err) {
        // Script generation failure is non-fatal — idea still saved
        console.error("[script-gen] failed:", err);
      }

      return idea;
    }),

  // ── UPDATE STATUS ─────────────────────────────────────────────────────
  updateStatus: adminProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.nativeEnum(IdeaStatus),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const adminUser = await ctx.db.user.findUnique({ where: { clerkId: ctx.userId } });
      if (!adminUser) throw new TRPCError({ code: "NOT_FOUND" });

      const idea = await ctx.db.contentIdea.update({
        where: { id: input.id },
        data: { status: input.status },
      });

      await ctx.db.adminReview.upsert({
        where: { ideaId: input.id },
        create: {
          ideaId: input.id,
          reviewerId: adminUser.id,
          status: input.status === IdeaStatus.APPROVED ? "APPROVED" : "REVISION_REQUESTED",
          notes: input.notes,
          reviewedAt: new Date(),
        },
        update: {
          status: input.status === IdeaStatus.APPROVED ? "APPROVED" : "REVISION_REQUESTED",
          notes: input.notes,
          reviewedAt: new Date(),
        },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: adminUser.id,
          action: `IDEA_STATUS_${input.status}`,
          entityType: "ContentIdea",
          entityId: input.id,
          meta: { notes: input.notes },
        },
      });

      return idea;
    }),

  // ── BULK SUBMIT (batch idea dump) ─────────────────────────────────────
  bulkSubmit: protectedProcedure
    .input(
      z.object({
        ideas: z.array(
          z.object({
            rawIdea: z.string().min(5).max(2000),
            pillarType: z.nativeEnum(ContentPillarType).optional(),
            tags: z.array(z.string()).default([]),
          })
        ).max(30),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { clerkId: ctx.userId } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      const profile = await ctx.db.creatorProfile.findUnique({ where: { userId: user.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Complete onboarding first" });

      const created = await ctx.db.$transaction(
        input.ideas.map((idea) =>
          ctx.db.contentIdea.create({
            data: {
              creatorId: profile.id,
              rawIdea: idea.rawIdea,
              status: IdeaStatus.SUBMITTED,
              pillarType: idea.pillarType,
              tags: idea.tags,
            },
          })
        )
      );

      // TODO: enqueue batch processing
      // await jobs.enqueue("batch-process-ideas", { ideaIds: created.map((i) => i.id) });

      return { created: created.length };
    }),
});
