import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter as router, protectedProcedure } from "../trpc";

async function getProfile(ctx: { userId: string; db: { user: { findUnique: Function }; creatorProfile: { findUnique: Function } } }) {
  const user = await ctx.db.user.findUnique({ where: { clerkId: ctx.userId } });
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  const profile = await ctx.db.creatorProfile.findUnique({ where: { userId: user.id } });
  if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Creator profile not found" });
  return profile as { id: string };
}

export const carouselRouter = router({
  generate: protectedProcedure
    .input(z.object({
      articleTitle: z.string().min(1),
      articleBody: z.string().min(1),
      platform: z.enum(["instagram", "linkedin"]).default("instagram"),
      brandOverride: z.object({
        name: z.string().optional(),
        handle: z.string().optional(),
        niche: z.string().optional(),
        primary_color: z.string().optional(),
        accent_color: z.string().optional(),
        logo_url: z.string().optional(),
        website: z.string().optional(),
        voice_notes: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);

      // Fetch stored brand kit
      const kit = await ctx.db.brandKit.findUnique({ where: { creatorId: profile.id } });

      const brand = {
        name: input.brandOverride?.name ?? kit?.brandName ?? undefined,
        handle: input.brandOverride?.handle ?? kit?.handle ?? undefined,
        niche: input.brandOverride?.niche ?? kit?.niche ?? undefined,
        primary_color: input.brandOverride?.primary_color ?? kit?.primaryColor ?? undefined,
        accent_color: input.brandOverride?.accent_color ?? kit?.accentColor ?? undefined,
        logo_url: input.brandOverride?.logo_url ?? kit?.logoUrl ?? undefined,
        website: input.brandOverride?.website ?? kit?.website ?? undefined,
        voice_notes: input.brandOverride?.voice_notes ?? kit?.voiceNotes ?? undefined,
      };

      const webhookUrl = process.env.MAKE_CAROUSEL_WEBHOOK_URL;
      if (!webhookUrl) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "MAKE_CAROUSEL_WEBHOOK_URL not configured" });

      // Create a PENDING run first so we have an ID to send to Make
      const run = await ctx.db.carouselRun.create({
        data: {
          creatorId: profile.id,
          title: input.articleTitle,
          platform: input.platform,
          status: "PENDING",
          webhookPayload: { article_title: input.articleTitle, platform: input.platform, brand } as object,
        },
      });

      const payload = {
        carousel_run_id: run.id,
        article_title: input.articleTitle,
        article_body: input.articleBody,
        platform: input.platform,
        brand,
      };

      // Fire-and-forget — Make responds immediately with {"accepted":true}
      // Results come back via /api/carousel/callback
      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          await ctx.db.carouselRun.update({ where: { id: run.id }, data: { status: "FAILED" } });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Webhook returned ${res.status}` });
        }
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        await ctx.db.carouselRun.update({ where: { id: run.id }, data: { status: "FAILED" } });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to reach Make webhook: ${err}` });
      }

      // Return the pending run — UI polls carousel.list to see when it becomes DONE
      return {
        run,
        slides: [],
        caption: "",
        platformFitness: {},
        postRecommendation: "",
      };
    }),

  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);
      return ctx.db.carouselRun.findFirst({ where: { id: input.id, creatorId: profile.id } });
    }),

  list: protectedProcedure
    .input(z.object({ cursor: z.string().optional(), limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);
      const runs = await ctx.db.carouselRun.findMany({
        where: { creatorId: profile.id },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
      });
      const hasMore = runs.length > input.limit;
      return { runs: runs.slice(0, input.limit), nextCursor: hasMore ? runs[input.limit - 1]?.id : undefined };
    }),

  /** Get the carousel pipeline config for the current creator. */
  pipelineGet: protectedProcedure.query(async ({ ctx }) => {
    const profile = await getProfile(ctx);
    const pipeline = await ctx.db.carouselPipeline.findUnique({ where: { creatorId: profile.id } });
    return pipeline;
  }),

  /** Create or update the carousel pipeline config. */
  pipelineSave: protectedProcedure
    .input(z.object({
      isActive: z.boolean().optional(),
      maxPerDay: z.number().min(1).max(10).optional(),
      platforms: z.array(z.enum(["instagram", "linkedin"])).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);
      const pipeline = await ctx.db.carouselPipeline.upsert({
        where: { creatorId: profile.id },
        create: {
          creatorId: profile.id,
          isActive: input.isActive ?? false,
          maxPerDay: input.maxPerDay ?? 1,
          platforms: input.platforms ?? ["instagram"],
        },
        update: {
          ...(input.isActive !== undefined && { isActive: input.isActive }),
          ...(input.maxPerDay !== undefined && { maxPerDay: input.maxPerDay }),
          ...(input.platforms !== undefined && { platforms: input.platforms }),
        },
      });
      return pipeline;
    }),

  /** Toggle the pipeline on/off. */
  pipelineToggle: protectedProcedure.mutation(async ({ ctx }) => {
    const profile = await getProfile(ctx);
    const existing = await ctx.db.carouselPipeline.findUnique({ where: { creatorId: profile.id } });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "No pipeline configured. Call pipelineSave first." });
    const updated = await ctx.db.carouselPipeline.update({
      where: { creatorId: profile.id },
      data: { isActive: !existing.isActive },
    });
    return updated;
  }),

  /**
   * Manually trigger one carousel generation + Instagram post for the current creator.
   * Calls Azure Function directly (bypasses Make.com) — uses stored BrandKit.
   */
  triggerNow: protectedProcedure
    .input(z.object({
      articleTitle: z.string().min(1),
      articleBody: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);
      const kit = await ctx.db.brandKit.findUnique({ where: { creatorId: profile.id } });
      const igConn = await ctx.db.igConnection.findUnique({ where: { creatorId: profile.id } });

      const apiUrl = process.env.CAROUSEL_API_URL;
      const apiKey = process.env.CAROUSEL_API_KEY;
      if (!apiUrl || !apiKey) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Carousel API not configured" });

      const brand = kit ? {
        name: kit.brandName ?? undefined,
        handle: kit.handle ?? undefined,
        niche: kit.niche ?? undefined,
        primary_color: kit.primaryColor ?? undefined,
        accent_color: kit.accentColor ?? undefined,
        logo_url: kit.logoUrl ?? undefined,
        website: kit.website ?? undefined,
        voice_notes: kit.voiceNotes ?? undefined,
      } : {};

      const run = await ctx.db.carouselRun.create({
        data: {
          creatorId: profile.id,
          title: input.articleTitle,
          platform: "instagram",
          status: "PENDING",
          webhookPayload: { article_title: input.articleTitle, brand } as object,
        },
      });

      let result: {
        slides_png_urls?: string[];
        slides_cloudinary_urls?: string[];
        pdf_base64?: string;
        caption?: string;
      };

      try {
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify({ article_title: input.articleTitle, article_body: input.articleBody, platform: "instagram", brand }),
        });
        if (!res.ok) throw new Error(`Azure Function returned ${res.status}`);
        result = await res.json();
      } catch (err) {
        await ctx.db.carouselRun.update({ where: { id: run.id }, data: { status: "FAILED" } });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Carousel generation failed: ${err}` });
      }

      const slideUrls = result.slides_png_urls ?? result.slides_cloudinary_urls ?? [];
      if (igConn && slideUrls.length >= 2) {
        const { publishCarouselPost } = await import("@/lib/integrations/instagram/publisher");
        try {
          await publishCarouselPost(igConn.accessToken, igConn.igUserId, slideUrls.slice(0, 10), result.caption ?? "");
        } catch {
          // Log but don't fail the run — images are still saved
        }
      }

      const updated = await ctx.db.carouselRun.update({
        where: { id: run.id },
        data: { status: "DONE", slideUrls, caption: result.caption ?? null, pdfUrl: result.pdf_base64 ? `data:application/pdf;base64,${result.pdf_base64}` : null },
      });

      return { run: updated, slides: slideUrls, caption: result.caption ?? "" };
    }),
});
