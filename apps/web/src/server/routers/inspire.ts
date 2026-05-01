import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter as router, protectedProcedure } from "../trpc";
import { scrapeHashtag, scrapeProfile, type ScrapedPost } from "@/lib/integrations/apify/service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getProfile(ctx: { userId: string; db: { user: { findUnique: Function }; creatorProfile: { findUnique: Function } } }) {
  const user = await ctx.db.user.findUnique({ where: { clerkId: ctx.userId } });
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  const profile = await ctx.db.creatorProfile.findUnique({ where: { userId: user.id } });
  if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Creator profile not found" });
  return profile as { id: string };
}

function extractTrendingAudio(posts: ScrapedPost[]) {
  const map = new Map<string, { title: string; artist: string | null; url: string | null; count: number }>();
  for (const p of posts) {
    if (!p.audioTitle) continue;
    const key = p.audioTitle.toLowerCase().trim();
    const existing = map.get(key);
    if (existing) {
      existing.count++;
    } else {
      map.set(key, { title: p.audioTitle, artist: p.audioArtist ?? null, url: p.audioUrl ?? null, count: 1 });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const inspireRouter = router({
  // ── Niches ─────────────────────────────────────────────────────────────────

  getNiches: protectedProcedure.query(async ({ ctx }) => {
    const profile = await getProfile(ctx as Parameters<typeof getProfile>[0]);
    return ctx.db.inspireNiche.findMany({
      where: { creatorId: profile.id },
      orderBy: { createdAt: "asc" },
    });
  }),

  addNiche: protectedProcedure
    .input(z.object({ hashtag: z.string().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx as Parameters<typeof getProfile>[0]);
      const hashtag = input.hashtag.replace(/^#/, "").toLowerCase().trim();
      return ctx.db.inspireNiche.upsert({
        where: { creatorId_hashtag: { creatorId: profile.id, hashtag } },
        create: { creatorId: profile.id, hashtag },
        update: {},
      });
    }),

  removeNiche: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx as Parameters<typeof getProfile>[0]);
      await ctx.db.inspireNiche.deleteMany({ where: { id: input.id, creatorId: profile.id } });
      return { ok: true };
    }),

  refreshNiche: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx as Parameters<typeof getProfile>[0]);
      const niche = await ctx.db.inspireNiche.findFirstOrThrow({
        where: { id: input.id, creatorId: profile.id },
      });
      const posts = await scrapeHashtag(niche.hashtag as string, 20);
      return ctx.db.inspireNiche.update({
        where: { id: niche.id as string },
        data: { posts: posts as object[], lastFetched: new Date() },
      });
    }),

  // ── Accounts ───────────────────────────────────────────────────────────────

  getAccounts: protectedProcedure.query(async ({ ctx }) => {
    const profile = await getProfile(ctx as Parameters<typeof getProfile>[0]);
    return ctx.db.inspireAccount.findMany({
      where: { creatorId: profile.id },
      orderBy: { createdAt: "asc" },
    });
  }),

  addAccount: protectedProcedure
    .input(z.object({ username: z.string().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx as Parameters<typeof getProfile>[0]);
      const username = input.username.replace(/^@/, "").toLowerCase().trim();
      return ctx.db.inspireAccount.upsert({
        where: { creatorId_username: { creatorId: profile.id, username } },
        create: { creatorId: profile.id, username },
        update: {},
      });
    }),

  removeAccount: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx as Parameters<typeof getProfile>[0]);
      await ctx.db.inspireAccount.deleteMany({ where: { id: input.id, creatorId: profile.id } });
      return { ok: true };
    }),

  refreshAccount: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx as Parameters<typeof getProfile>[0]);
      const account = await ctx.db.inspireAccount.findFirstOrThrow({
        where: { id: input.id, creatorId: profile.id },
      });
      const posts = await scrapeProfile(account.username as string, 20);
      const firstPost = posts[0];
      return ctx.db.inspireAccount.update({
        where: { id: account.id as string },
        data: {
          posts: posts as object[],
          lastFetched: new Date(),
          displayName: firstPost?.username ?? (account.displayName as string | null),
        },
      });
    }),

  // ── Trending Audio ─────────────────────────────────────────────────────────

  getTrendingAudio: protectedProcedure.query(async ({ ctx }) => {
    const profile = await getProfile(ctx as Parameters<typeof getProfile>[0]);
    const [niches, accounts] = await Promise.all([
      ctx.db.inspireNiche.findMany({ where: { creatorId: profile.id } }),
      ctx.db.inspireAccount.findMany({ where: { creatorId: profile.id } }),
    ]);
    const allPosts: ScrapedPost[] = [
      ...(niches as { posts: unknown }[]).flatMap((n) => (n.posts as ScrapedPost[]) ?? []),
      ...(accounts as { posts: unknown }[]).flatMap((a) => (a.posts as ScrapedPost[]) ?? []),
    ];
    return extractTrendingAudio(allPosts).slice(0, 20);
  }),
});
