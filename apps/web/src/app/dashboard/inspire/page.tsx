"use client";

import { useState } from "react";
import { api } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Hash,
  User,
  Music2,
  RefreshCw,
  Trash2,
  Plus,
  ExternalLink,
  Heart,
  MessageCircle,
  Play,
  TrendingUp,
  Flame,
  Trophy,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";

// ─── Types ────────────────────────────────────────────────────────────────────

type Post = {
  id: string;
  url: string;
  username: string;
  caption: string | null;
  thumbnailUrl: string | null;
  likesCount: number;
  commentsCount: number;
  playsCount: number;
  audioTitle: string | null;
  audioArtist: string | null;
  audioUrl: string | null;
  timestamp: string;
  type: string;
};

// ─── Virality score ───────────────────────────────────────────────────────────

/** Weighted engagement: comments signal deep intent; plays are raw impressions */
function viralityScore(post: Post): number {
  return post.likesCount + post.commentsCount * 3 + post.playsCount * 0.05;
}

function formatScore(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

const RANK_STYLES = [
  { ring: "ring-yellow-400/60", badge: "bg-yellow-400 text-black", label: "🥇 #1" },
  { ring: "ring-zinc-300/40",   badge: "bg-zinc-300 text-black",   label: "🥈 #2" },
  { ring: "ring-amber-600/50",  badge: "bg-amber-700 text-white",  label: "🥉 #3" },
];

// ─── Post card ────────────────────────────────────────────────────────────────

function PostCard({ post, rank }: { post: Post; rank?: number }) {
  const style = rank !== undefined ? RANK_STYLES[rank] : undefined;
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group relative flex flex-col gap-2 rounded-xl overflow-hidden border bg-white/5 hover:bg-white/10 transition-colors ${style ? `border-white/20 ring-2 ${style.ring}` : "border-white/10"}`}
    >
      {style && (
        <span className={`absolute top-2 left-2 z-10 text-xs font-bold px-1.5 py-0.5 rounded-full ${style.badge}`}>
          {style.label}
        </span>
      )}

      {post.thumbnailUrl ? (
        <div className="relative aspect-[9/16] w-full overflow-hidden bg-zinc-800">
          <Image
            src={post.thumbnailUrl}
            alt={post.caption?.slice(0, 60) ?? "Post"}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          <ExternalLink className="absolute top-2 right-2 h-4 w-4 text-white/60 group-hover:text-white" />
        </div>
      ) : (
        <div className="aspect-[9/16] w-full bg-zinc-800 flex items-center justify-center">
          <Play className="h-8 w-8 text-zinc-600" />
        </div>
      )}

      <div className="p-3 flex flex-col gap-1">
        <p className="text-xs text-zinc-400 line-clamp-2">{post.caption ?? "No caption"}</p>
        <div className="flex gap-3 text-xs text-zinc-500 mt-1">
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" /> {post.likesCount.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3 w-3" /> {post.commentsCount.toLocaleString()}
          </span>
          {post.playsCount > 0 && (
            <span className="flex items-center gap-1">
              <Play className="h-3 w-3" /> {post.playsCount.toLocaleString()}
            </span>
          )}
        </div>
        {rank !== undefined && (
          <div className="flex items-center gap-1 mt-1">
            <Flame className="h-3 w-3 text-orange-400" />
            <span className="text-xs text-orange-400 font-semibold">
              {formatScore(viralityScore(post))} virality score
            </span>
          </div>
        )}
        {post.audioTitle && (
          <p className="text-xs text-purple-400 truncate flex items-center gap-1 mt-1">
            <Music2 className="h-3 w-3 flex-shrink-0" /> {post.audioTitle}
          </p>
        )}
      </div>
    </a>
  );
}

// ─── Trending Niches tab ──────────────────────────────────────────────────────

function NichesTab() {
  const [newHashtag, setNewHashtag] = useState("");
  const utils = api.useUtils();

  const { data: niches = [], isLoading } = api.inspire.getNiches.useQuery();
  const addNiche = api.inspire.addNiche.useMutation({
    onSuccess: () => utils.inspire.getNiches.invalidate(),
  });
  const removeNiche = api.inspire.removeNiche.useMutation({
    onSuccess: () => utils.inspire.getNiches.invalidate(),
  });
  const refreshNiche = api.inspire.refreshNiche.useMutation({
    onSuccess: () => {
      utils.inspire.getNiches.invalidate();
      utils.inspire.getTrendingAudio.invalidate();
    },
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleAdd = () => {
    const tag = newHashtag.trim();
    if (!tag) return;
    addNiche.mutate({ hashtag: tag });
    setNewHashtag("");
  };

  if (isLoading) return <div className="text-zinc-500 text-sm">Loading...</div>;

  return (
    <div className="flex flex-col gap-6">
      {/* Add form */}
      <div className="flex gap-2">
        <Input
          placeholder="#fitness"
          value={newHashtag}
          onChange={(e) => setNewHashtag(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="bg-white/5 border-white/10 max-w-xs"
        />
        <Button onClick={handleAdd} disabled={addNiche.isPending} variant="secondary">
          <Plus className="h-4 w-4 mr-1" /> Track Niche
        </Button>
      </div>

      {niches.length === 0 && (
        <div className="text-zinc-500 text-sm">
          No niches tracked yet. Add a hashtag above to start spying on trends.
        </div>
      )}

      {niches.map((niche) => {
        const posts = (niche.posts as unknown as Post[]) ?? [];
        const isExpanded = expandedId === niche.id;
        return (
          <Card key={niche.id} className="bg-white/5 border-white/10">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <button
                  className="flex items-center gap-2 group"
                  onClick={() => setExpandedId(isExpanded ? null : niche.id)}
                >
                  <Hash className="h-4 w-4 text-purple-400" />
                  <CardTitle className="text-base group-hover:text-purple-300 transition-colors">
                    {niche.hashtag}
                  </CardTitle>
                  <Badge variant="outline" className="text-xs border-white/20">
                    {posts.length} posts
                  </Badge>
                </button>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    disabled={refreshNiche.isPending}
                    onClick={() => refreshNiche.mutate({ id: niche.id })}
                    title="Refresh"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-red-400 hover:text-red-300"
                    onClick={() => removeNiche.mutate({ id: niche.id })}
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {niche.lastFetched && (
                <p className="text-xs text-zinc-500">
                  Updated {formatDistanceToNow(new Date(niche.lastFetched), { addSuffix: true })}
                </p>
              )}
              {!niche.lastFetched && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2 w-fit"
                  disabled={refreshNiche.isPending}
                  onClick={() => refreshNiche.mutate({ id: niche.id })}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Fetch posts
                </Button>
              )}
            </CardHeader>

            {isExpanded && posts.length > 0 && (() => {
              const sorted = [...posts].sort((a, b) => viralityScore(b) - viralityScore(a));
              const top3 = sorted.slice(0, 3);
              return (
                <CardContent>
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="h-4 w-4 text-yellow-400" />
                    <span className="text-sm font-semibold text-white">Top Viral Posts</span>
                    <span className="text-xs text-zinc-500">ranked by likes + comments×3 + plays</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {top3.map((p, i) => (
                      <PostCard key={p.id} post={p} rank={i} />
                    ))}
                  </div>
                  {posts.length > 3 && (
                    <p className="text-xs text-zinc-500 mt-3">
                      +{posts.length - 3} more posts in this niche
                    </p>
                  )}
                </CardContent>
              );
            })()}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Competitor Watch tab ─────────────────────────────────────────────────────

function AccountsTab() {
  const [newUsername, setNewUsername] = useState("");
  const utils = api.useUtils();

  const { data: accounts = [], isLoading } = api.inspire.getAccounts.useQuery();
  const addAccount = api.inspire.addAccount.useMutation({
    onSuccess: () => utils.inspire.getAccounts.invalidate(),
  });
  const removeAccount = api.inspire.removeAccount.useMutation({
    onSuccess: () => utils.inspire.getAccounts.invalidate(),
  });
  const refreshAccount = api.inspire.refreshAccount.useMutation({
    onSuccess: () => {
      utils.inspire.getAccounts.invalidate();
      utils.inspire.getTrendingAudio.invalidate();
    },
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleAdd = () => {
    const u = newUsername.trim();
    if (!u) return;
    addAccount.mutate({ username: u });
    setNewUsername("");
  };

  if (isLoading) return <div className="text-zinc-500 text-sm">Loading...</div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        <Input
          placeholder="@garyvee"
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="bg-white/5 border-white/10 max-w-xs"
        />
        <Button onClick={handleAdd} disabled={addAccount.isPending} variant="secondary">
          <Plus className="h-4 w-4 mr-1" /> Watch Account
        </Button>
      </div>

      {accounts.length === 0 && (
        <div className="text-zinc-500 text-sm">
          No accounts tracked yet. Add an Instagram handle to start watching competitors.
        </div>
      )}

      {accounts.map((account) => {
        const posts = (account.posts as unknown as Post[]) ?? [];
        const isExpanded = expandedId === account.id;
        return (
          <Card key={account.id} className="bg-white/5 border-white/10">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <button
                  className="flex items-center gap-2 group"
                  onClick={() => setExpandedId(isExpanded ? null : account.id)}
                >
                  <User className="h-4 w-4 text-blue-400" />
                  <CardTitle className="text-base group-hover:text-blue-300 transition-colors">
                    @{account.username}
                  </CardTitle>
                  <Badge variant="outline" className="text-xs border-white/20">
                    {posts.length} posts
                  </Badge>
                </button>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    disabled={refreshAccount.isPending}
                    onClick={() => refreshAccount.mutate({ id: account.id })}
                    title="Refresh"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-red-400 hover:text-red-300"
                    onClick={() => removeAccount.mutate({ id: account.id })}
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {account.lastFetched && (
                <p className="text-xs text-zinc-500">
                  Updated {formatDistanceToNow(new Date(account.lastFetched), { addSuffix: true })}
                </p>
              )}
              {!account.lastFetched && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2 w-fit"
                  disabled={refreshAccount.isPending}
                  onClick={() => refreshAccount.mutate({ id: account.id })}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Fetch posts
                </Button>
              )}
            </CardHeader>

            {isExpanded && posts.length > 0 && (
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {posts.slice(0, 10).map((p) => (
                    <PostCard key={p.id} post={p} />
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Trending Audio tab ───────────────────────────────────────────────────────

function AudioTab() {
  const { data: tracks = [], isLoading } = api.inspire.getTrendingAudio.useQuery();

  if (isLoading) return <div className="text-zinc-500 text-sm">Loading...</div>;

  if (tracks.length === 0) {
    return (
      <div className="text-zinc-500 text-sm">
        No trending audio data yet. Track some niches or accounts, then refresh them to populate
        audio trends.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {tracks.map((track, i) => (
        <div
          key={`${track.title}-${i}`}
          className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-zinc-500 text-sm w-6 text-center">{i + 1}</span>
            <Music2 className="h-4 w-4 text-purple-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{track.title}</p>
              {track.artist && (
                <p className="text-xs text-zinc-400 truncate">@{track.artist}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 ml-4 flex-shrink-0">
            <Badge variant="outline" className="border-purple-400/40 text-purple-300 text-xs">
              {track.count}× used
            </Badge>
            {track.url ? (
              <a
                href={track.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/40 hover:text-white transition-colors border border-purple-500/30"
              >
                <Play className="h-3 w-3" />
                Preview
              </a>
            ) : (
              <span className="text-xs text-zinc-600 px-3 py-1.5">No preview</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InspirePage() {
  return (
    <div className="flex flex-col gap-8 p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <TrendingUp className="h-6 w-6 text-purple-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Inspire</h1>
          <p className="text-sm text-zinc-400">Spy on trends, niches, and competitor content</p>
        </div>
      </div>

      <Tabs defaultValue="niches">
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="niches" className="flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5" /> Trending Niches
          </TabsTrigger>
          <TabsTrigger value="accounts" className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" /> Competitor Watch
          </TabsTrigger>
          <TabsTrigger value="audio" className="flex items-center gap-1.5">
            <Music2 className="h-3.5 w-3.5" /> Trending Audio
          </TabsTrigger>
        </TabsList>

        <TabsContent value="niches" className="mt-6">
          <NichesTab />
        </TabsContent>
        <TabsContent value="accounts" className="mt-6">
          <AccountsTab />
        </TabsContent>
        <TabsContent value="audio" className="mt-6">
          <AudioTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
