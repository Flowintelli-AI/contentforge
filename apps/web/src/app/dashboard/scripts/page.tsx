"use client";

import { trpc } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, truncate } from "@/lib/utils";
import { CheckCircle, Clock, Send, Edit2 } from "lucide-react";
import Link from "next/link";

const statusConfig = {
  DRAFT: { label: "Draft", variant: "outline" as const, icon: Edit2 },
  PENDING_REVIEW: { label: "Pending Review", variant: "warning" as const, icon: Clock },
  APPROVED: { label: "Approved", variant: "success" as const, icon: CheckCircle },
  REVISION_REQUESTED: { label: "Revision Needed", variant: "destructive" as const, icon: Edit2 },
  PUBLISHED: { label: "Published", variant: "default" as const, icon: Send },
};

export default function ScriptsPage() {
  const { data, isLoading } = trpc.scripts.list.useQuery({ limit: 20, page: 1 });
  const submitMutation = trpc.scripts.submitForReview.useMutation();
  const utils = trpc.useUtils();

  const handleSubmit = async (id: string) => {
    await submitMutation.mutateAsync({ id });
    utils.scripts.list.invalidate();
  };

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="text-muted-foreground">Loading scripts…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Script Library</h1>
        <p className="text-muted-foreground mt-1">
          AI-generated scripts ready for review and publishing
        </p>
      </div>

      {!data?.scripts.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No scripts yet. Submit ideas to generate your first script.</p>
            <Link href="/dashboard/ideas">
              <Button className="mt-4">Go to Ideas</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {data.scripts.map((script) => {
            const status = statusConfig[script.status as keyof typeof statusConfig];
            const Icon = status?.icon ?? Clock;
            return (
              <Card key={script.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{script.title}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {truncate(script.idea.rawText, 120)}
                      </p>
                    </div>
                    <Badge variant={status?.variant}>
                      <Icon className="mr-1 h-3 w-3" />
                      {status?.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Generated {formatDate(script.createdAt)}
                    </span>
                    <div className="flex gap-2">
                      <Link href={`/dashboard/scripts/${script.id}`}>
                        <Button variant="outline" size="sm">View Script</Button>
                      </Link>
                      {script.status === "DRAFT" && (
                        <Button
                          size="sm"
                          onClick={() => handleSubmit(script.id)}
                          disabled={submitMutation.isPending}
                        >
                          Submit for Review
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
