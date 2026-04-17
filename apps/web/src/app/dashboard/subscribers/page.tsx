"use client";

import { useState } from "react";
import { api } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const SOURCE_LABELS: Record<string, string> = {
  COMMENT_KEYWORD: "Comment",
  DM_KEYWORD: "DM",
  STORY_MENTION: "Story",
};

export default function SubscribersPage() {
  const [tagFilter, setTagFilter] = useState("");
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState("");

  const { data, isLoading } = api.instagram.getSubscribers.useQuery({
    tag: tagFilter || undefined,
    limit: 100,
  });

  const broadcast = api.instagram.broadcast.useMutation({
    onSuccess: (result: { sent: number; failed: number }) => {
      setBroadcastOpen(false);
      setBroadcastMsg("");
      alert(`Broadcast sent! ✅ ${result.sent} sent, ${result.failed} failed`);
    },
  });

  const { data: conn } = api.instagram.getConnection.useQuery();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Subscribers</h1>
          <p className="text-muted-foreground mt-1">
            Instagram users who opted in via keyword comments or DMs
          </p>
        </div>
        {conn && (
          <Button onClick={() => setBroadcastOpen(true)}>
            📣 Broadcast DM
          </Button>
        )}
      </div>

      {!conn && (
        <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
          <CardContent className="pt-6">
            <p className="text-sm text-orange-800 dark:text-orange-200">
              Connect your Instagram account in{" "}
              <a href="/dashboard/settings" className="underline font-medium">
                Settings
              </a>{" "}
              to start collecting subscribers.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <div className="space-y-1 flex-1 max-w-xs">
          <Label>Filter by tag</Label>
          <Input
            placeholder="e.g. RECIPE"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value.toUpperCase())}
          />
        </div>
        {tagFilter && (
          <Button variant="outline" className="mt-6" onClick={() => setTagFilter("")}>
            Clear
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Opted-In Subscribers
            {data && (
              <span className="ml-2 text-base font-normal text-muted-foreground">
                ({data.total})
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Every person who has engaged with one of your keyword automations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

          {!isLoading && (!data?.subscribers.length) && (
            <div className="py-12 text-center text-muted-foreground">
              <p className="text-4xl mb-3">📭</p>
              <p className="font-medium">No subscribers yet</p>
              <p className="text-sm mt-1">
                Set up a keyword automation and share your post to start collecting opt-ins.
              </p>
            </div>
          )}

          {data?.subscribers && data.subscribers.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="pb-2 pr-4 font-medium">Username</th>
                    <th className="pb-2 pr-4 font-medium">Source</th>
                    <th className="pb-2 pr-4 font-medium">Tags</th>
                    <th className="pb-2 pr-4 font-medium">Opted In</th>
                    <th className="pb-2 font-medium">Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subscribers.map((sub: {
                    id: string;
                    igUserId: string;
                    igUsername: string | null;
                    source: string;
                    tags: string[];
                    optedInAt: Date | string;
                    lastSeenAt: Date | string;
                  }) => (
                    <tr key={sub.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-3 pr-4 font-medium">
                        {sub.igUsername ? `@${sub.igUsername}` : sub.igUserId}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant="secondary">
                          {SOURCE_LABELS[sub.source] ?? sub.source}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {sub.tags.map((tag: string) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {new Date(sub.optedInAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {new Date(sub.lastSeenAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Broadcast Dialog */}
      <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Broadcast DM</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Send a DM to{" "}
              <strong>
                {tagFilter
                  ? `subscribers tagged "${tagFilter}"`
                  : "all subscribers"}
              </strong>
              . Only users active within the last 24 hours will receive it (Meta policy).
            </p>
            <div className="space-y-1">
              <Label>Message</Label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Hey {{username}}, here's something special for you…"
                value={broadcastMsg}
                onChange={(e) => setBroadcastMsg(e.target.value)}
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground text-right">
                {broadcastMsg.length}/1000
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBroadcastOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                broadcast.mutate({
                  message: broadcastMsg,
                  tag: tagFilter || undefined,
                })
              }
              disabled={broadcast.isPending || !broadcastMsg.trim()}
            >
              {broadcast.isPending ? "Sending…" : "Send Broadcast"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
