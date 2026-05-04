"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { api } from "@/lib/trpc/client";
import { ExternalLink, ArrowUpDown, Trophy, Eye, Users, Play, Heart } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtK = (n: number | null) => {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
};

type Post = {
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

type SortKey = "plays" | "impressions" | "reach" | "engagement" | "saved";

function engagementRate(p: Post): number {
  const eng = (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);
  return p.reach && p.reach > 0 ? (eng / p.reach) * 100 : 0;
}

function fmtDate(d: Date | string | null, short = false) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: short ? undefined : "numeric",
  });
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3">
      <div className={`flex items-center justify-between`}>
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</p>
        <Icon className={`h-4 w-4 ${accent}`} />
      </div>
      <p className="text-3xl font-bold text-white tabular-nums">{value}</p>
      {sub && <p className="text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

// ─── Best post highlight ───────────────────────────────────────────────────────

function BestPost({ post }: { post: Post }) {
  const eng = engagementRate(post);
  return (
    <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/5 p-5 flex gap-5">
      <div className="flex items-center gap-2 self-start mt-1">
        <Trophy className="h-5 w-5 text-yellow-400 flex-shrink-0" />
      </div>
      {post.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.thumbnailUrl}
          alt=""
          className="h-20 w-14 rounded-lg object-cover flex-shrink-0"
        />
      ) : (
        <div className="h-20 w-14 rounded-lg bg-white/10 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div>
          <p className="text-xs text-yellow-400 font-semibold uppercase tracking-wider">Best Performing Post</p>
          <p className="text-sm font-semibold text-white mt-0.5 line-clamp-1">{post.title}</p>
          <p className="text-xs text-zinc-500">{fmtDate(post.publishedAt)}</p>
        </div>
        <div className="flex flex-wrap gap-4">
          {[
            { label: "Plays",       val: fmtK(post.plays) },
            { label: "Reach",       val: fmtK(post.reach) },
            { label: "Impressions", val: fmtK(post.impressions) },
            { label: "Engagement",  val: eng.toFixed(1) + "%" },
            { label: "Likes",       val: fmtK(post.likes) },
            { label: "Saved",       val: fmtK(post.saved) },
          ].map(({ label, val }) => (
            <div key={label}>
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="text-sm font-semibold text-white tabular-nums">{val}</p>
            </div>
          ))}
        </div>
      </div>
      {post.postUrl && (
        <a
          href={post.postUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 self-start"
        >
          <ExternalLink className="h-4 w-4 text-zinc-500 hover:text-white" />
        </a>
      )}
    </div>
  );
}

// ─── Plays bar chart ──────────────────────────────────────────────────────────

function PlaysChart({ posts }: { posts: Post[] }) {
  const chartData = [...posts]
    .filter((p) => p.plays !== null || p.impressions !== null)
    .sort((a, b) => new Date(a.publishedAt ?? 0).getTime() - new Date(b.publishedAt ?? 0).getTime())
    .slice(-15)
    .map((p) => ({
      label: fmtDate(p.publishedAt, true),
      plays: p.plays ?? 0,
      reach: p.reach ?? 0,
    }));

  if (chartData.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <h2 className="font-semibold text-white mb-4">Plays & Reach per Post</h2>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} barGap={4}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="label"
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => fmtK(v)}
          />
          <Tooltip
            contentStyle={{
              background: "#18181b",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              color: "#fff",
              fontSize: 12,
            }}
            formatter={(value, name) => [fmtK(Number(value ?? 0)), name === "plays" ? "Plays" : "Reach"]}
          />
          <Bar dataKey="plays" fill="#a855f7" radius={[3, 3, 0, 0]} maxBarSize={40} />
          <Bar dataKey="reach" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2 justify-end">
        <span className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span className="h-2 w-2 rounded-sm bg-purple-500 inline-block" /> Plays
        </span>
        <span className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span className="h-2 w-2 rounded-sm bg-indigo-500 inline-block" /> Reach
        </span>
      </div>
    </div>
  );
}

// ─── Sortable post table ───────────────────────────────────────────────────────

