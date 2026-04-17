"use client";

import { useState } from "react";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Send, Lightbulb } from "lucide-react";
import { IdeaStatus, ContentPillarType } from "@prisma/client";

const PILLAR_LABELS: Record<ContentPillarType, string> = {
  EDUCATION: "🎓 Education",
  ENTERTAINMENT: "🎭 Entertainment",
  INSPIRATION: "✨ Inspiration",
  PROMOTION: "📣 Promotion",
  BEHIND_THE_SCENES: "🎬 Behind the Scenes",
  COMMUNITY: "🤝 Community",
};

const STATUS_COLORS: Record<IdeaStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  IN_REVIEW: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  SCRIPTED: "bg-indigo-100 text-indigo-700",
  ARCHIVED: "bg-red-100 text-red-700",
};

export default function IdeasPage() {
  const [rawIdea, setRawIdea] = useState("");
  const [pillar, setPillar] = useState<ContentPillarType | "">("");
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, refetch } = api.ideas.list.useQuery({ limit: 20 });

  const submit = api.ideas.submit.useMutation({
    onSuccess: () => {
      setRawIdea("");
      setPillar("");
      setShowForm(false);
      refetch();
    },
  });

  function handleSubmit() {
    if (!rawIdea.trim()) return;
    submit.mutate({ rawIdea, pillarType: pillar || undefined });
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ideas</h1>
          <p className="text-sm text-gray-500 mt-1">Dump your raw ideas. AI will structure them into scripts.</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-2" /> New Idea
        </Button>
      </div>

      {/* Submission form */}
      {showForm && (
        <Card className="mb-6 border-indigo-200 bg-indigo-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              What's your idea?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Just dump it raw. It can be messy. Example: 'talk about how most people waste time on content that doesn't convert and what to do instead'"
              value={rawIdea}
              onChange={(e) => setRawIdea(e.target.value)}
              rows={4}
              className="bg-white resize-none"
            />
            <div className="flex items-center gap-3">
              <Select value={pillar} onValueChange={(v) => setPillar(v as ContentPillarType)}>
                <SelectTrigger className="w-52 bg-white">
                  <SelectValue placeholder="Content pillar (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PILLAR_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleSubmit}
                disabled={!rawIdea.trim() || submit.isPending}
                className="ml-auto"
              >
                {submit.isPending
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
                  : <><Send className="w-4 h-4 mr-2" /> Submit & Generate Script</>
                }
              </Button>
            </div>
            {submit.isPending && (
              <p className="text-xs text-indigo-600">
                🤖 AI is refining your idea and queuing script generation…
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Ideas list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin w-6 h-6 text-indigo-500" />
        </div>
      ) : data?.ideas.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <Lightbulb className="w-12 h-12 text-amber-300 mx-auto mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">No ideas yet</h3>
            <p className="text-sm text-gray-500 mb-4">Start by submitting your first raw idea above.</p>
            <Button onClick={() => setShowForm(true)}>Submit Your First Idea</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data?.ideas.map((idea) => (
            <Card key={idea.id} className="hover:shadow-sm transition-shadow cursor-pointer">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 font-medium line-clamp-2">
                      {idea.refinedIdea ?? idea.rawIdea}
                    </p>
                    {idea.refinedIdea && idea.refinedIdea !== idea.rawIdea && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-1">Raw: {idea.rawIdea}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[idea.status]}`}>
                        {idea.status.replace("_", " ")}
                      </span>
                      {idea.pillarType && (
                        <span className="text-xs text-gray-500">
                          {PILLAR_LABELS[idea.pillarType]}
                        </span>
                      )}
                      {idea.scripts.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {idea.scripts.length} script{idea.scripts.length > 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {new Date(idea.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
