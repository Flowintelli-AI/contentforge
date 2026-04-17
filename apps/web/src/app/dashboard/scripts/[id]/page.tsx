"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Send, Copy, Check } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PENDING_REVIEW: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REVISION_REQUESTED: "bg-red-100 text-red-700",
  PUBLISHED: "bg-indigo-100 text-indigo-700",
};

const SECTION_CONFIG = [
  { key: "hook",          label: "🎣 Hook",          desc: "Grab attention in the first 3 seconds" },
  { key: "painPoint",     label: "💢 Pain Point",     desc: "Agitate the problem your audience faces" },
  { key: "authority",     label: "🏅 Authority",      desc: "Establish why they should listen to you" },
  { key: "solution",      label: "💡 Solution",       desc: "Deliver the value / transformation" },
  { key: "callToAction",  label: "📣 Call to Action", desc: "Tell them exactly what to do next" },
];

export default function ScriptDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);

  const { data: script, isLoading, error } = trpc.scripts.get.useQuery({ id });
  const submitMutation = trpc.scripts.submitForReview.useMutation();
  const utils = trpc.useUtils();

  async function handleSubmitForReview() {
    await submitMutation.mutateAsync({ id });
    utils.scripts.list.invalidate();
    utils.scripts.get.invalidate({ id });
  }

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function copyFullScript() {
    if (!script) return;
    const sections = SECTION_CONFIG
      .map(({ key, label }) => {
        const val = script[key as keyof typeof script] as string | null;
        return val ? `${label}\n${val}` : null;
      })
      .filter(Boolean)
      .join("\n\n");

    const snapshot = script.versions?.[0]?.snapshot as Record<string, unknown> | null;
    const caption = snapshot?.caption as string | undefined;
    const hashtags = snapshot?.hashtags as string[] | undefined;

    const extra = [
      caption ? `\n\n📝 Caption:\n${caption}` : "",
      hashtags?.length ? `\n\n#️⃣ Hashtags:\n${hashtags.join(" ")}` : "",
    ].join("");

    await copyText(`${script.title}\n\n${sections}${extra}`, "full");
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error || !script) {
    return (
      <div className="p-8">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <p className="text-red-600">Script not found.</p>
      </div>
    );
  }

  const snapshot = script.versions?.[0]?.snapshot as Record<string, unknown> | null;
  const caption = snapshot?.caption as string | undefined;
  const hashtags = snapshot?.hashtags as string[] | undefined;
  const statusColor = STATUS_COLORS[script.status] ?? "bg-gray-100 text-gray-700";

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{script.title}</h1>
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">{script.idea?.rawIdea}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor}`}>
            {script.status.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 mb-6">
        <Button variant="outline" size="sm" onClick={copyFullScript}>
          {copied === "full" ? <Check className="w-4 h-4 mr-2 text-green-600" /> : <Copy className="w-4 h-4 mr-2" />}
          {copied === "full" ? "Copied!" : "Copy Full Script"}
        </Button>
        {script.status === "DRAFT" && (
          <Button size="sm" onClick={handleSubmitForReview} disabled={submitMutation.isPending}>
            {submitMutation.isPending
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</>
              : <><Send className="w-4 h-4 mr-2" /> Submit for Review</>
            }
          </Button>
        )}
      </div>

      {/* Script sections */}
      <div className="space-y-4">
        {SECTION_CONFIG.map(({ key, label, desc }) => {
          const value = script[key as keyof typeof script] as string | null | undefined;
          if (!value) return null;
          return (
            <Card key={key} className="relative group">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold">{label}</CardTitle>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 p-0"
                    onClick={() => copyText(value, key)}
                  >
                    {copied === key
                      ? <Check className="w-3.5 h-3.5 text-green-600" />
                      : <Copy className="w-3.5 h-3.5" />
                    }
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Caption & Hashtags from snapshot */}
      {(caption || hashtags?.length) && (
        <div className="mt-6 space-y-4">
          {caption && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">📝 Post Caption</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{caption}</p>
              </CardContent>
            </Card>
          )}
          {hashtags?.length && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">#️⃣ Hashtags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {hashtags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-xs font-normal">
                      {tag.startsWith("#") ? tag : `#${tag}`}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Full script (collapsible) */}
      {script.fullScript && (
        <Card className="mt-6 bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">📄 Full Script</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-mono">
              {script.fullScript}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Admin feedback */}
      {script.adminReview && (
        <Card className={`mt-6 ${script.adminReview.status === "REVISION_REQUESTED" ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              {script.adminReview.status === "APPROVED" ? "✅ Admin Approved" : "⚠️ Revision Requested"}
            </CardTitle>
          </CardHeader>
          {script.adminReview.notes && (
            <CardContent>
              <p className="text-sm text-gray-700">{script.adminReview.notes}</p>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
