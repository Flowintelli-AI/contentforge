import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { IdeaStatus, ContentPillarType } from "@prisma/client";
import { generateRefinedIdea } from "../../lib/ai/agents/contentStrategist";
import { TRPCError } from "@trpc/server";

export const ideasRouter = router({
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
      const { creatorProfile } = ctx;
      const skip = (input.page - 1) * input.limit;

      const [ideas, total] = await Promise.all([
        ctx.db.contentIdea.findMany({
          where: {
            creatorId: creatorProfile.id,
            ...(input.status && { status: input.status }),
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: input.limit,
          include: { scripts: { select: { id: true, status: true } } },
        }),
        ctx.db.contentIdea.count({
          where: { creatorId: creatorProfile.id, ...(input.status && { status: input.status }) },
        }),
      ]);

      return { ideas, total, pages: Math.ceil(total / input.limit) };
    }),

  // ── GET ONE ───────────────────────────────────────────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const idea = await ctx.db.contentIdea.findFirst({
        where: { id: input.id, creatorId: ctx.creatorProfile.id },
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
      const { creatorProfile } = ctx;

      // AI refines the raw idea
      const refinedIdea = await generateRefinedIdea({
        rawIdea: input.rawIdea,
        niche: creatorProfile.niches?.[0]?.niche?.name ?? "general",
      });

      const idea = await ctx.db.contentIdea.create({
        data: {
          creatorId: creatorProfile.id,
          rawIdea: input.rawIdea,
          refinedIdea,
          status: IdeaStatus.SUBMITTED,
          pillarType: input.pillarType,
          tags: input.tags,
        },
      });

      // Queue async script generation job
      await ctx.jobs.enqueue("generate-script", { ideaId: idea.id });

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
      const idea = await ctx.db.contentIdea.update({
        where: { id: input.id },
        data: { status: input.status },
      });

      await ctx.db.adminReview.upsert({
        where: { ideaId: input.id },
        create: {
          ideaId: input.id,
          reviewerId: ctx.user.id,
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
          userId: ctx.user.id,
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
      const { creatorProfile } = ctx;

      const created = await ctx.db.$transaction(
        input.ideas.map((idea) =>
          ctx.db.contentIdea.create({
            data: {
              creatorId: creatorProfile.id,
              rawIdea: idea.rawIdea,
              status: IdeaStatus.SUBMITTED,
              pillarType: idea.pillarType,
              tags: idea.tags,
            },
          })
        )
      );

      // Queue batch processing
      await ctx.jobs.enqueue("batch-process-ideas", {
        ideaIds: created.map((i) => i.id),
      });

      return { created: created.length };
    }),
});