function SortHeader({
  label,
  col,
  active,
  onClick,
}: {
  label: string;
  col: SortKey;
  active: SortKey;
  onClick: (col: SortKey) => void;
}) {
  return (
    <th
      className="py-3 pr-4 text-right text-xs font-medium uppercase tracking-wider text-zinc-400 cursor-pointer select-none hover:text-white transition-colors"
      onClick={() => onClick(col)}
    >
      <span className="inline-flex items-center gap-1 justify-end">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active === col ? "text-purple-400" : "text-zinc-600"}`} />
      </span>
    </th>
  );
}

function PostTable({ posts }: { posts: Post[] }) {
  const [sortBy, setSortBy] = useState<SortKey>("plays");

  const sorted = [...posts].sort((a, b) => {
    if (sortBy === "engagement") return engagementRate(b) - engagementRate(a);
    return (b[sortBy] ?? -1) - (a[sortBy] ?? -1);
  });

  const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString());

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <h2 className="font-semibold text-white">All Published Posts</h2>
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
                <SortHeader label="Plays"  col="plays"       active={sortBy} onClick={setSortBy} />
                <SortHeader label="Impr."  col="impressions" active={sortBy} onClick={setSortBy} />
                <SortHeader label="Reach"  col="reach"       active={sortBy} onClick={setSortBy} />
                <SortHeader label="Eng."   col="engagement"  active={sortBy} onClick={setSortBy} />
                <SortHeader label="Saved"  col="saved"       active={sortBy} onClick={setSortBy} />
                <th className="py-3 pr-5 text-right text-xs font-medium uppercase tracking-wider text-zinc-400" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sorted.map((post) => {
                const eng = engagementRate(post);
                const date = fmtDate(post.publishedAt, true);
                return (
                  <tr key={post.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 pr-4 pl-5">
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
                          <p className="truncate text-sm font-medium text-white max-w-[180px]">
                            {post.title}
                          </p>
                          <p className="text-xs text-zinc-500">{date}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right text-sm tabular-nums text-zinc-300">
                      {fmt(post.plays)}
                    </td>
                    <td className="py-3 pr-4 text-right text-sm tabular-nums text-zinc-300">
                      {fmt(post.impressions)}
                    </td>
                    <td className="py-3 pr-4 text-right text-sm tabular-nums text-zinc-300">
                      {fmt(post.reach)}
                    </td>
                    <td className="py-3 pr-4 text-right text-sm tabular-nums text-zinc-300">
                      {eng > 0 ? eng.toFixed(1) + "%" : "—"}
                    </td>
                    <td className="py-3 pr-4 text-right text-sm tabular-nums text-zinc-300">
                      {fmt(post.saved)}
                    </td>
                    <td className="py-3 pr-5 text-right">
                      {post.postUrl && (
                        <a
                          href={post.postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-purple-400 hover:text-purple-300 inline-flex items-center gap-1"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
        <div className="text-5xl">📊</div>
        <h2 className="text-xl font-semibold text-white">Connect Instagram to see analytics</h2>
        <p className="text-sm text-zinc-400 max-w-sm">
          Once connected, we'll pull lifetime metrics for every Reel you publish through ContentForge.
        </p>
        <Link
          href="/dashboard/settings"
          className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-medium text-white hover:bg-purple-500"
        >
          Go to Settings →
        </Link>
      </div>
    );
  }

  const { posts, summary } = data;

  const bestPost = [...posts]
    .filter((p) => p.plays !== null || p.impressions !== null)
    .sort((a, b) => engagementRate(b) - engagementRate(a))[0] ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="mt-1 text-sm text-zinc-400">Lifetime Instagram insights for your published Reels</p>
      </div>

      {/* Summary stats */}
      {summary ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <StatCard label="Posts"       value={summary.totalPosts}                                        icon={Eye}    accent="text-zinc-400" />
          <StatCard label="Plays"       value={fmtK(summary.totalPlays)}        sub="total video plays"  icon={Play}   accent="text-purple-400" />
          <StatCard label="Impressions" value={fmtK(summary.totalImpressions)}  sub="lifetime"           icon={Eye}    accent="text-blue-400" />
          <StatCard label="Reach"       value={fmtK(summary.totalReach)}        sub="unique accounts"    icon={Users}  accent="text-indigo-400" />
          <StatCard
            label="Avg Engagement"
            value={(summary.avgEngagementRate * 100).toFixed(1) + "%"}
            sub="likes + comments + shares / reach"
            icon={Heart}
            accent="text-pink-400"
          />
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-sm text-zinc-400">
          Metrics will appear after your posts start receiving data from Instagram (usually 24–48h after publishing).
        </div>
      )}

      {/* Best post */}
      {bestPost && <BestPost post={bestPost} />}

      {/* Chart */}
      {posts.length > 0 && <PlaysChart posts={posts} />}

      {/* Table */}
      <PostTable posts={posts} />

      <p className="text-xs text-zinc-600 text-center">
        Insights require a Business or Creator Instagram account with{" "}
        <code>instagram_manage_insights</code> permission. Data may take 24–48h after publishing.
      </p>
    </div>
  );
}
