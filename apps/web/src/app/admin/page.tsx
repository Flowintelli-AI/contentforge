"use client";

import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, Clock, Send } from "lucide-react";

export default function AdminPage() {
  const { data: metrics, isLoading } = trpc.admin.getDashboardMetrics.useQuery();

  const stats = [
    { label: "Total Users", value: metrics?.totalUsers ?? 0, icon: Users },
    { label: "Total Ideas", value: metrics?.totalIdeas ?? 0, icon: FileText },
    { label: "Pending Reviews", value: metrics?.pendingReviews ?? 0, icon: Clock, highlight: true },
    { label: "Published Posts", value: metrics?.publishedPosts ?? 0, icon: Send },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">Platform overview and operations</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className={stat.highlight ? "border-orange-300" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                  <Icon className={`h-4 w-4 ${stat.highlight ? "text-orange-500" : "text-muted-foreground"}`} />
                </div>
              </CardHeader>
              <CardContent>
                <p className={`text-3xl font-bold ${stat.highlight ? "text-orange-500" : ""}`}>
                  {isLoading ? "—" : stat.value}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
