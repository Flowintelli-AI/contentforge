import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter as router, protectedProcedure } from "../trpc";
import { sendInstagramDM, refreshLongLivedToken } from "@/lib/integrations/instagram/service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getProfile(ctx: { db: typeof import("@contentforge/db").db; userId: string }) {
  const user = await ctx.db.user.findUnique({ where: { clerkId: ctx.userId } });
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  const profile = await ctx.db.creatorProfile.findUnique({ where: { userId: user.id } });
  if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Creator profile not found" });
  return profile;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const instagramRouter = router({
  /** Get the current IgConnection status for this creator */
  getConnection: protectedProcedure.query(async ({ ctx }) => {
    const profile = await getProfile(ctx);
    const conn = await ctx.db.igConnection.findUnique({
      where: { creatorId: profile.id },
      select: {
        id: true,
        igUsername: true,
        igUserId: true,
        pageId: true,
        tokenExpiry: true,
        webhookActive: true,
        createdAt: true,
        updatedAt: true,
        // Never return accessToken to the client
      },
    });
    return conn;
  }),

  /** Save (create or update) an Instagram long-lived access token */
  saveConnection: protectedProcedure
    .input(
      z.object({
        igUserId: z.string().min(1),
        igUsername: z.string().min(1),
        accessToken: z.string().min(10),
        pageId: z.string().optional(),
        tokenExpiryDays: z.number().default(60),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);

      const tokenExpiry = new Date();
      tokenExpiry.setDate(tokenExpiry.getDate() + input.tokenExpiryDays);

      const conn = await ctx.db.igConnection.upsert({
        where: { creatorId: profile.id },
        create: {
          creatorId: profile.id,
          igUserId: input.igUserId,
          igUsername: input.igUsername,
          accessToken: input.accessToken,
          pageId: input.pageId,
          tokenExpiry,
        },
        update: {
          igUserId: input.igUserId,
          igUsername: input.igUsername,
          accessToken: input.accessToken,
          pageId: input.pageId ?? undefined,
          tokenExpiry,
        },
      });

      return { id: conn.id, igUsername: conn.igUsername };
    }),

  /** Refresh the long-lived token before it expires */
  refreshToken: protectedProcedure.mutation(async ({ ctx }) => {
    const profile = await getProfile(ctx);
    const conn = await ctx.db.igConnection.findUnique({ where: { creatorId: profile.id } });
    if (!conn) throw new TRPCError({ code: "NOT_FOUND", message: "No Instagram connection" });

    const newToken = await refreshLongLivedToken(conn.accessToken);
    const tokenExpiry = new Date();
    tokenExpiry.setDate(tokenExpiry.getDate() + 60);

    await ctx.db.igConnection.update({
      where: { id: conn.id },
      data: { accessToken: newToken, tokenExpiry },
    });

    return { ok: true };
  }),

  /** Disconnect Instagram (removes token from DB) */
  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    const profile = await getProfile(ctx);
    await ctx.db.igConnection.deleteMany({ where: { creatorId: profile.id } });
    return { ok: true };
  }),

  /** List opted-in subscribers with optional tag filter */
  getSubscribers: protectedProcedure
    .input(
      z.object({
        tag: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);
      const skip = (input.page - 1) * input.limit;

      const where = {
        creatorId: profile.id,
        ...(input.tag ? { tags: { has: input.tag } } : {}),
      };

      const [subscribers, total] = await Promise.all([
        ctx.db.igSubscriber.findMany({
          where,
          orderBy: { lastSeenAt: "desc" },
          skip,
          take: input.limit,
        }),
        ctx.db.igSubscriber.count({ where }),
      ]);

      return { subscribers, total, page: input.page, limit: input.limit };
    }),

  /** Broadcast a DM to all (or tag-filtered) subscribers */
  broadcast: protectedProcedure
    .input(
      z.object({
        message: z.string().min(1).max(1000),
        tag: z.string().optional(), // filter by tag, empty = all subscribers
      })
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);
      const conn = await ctx.db.igConnection.findUnique({ where: { creatorId: profile.id } });
      if (!conn) throw new TRPCError({ code: "BAD_REQUEST", message: "No Instagram connection" });

      const subscribers = await ctx.db.igSubscriber.findMany({
        where: {
          creatorId: profile.id,
          ...(input.tag ? { tags: { has: input.tag } } : {}),
        },
        select: { id: true, igUserId: true },
      });

      let sent = 0;
      let failed = 0;

      for (const sub of subscribers) {
        const result = await sendInstagramDM({ id: sub.igUserId }, input.message, conn.accessToken);

        await ctx.db.automationEvent.create({
          data: {
            subscriberId: sub.id,
            eventType: "BROADCAST",
            status: result.success ? "SENT" : "FAILED",
            errorMsg: result.error ?? null,
          },
        });

        if (result.success) sent++;
        else failed++;
      }

      return { sent, failed, total: subscribers.length };
    }),

  /** Get recent automation events for this creator */
  getEvents: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);

      const events = await ctx.db.automationEvent.findMany({
        where: { automation: { creatorId: profile.id } },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        include: {
          automation: { select: { name: true } },
          subscriber: { select: { igUsername: true, igUserId: true } },
        },
      });

      // Also include broadcast events (no automationId)
      const broadcastEvents = await ctx.db.automationEvent.findMany({
        where: {
          automationId: null,
          eventType: "BROADCAST",
          subscriber: { creatorId: profile.id },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        include: {
          subscriber: { select: { igUsername: true, igUserId: true } },
        },
      });

      return [...events, ...broadcastEvents]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, input.limit);
    }),

  /**
   * Get per-post Instagram Insights for all published content.
   * Fetches lifetime metrics (impressions, reach, plays, likes, comments, shares)
   * from the Instagram Graph API using the saved IgConnection token.
   */
  getAnalytics: protectedProcedure.query(async ({ ctx }) => {
    const profile = await getProfile(ctx);

    const conn = await ctx.db.igConnection.findUnique({
      where: { creatorId: profile.id },
      select: { accessToken: true, igUsername: true },
    });
    if (!conn) return { connected: false as const, posts: [], summary: null };

    // Find all published calendar items that have a media ID (stored in postizPostId)
    const publishedItems = await ctx.db.contentCalendarItem.findMany({
      where: { creatorId: profile.id, status: "PUBLISHED" },
      orderBy: { scheduledFor: "desc" },
      take: 50,
      include: {
        clip: { select: { thumbnailUrl: true, title: true } },
        scheduledPost: { select: { postizPostId: true, postUrl: true, publishedAt: true } },
      },
    });

    // Build per-post insights by calling IG Graph API
    const IG_BASE = "https://graph.instagram.com/v21.0";
    const METRICS = "impressions,reach,plays,likes,comments,shares,saved";

    const posts = await Promise.all(
      publishedItems.map(async (item) => {
        const mediaId = item.scheduledPost?.postizPostId;
        const base = {
          id: item.id,
          title: item.title,
          scheduledFor: item.scheduledFor,
          publishedAt: item.scheduledPost?.publishedAt ?? null,
          postUrl: item.scheduledPost?.postUrl ?? null,
          thumbnailUrl: item.clip?.thumbnailUrl ?? null,
          mediaId,
          impressions: null as number | null,
          reach: null as number | null,
          plays: null as number | null,
          likes: null as number | null,
          comments: null as number | null,
          shares: null as number | null,
          saved: null as number | null,
        };

        if (!mediaId) return base;

        try {
          const res = await fetch(
            `${IG_BASE}/${mediaId}/insights?metric=${METRICS}&period=lifetime&access_token=${conn.accessToken}`
          );
          if (!res.ok) return base;
          const json = (await res.json()) as {
            data?: Array<{ name: string; values?: Array<{ value: number }>; value?: number }>;
          };

          for (const metric of json.data ?? []) {
            const value = metric.value ?? metric.values?.[0]?.value ?? 0;
            if (metric.name === "impressions") base.impressions = value;
            if (metric.name === "reach") base.reach = value;
            if (metric.name === "plays") base.plays = value;
            if (metric.name === "likes") base.likes = value;
            if (metric.name === "comments") base.comments = value;
            if (metric.name === "shares") base.shares = value;
            if (metric.name === "saved") base.saved = value;
          }
        } catch {
          // Return base data even if insights fail for one post
        }

        return base;
      })
    );

    // Build summary stats
    const withData = posts.filter((p) => p.impressions !== null);
    const summary =
      withData.length === 0
        ? null
        : {
            totalPosts: posts.length,
            totalImpressions: withData.reduce((s, p) => s + (p.impressions ?? 0), 0),
            totalReach: withData.reduce((s, p) => s + (p.reach ?? 0), 0),
            totalPlays: withData.reduce((s, p) => s + (p.plays ?? 0), 0),
            avgEngagementRate:
              withData.reduce((s, p) => {
                const eng = (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);
                const reach = p.reach ?? 1;
                return s + eng / reach;
              }, 0) / withData.length,
          };

    return { connected: true as const, posts, summary };
  }),
});
