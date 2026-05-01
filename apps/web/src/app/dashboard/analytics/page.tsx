"use client";

import { api } from "@/lib/trpc/client";
import Link from "next/link";

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</p>
      <p className="mt-2 text-3xl font-bold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

// ─── Post row ─────────────────────────────────────────────────────────────────

function PostRow({
  post,
}: {
  post: {
    id: string;
    title: string;
    publishedAt: Date | string | null;
    thumbnailUrl: string | null;
    postUrl: string | null;
    impressions: number | null;
    reach: number | null;
    plays: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    saved: number | null;
  };
}) {
  const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString());
  const date = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "—";

  const eng = (post.likes ?? 0) + (post.comments ?? 0) + (post.shares ?? 0);
  const engRate =
    post.reach && post.reach > 0 ? ((eng / post.reach) * 100).toFixed(1) + "%" : "—";

  return (
    <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-3">
          {post.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.thumbnailUrl}
              alt=""
              className="h-12 w-8 rounded object-cover flex-shrink-0"
            />
          ) : (
            <div className="h-12 w-8 rounded bg-white/10 flex-shrink-0" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white max-w-[200px]">{post.title}</p>
            <p className="text-xs text-zinc-500">{date}</p>
          </div>
        </div>
      </td>
      <td className="py-3 pr-4 text-right text-sm tabular-nums text-zinc-300">
        {fmt(post.impressions)}
      </td>
      <td className="py-3 pr-4 text-right text-sm tabular-nums text-zinc-300">
        {fmt(post.reach)}
      </td>
      <td className="py-3 pr-4 text-right text-sm tabular-nums text-zinc-300">
        {fmt(post.plays)}
      </td>
      <td className="py-3 pr-4 text-right text-sm tabular-nums text-zinc-300">{engRate}</td>
      <td className="py-3 text-right">
        {post.postUrl && (
          <a
            href={post.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-purple-400 hover:text-purple-300"
          >
            View ↗
          </a>
        )}
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { data, isLoading } = api.instagram.getAnalytics.useQuery();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  if (!data?.connected) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="text-4xl">📊</div>
        <h2 className="text-xl font-semibold text-white">Connect Instagram to see analytics</h2>
        <p className="text-sm text-zinc-400 max-w-sm">
          Once connected, we'll pull lifetime metrics for every post you publish through
          ContentForge.
        </p>
        <Link
          href="/dashboard/settings"
          className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-medium text-white hover:bg-purple-500"
        >
          Go to Settings
        </Link>
      </div>
    );
  }

  const { posts, summary } = data;
  const topByReach = [...posts]
    .filter((p) => p.reach !== null)
    .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))
    .slice(0, 10);

  const fmtK = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + "K" : n.toLocaleString());

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Instagram Analytics</h1>
        <p className="mt-1 text-sm text-zinc-400">Lifetime metrics for your published Reels</p>
      </div>

      {/* Summary stats */}
      {summary ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total Posts" value={summary.totalPosts} />
          <StatCard
            label="Total Impressions"
            value={fmtK(summary.totalImpressions)}
            sub="lifetime"
          />
          <StatCard label="Total Reach" value={fmtK(summary.totalReach)} sub="unique accounts" />
          <StatCard
            label="Avg Engagement"
            value={(summary.avgEngagementRate * 100).toFixed(1) + "%"}
            sub="likes + comments + shares / reach"
          />
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-sm text-zinc-400">
          Metrics will appear after your posts start receiving data from Instagram.
        </div>
      )}

      {/* Post table */}
      <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="font-semibold text-white">Published Posts</h2>
          <span className="text-xs text-zinc-500">{posts.length} posts</span>
        </div>

        {posts.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-400">
            No published posts yet.{" "}
            <Link href="/dashboard/videos" className="text-purple-400 hover:text-purple-300">
              Schedule your first clip →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-3 pr-4 pl-5 text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Post
                  </th>
                  <th className="py-3 pr-4 text-right text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Impr.
                  </th>
                  <th className="py-3 pr-4 text-right text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Reach
                  </th>
                  <th className="py-3 pr-4 text-right text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Plays
                  </th>
                  <th className="py-3 pr-4 text-right text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Eng.
                  </th>
                  <th className="py-3 pr-4 text-right text-xs font-medium uppercase tracking-wider text-zinc-400" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 pl-5">
                {(topByReach.length > 0 ? topByReach : posts).map((post) => (
                  <PostRow key={post.id} post={post} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Note about permissions */}
      <p className="text-xs text-zinc-600 text-center">
        Insights require your Instagram account to be a Business or Creator account with{" "}
        <code>instagram_manage_insights</code> permission. Data may take 24h to appear after
        publishing.
      </p>
    </div>
  );
}
