"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Zap, Plus } from "lucide-react";

const triggers = [
  {
    keyword: "GUIDE",
    platform: "Instagram",
    action: "Send DM with free guide link",
    status: "active",
  },
  {
    keyword: "LINK",
    platform: "TikTok",
    action: "Send DM with product link",
    status: "active",
  },
  {
    keyword: "PLAN",
    platform: "Instagram",
    action: "Send DM with content plan PDF",
    status: "inactive",
  },
];

export default function AutomationsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Automation Center</h1>
          <p className="text-muted-foreground mt-1">
            Comment-trigger DM automations via ManyChat
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Trigger
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Comment Triggers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {triggers.map((t, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-primary/10 px-3 py-1 text-sm font-mono font-bold text-primary">
                    {t.keyword}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t.action}</p>
                    <p className="text-xs text-muted-foreground">{t.platform}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={t.status === "active" ? "success" : "outline"}>
                    {t.status}
                  </Badge>
                  <Button variant="ghost" size="sm">Edit</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            ManyChat Integration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Connect your ManyChat account to enable automated DM flows triggered by
            comment keywords.
          </p>
          <Button variant="outline">Connect ManyChat</Button>
        </CardContent>
      </Card>
    </div>
  );
}
