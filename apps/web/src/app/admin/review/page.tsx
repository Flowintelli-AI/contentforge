"use client";

import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, RotateCcw } from "lucide-react";
import { useState } from "react";
import { formatDate, truncate } from "@/lib/utils";
import { toast } from "sonner";

export default function ReviewPage() {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.admin.getReviewQueue.useQuery({
    type: "scripts",
    status: "PENDING",
    page: 1,
    limit: 20,
  });

  const approveMutation = trpc.scripts.approve.useMutation({
    onSuccess: () => {
      toast.success("Script approved");
      utils.admin.getReviewQueue.invalidate();
    },
  });

  const revisionMutation = trpc.scripts.requestRevision.useMutation({
    onSuccess: () => {
      toast.success("Revision requested");
      utils.admin.getReviewQueue.invalidate();
    },
  });

  const handleApprove = async (id: string) => {
    await approveMutation.mutateAsync({ id, notes: notes[id] });
  };

  const handleRevision = async (id: string) => {
    const note = notes[id];
    if (!note || note.length < 10) {
      toast.error("Please provide review notes (min 10 chars)");
      return;
    }
    await revisionMutation.mutateAsync({ id, notes: note });
  };

  if (isLoading) return <div className="text-muted-foreground">Loading review queue…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Review Queue</h1>
        <p className="text-muted-foreground mt-1">
          {data?.total ?? 0} scripts pending review
        </p>
      </div>

      {!data?.items.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-muted-foreground">All caught up! No scripts pending review.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(data.items as any[]).map((script: any) => (
            <Card key={script.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{script.title}</CardTitle>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline">
                        {script.idea?.creatorProfile?.displayName ?? "Unknown creator"}
                      </Badge>
                      <Badge variant="warning">Pending Review</Badge>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Submitted {formatDate(script.updatedAt)}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Script preview */}
                <div className="rounded-md bg-muted p-4 text-sm">
                  <p className="font-medium mb-2">Content Idea:</p>
                  <p className="text-muted-foreground">{truncate(script.idea?.rawText ?? "", 300)}</p>
                </div>

                {script.versions?.[0] && (
                  <div className="rounded-md bg-muted p-4 text-sm">
                    <p className="font-medium mb-2">Generated Script (latest version):</p>
                    <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-mono">
                      {JSON.stringify(JSON.parse(script.versions[0].content ?? "{}"), null, 2).slice(0, 600)}…
                    </pre>
                  </div>
                )}

                {/* Review notes */}
                <div className="space-y-2">
                  <Label>Review Notes</Label>
                  <Textarea
                    placeholder="Add notes for the creator (required for revision requests)…"
                    value={notes[script.id] ?? ""}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [script.id]: e.target.value }))}
                    rows={3}
                  />
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => handleApprove(script.id)}
                    disabled={approveMutation.isPending}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleRevision(script.id)}
                    disabled={revisionMutation.isPending}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Request Revision
                  </Button>
                  <Button variant="destructive" size="icon">
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
