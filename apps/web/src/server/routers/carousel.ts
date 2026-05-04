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

      const payload = {
        article_title: input.articleTitle,
        article_body: input.articleBody,
        platform: input.platform,
        brand,
      };

      // Create a PENDING run first
      const run = await ctx.db.carouselRun.create({
        data: {
          creatorId: profile.id,
          title: input.articleTitle,
          platform: input.platform,
          status: "PENDING",
          webhookPayload: payload as object,
        },
      });

      let result: {
        slides_png_urls?: string[];
        slides_cloudinary_urls?: string[];
        pdf_base64?: string;
        caption?: string;
        platform_fitness?: Record<string, number>;
        post_recommendation?: string;
      };

      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Webhook returned ${res.status}`);
        result = await res.json();
      } catch (err) {
        await ctx.db.carouselRun.update({ where: { id: run.id }, data: { status: "FAILED" } });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Carousel generation failed: ${err}` });
      }

      const slideUrls = result.slides_cloudinary_urls ?? result.slides_png_urls ?? [];
      const pdfUrl = result.pdf_base64 ? `data:application/pdf;base64,${result.pdf_base64}` : undefined;

      const updated = await ctx.db.carouselRun.update({
        where: { id: run.id },
        data: {
          status: "DONE",
          slideUrls,
          caption: result.caption ?? null,
          pdfUrl: pdfUrl ?? null,
        },
      });

      return {
        run: updated,
        slides: slideUrls,
        caption: result.caption ?? "",
        platformFitness: result.platform_fitness ?? {},
        postRecommendation: result.post_recommendation ?? "",
      };
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
});
