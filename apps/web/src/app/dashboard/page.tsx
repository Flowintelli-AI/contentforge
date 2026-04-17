"use client";

import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Lightbulb, FileText, Calendar, Zap, TrendingUp, Plus } from "lucide-react";

export default function DashboardPage() {
  const { data: stats, isLoading } = api.dashboard.getStats.useQuery();
  const { data: recentIdeas } = api.ideas.list.useQuery({ limit: 3 });
  const { data: recentScripts } = api.scripts.list.useQuery({ limit: 3 });

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/ideas/new">
            <Plus className="w-4 h-4 mr-2" /> Submit Idea
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Ideas This Month",  value: stats?.ideasThisMonth  ?? "—", icon: Lightbulb,   href: "/dashboard/ideas"   },
          { label: "Scripts Generated", value: stats?.scriptsGenerated ?? "—", icon: FileText,    href: "/dashboard/scripts" },
          { label: "Posts Scheduled",   value: stats?.postsScheduled  ?? "—", icon: Calendar,    href: "/dashboard/calendar"},
          { label: "Posts Published",   value: stats?.postsPublished  ?? "—", icon: Zap,         href: "/dashboard/automations" },
        ].map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{s.label}</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">{isLoading ? "…" : s.value}</p>
                  </div>
                  <s.icon className="w-5 h-5 text-indigo-500 mt-1" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Ideas */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Recent Ideas</CardTitle>
            <Link href="/dashboard/ideas" className="text-sm text-indigo-600 hover:underline">View all</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentIdeas?.ideas.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No ideas yet. <Link href="/dashboard/ideas/new" className="text-indigo-600 hover:underline">Submit your first one →</Link></p>
            )}
            {recentIdeas?.ideas.map((idea) => (
              <div key={idea.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 truncate">{idea.refinedIdea ?? idea.rawIdea}</p>
                  <p className="text-xs text-gray-400 mt-0.5 capitalize">{idea.status.toLowerCase().replace("_", " ")}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Trend pulse */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Trend Pulse</CardTitle>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                "AI productivity hacks creators are using",
                "The real cost of outsourcing content",
                "UGC creator rate controversy",
              ].map((trend, i) => (
                <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-green-50">
                  <span className="text-xs font-bold text-green-600 w-4">{i + 1}</span>
                  <p className="text-sm text-gray-700">{trend}</p>
                </div>
              ))}
              <p className="text-xs text-gray-400 text-center mt-2">Updated hourly · powered by AI</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
