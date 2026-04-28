import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { del } from "@vercel/blob";
import { createReelsContainer } from "@/lib/integrations/instagram/publisher";

async function getProfile(ctx: { userId: string; db: typeof import("@contentforge/db").db }) {
  const user = await ctx.db.user.findUnique({ where: { clerkId: ctx.userId } });
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  const profile = await ctx.db.creatorProfile.findUnique({ where: { userId: user.id } });
  if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Creator profile not found" });
  return profile;
}

export const videosRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const profile = await getProfile(ctx);
    return ctx.db.uploadedVideo.findMany({
      where: { creatorId: profile.id },
      include: { clips: { orderBy: { createdAt: "desc" } } },
      orderBy: { createdAt: "desc" },
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        storagePath: z.string().url(),
        sizeBytes: z.number().optional(),
        mimeType: z.string().optional(),
        duration: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);
      return ctx.db.uploadedVideo.create({
        data: {
          creatorId: profile.id,
          title: input.title,
          description: input.description,
          storagePath: input.storagePath,
          sizeBytes: input.sizeBytes ? BigInt(input.sizeBytes) : undefined,
          mimeType: input.mimeType,
          duration: input.duration,
          status: "READY",
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);
      const video = await ctx.db.uploadedVideo.findFirst({
        where: { id: input.id, creatorId: profile.id },
      });
      if (!video) throw new TRPCError({ code: "NOT_FOUND" });

      // Delete from Vercel Blob
      try {
        await del(video.storagePath);
      } catch {
        // Non-fatal — blob may already be gone
      }

      await ctx.db.uploadedVideo.delete({ where: { id: input.id } });
      return { success: true };
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["UPLOADING", "PROCESSING", "READY", "FAILED", "ARCHIVED"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);
      return ctx.db.uploadedVideo.updateMany({
        where: { id: input.id, creatorId: profile.id },
        data: { status: input.status },
      });
    }),

  /** List all READY + DRAFT clips for the creator — for the publishing UI */
  listReadyClips: protectedProcedure.query(async ({ ctx }) => {
    const profile = await getProfile(ctx);
    return ctx.db.repurposedClip.findMany({
      where: { video: { creatorId: profile.id }, status: { in: ["READY", "DRAFT"] } },
      include: {
        video: { select: { title: true } },
        calendarItems: {
          orderBy: { scheduledFor: "desc" },
          take: 1,
          include: { scheduledPost: { select: { status: true, postizPostId: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  /** Save draft edits (postCopy, hashtags, thumbnailUrl) without scheduling */
  saveDraft: protectedProcedure
    .input(
      z.object({
        clipId: z.string(),
        postCopy: z.string().max(2200).optional(),
        hashtags: z.array(z.string()).max(30).optional(),
        thumbnailUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);
      const clip = await ctx.db.repurposedClip.findFirst({
        where: { id: input.clipId, video: { creatorId: profile.id } },
      });
      if (!clip) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.repurposedClip.update({
        where: { id: input.clipId },
        data: {
          status: "DRAFT",
          ...(input.postCopy !== undefined && { postCopy: input.postCopy }),
          ...(input.hashtags !== undefined && { hashtags: input.hashtags }),
          ...(input.thumbnailUrl !== undefined && { thumbnailUrl: input.thumbnailUrl }),
        },
      });
    }),

  /** Update just the thumbnailUrl (e.g., after filmstrip pick or canvas bake) */
  updateThumbnail: protectedProcedure
    .input(z.object({ clipId: z.string(), thumbnailUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);
      const clip = await ctx.db.repurposedClip.findFirst({
        where: { id: input.clipId, video: { creatorId: profile.id } },
      });
      if (!clip) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.repurposedClip.update({
        where: { id: input.clipId },
        data: { thumbnailUrl: input.thumbnailUrl },
      });
    }),

  /** List clips that have been published to Instagram */
  listPublishedPosts: protectedProcedure.query(async ({ ctx }) => {
    const profile = await getProfile(ctx);
    return ctx.db.contentCalendarItem.findMany({
      where: { creatorId: profile.id, status: "PUBLISHED" },
      include: {
        clip: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            storagePath: true,
            postCopy: true,
            hashtags: true,
          },
        },
        scheduledPost: { select: { status: true, postUrl: true, publishedAt: true } },
      },
      orderBy: { scheduledFor: "desc" },
    });
  }),

  /** Schedule a READY clip to Instagram */
  scheduleClip: protectedProcedure
    .input(
      z.object({
        clipId: z.string(),
        caption: z.string().max(2200),
        hashtags: z.array(z.string()).max(30),
        scheduledFor: z.date(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);

      // Verify clip is READY or DRAFT and belongs to this creator
      const clip = await ctx.db.repurposedClip.findFirst({
        where: { id: input.clipId, video: { creatorId: profile.id }, status: { in: ["READY", "DRAFT"] } },
      });
      if (!clip) throw new TRPCError({ code: "NOT_FOUND", message: "Clip not found or not READY" });
      if (!clip.storagePath) throw new TRPCError({ code: "BAD_REQUEST", message: "Clip has no video URL" });

      // Fetch Instagram connection
      const igConn = await ctx.db.igConnection.findUnique({ where: { creatorId: profile.id } });
      if (!igConn) throw new TRPCError({ code: "BAD_REQUEST", message: "Instagram not connected" });

      // Fetch or auto-create SocialAccount record (for FK on ScheduledPost)
      const socialAccount = await ctx.db.socialAccount.upsert({
        where: { creatorId_platform: { creatorId: profile.id, platform: "INSTAGRAM" } },
        create: {
          creatorId: profile.id,
          platform: "INSTAGRAM",
          handle: igConn.igUsername,
          accessToken: igConn.accessToken,
          tokenExpiry: igConn.tokenExpiry,
          isActive: true,
        },
        update: {},
      });

      // Build full caption
      const fullCaption = [
        input.caption.trim(),
        input.hashtags.length > 0 ? "\n\n" + input.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ") : "",
      ]
        .join("")
        .trim();

      // Try to create Instagram Reels container immediately — but don't block on failure.
      // If the IG API call fails (expired token, scope issue, etc.), we still save to DB
      // as PENDING and a cron job will retry at publish time.
      let containerId: string | null = null;
      let postStatus: "SCHEDULED" | "DRAFT" = "DRAFT";
      let igError: string | null = null;
      try {
        containerId = await createReelsContainer(
          igConn.accessToken,
          igConn.igUserId,
          clip.storagePath,
          fullCaption,
          input.scheduledFor.getTime()
        );
        postStatus = "SCHEDULED";
      } catch (err) {
        igError = err instanceof Error ? err.message : String(err);
        console.error("[scheduleClip] Instagram container creation failed:", igError);
        // Continue — save to DB as DRAFT for cron retry
      }

      // Persist to DB regardless of IG API result
      const calendarItem = await ctx.db.contentCalendarItem.create({
        data: {
          creatorId: profile.id,
          clipId: clip.id,
          title: clip.title ?? "Instagram Reel",
          scheduledFor: input.scheduledFor,
          platform: "INSTAGRAM",
          status: postStatus === "SCHEDULED" ? "SCHEDULED" : "DRAFT",
          scheduledPost: {
            create: {
              socialAccountId: socialAccount.id,
              postizPostId: containerId,
              status: postStatus,
            },
          },
        },
        include: { scheduledPost: true },
      });

      return {
        calendarItemId: calendarItem.id,
        containerId,
        scheduledFor: input.scheduledFor,
        igWarning: igError
          ? `Scheduled locally — Instagram API error: ${igError}`
          : undefined,
      };
    }),
});
