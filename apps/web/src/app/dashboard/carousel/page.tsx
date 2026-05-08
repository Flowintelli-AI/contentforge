"use client";

import { useState } from "react";
import { api } from "@/lib/trpc/client";
import {
  LayoutGrid,
  Sparkles,
  History,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Zap,
  ToggleLeft,
  ToggleRight,
  Play,
  Settings2,
  AlertCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type GenerateResult = {
  slides: string[];
  caption: string;
  platformFitness: Record<string, number>;
  postRecommendation: string;
  run: { id: string; title: string; status: string; createdAt: Date };
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CarouselPage() {
  const [tab, setTab] = useState<"generate" | "pipeline" | "history">("generate");

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-violet-500/10 rounded-lg">
          <LayoutGrid className="w-6 h-6 text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Carousel Generator</h1>
          <p className="text-sm text-zinc-400">AI-powered 10-slide carousels posted directly to Instagram</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 w-fit border border-zinc-800">
        {(["generate", "pipeline", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors capitalize ${
              tab === t ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t === "generate" && <><Sparkles className="inline w-3.5 h-3.5 mr-1" />Generate</>}
            {t === "pipeline" && <><Zap className="inline w-3.5 h-3.5 mr-1" />Pipeline</>}
            {t === "history" && <><History className="inline w-3.5 h-3.5 mr-1" />History</>}
          </button>
        ))}
      </div>

      {tab === "generate" && <GenerateTab />}
      {tab === "pipeline" && <PipelineTab />}
      {tab === "history" && <HistoryTab />}
    </div>
  );
}

// ─── Generate Tab ─────────────────────────────────────────────────────────────

function GenerateTab() {
  const { data: kit } = api.brand.get.useQuery();
  const generate = api.carousel.generate.useMutation();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [platform, setPlatform] = useState<"instagram" | "linkedin">("instagram");
  const [showOverride, setShowOverride] = useState(false);
  const [override, setOverride] = useState({
    name: "", handle: "", niche: "", primary_color: "", accent_color: "", logo_url: "", website: "", voice_notes: "",
  });
  const [result, setResult] = useState<GenerateResult | null>(null);

  const upd = (field: string, value: string) => setOverride((o) => ({ ...o, [field]: value }));

  const handleGenerate = async () => {
    const brandOverride = Object.fromEntries(
      Object.entries(override).filter(([, v]) => v.trim() !== "")
    ) as typeof override;
    const res = await generate.mutateAsync({
      articleTitle: title,
      articleBody: body,
      platform,
      brandOverride: Object.keys(brandOverride).length > 0 ? brandOverride : undefined,
    });
    setResult(res);
  };

  const handleDownloadPdf = () => {
    if (!result?.run) return;
    window.open(`/api/carousel/${result.run.id}/pdf`, "_blank");
  };

  return (
    <div className="space-y-6">
      {/* Article inputs */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Content</h2>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Title / Topic</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 5 habits that changed my life"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Article Body / Key Points</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="Paste your article or bullet-point key ideas here. GPT will turn this into 10 engaging slides."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 resize-none"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Platform</label>
          <div className="flex gap-2">
            {(["instagram", "linkedin"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`px-4 py-1.5 text-sm rounded-lg border font-medium capitalize transition-colors ${
                  platform === p
                    ? "border-violet-500 bg-violet-500/10 text-violet-300"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Brand override */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowOverride((v) => !v)}
          className="w-full flex items-center justify-between px-6 py-4 text-sm text-zinc-300 hover:bg-zinc-800/50 transition-colors"
        >
          <span className="font-medium">Brand Override <span className="text-zinc-500 font-normal">(optional — pre-filled from Brand Kit)</span></span>
          {showOverride ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showOverride && (
          <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-zinc-800">
            {[
              { key: "name", label: "Brand Name", ph: kit?.brandName ?? "My Brand" },
              { key: "handle", label: "Handle", ph: kit?.handle ?? "@brand" },
              { key: "niche", label: "Niche", ph: kit?.niche ?? "Fitness" },
              { key: "primary_color", label: "Primary Color", ph: kit?.primaryColor ?? "#06b6d4" },
              { key: "accent_color", label: "Accent Color", ph: kit?.accentColor ?? "#8b5cf6" },
              { key: "logo_url", label: "Logo URL", ph: kit?.logoUrl ?? "https://..." },
              { key: "website", label: "Website", ph: kit?.website ?? "https://..." },
            ].map(({ key, label, ph }) => (
              <div key={key} className="mt-4">
                <label className="block text-xs text-zinc-400 mb-1">{label}</label>
                <input
                  value={override[key as keyof typeof override]}
                  onChange={(e) => upd(key, e.target.value)}
                  placeholder={ph ?? ""}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
                />
              </div>
            ))}
            <div className="mt-4 sm:col-span-2">
              <label className="block text-xs text-zinc-400 mb-1">Voice Notes</label>
              <textarea
                value={override.voice_notes}
                onChange={(e) => upd("voice_notes", e.target.value)}
                rows={2}
                placeholder={kit?.voiceNotes ?? "Tone/style override for this post…"}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={!title.trim() || !body.trim() || generate.isPending}
        className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {generate.isPending ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Generating 10 slides… (this may take ~30s)
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5" />
            Generate Carousel
          </>
        )}
      </button>

      {generate.error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
          {generate.error.message}
        </div>
      )}

      {/* Results */}
      {result && <ResultSection result={result} onDownload={handleDownloadPdf} onRegenerate={() => { setResult(null); handleGenerate(); }} />}
    </div>
  );
}

// ─── Result Section ───────────────────────────────────────────────────────────

function ResultSection({ result, onDownload, onRegenerate }: { result: GenerateResult; onDownload: () => void; onRegenerate: () => void }) {
  const [fullscreen, setFullscreen] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Slide grid */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">10-Slide Preview</h3>
        {result.slides.length === 0 ? (
          <p className="text-zinc-500 text-sm">No slide images returned by the generator.</p>
        ) : (
          <div className="grid grid-cols-5 gap-2">
            {result.slides.map((url, i) => (
              <button
                key={i}
                onClick={() => setFullscreen(url)}
                className="aspect-square rounded-lg overflow-hidden border border-zinc-700 hover:border-violet-500 transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Caption */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-2">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Caption</h3>
        <textarea
          defaultValue={result.caption}
          rows={4}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 resize-none"
        />
      </div>

      {/* Platform fitness */}
      {Object.keys(result.platformFitness).length > 0 && (
        <div className="flex gap-3">
          {Object.entries(result.platformFitness).map(([p, score]) => (
            <div key={p} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
              <span className="text-xs text-zinc-400 capitalize">{p}</span>
              <span className="text-sm font-bold" style={{ color: score >= 8 ? "#22c55e" : score >= 5 ? "#f59e0b" : "#ef4444" }}>
                {score}/10
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onDownload}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors border border-zinc-700"
        >
          <Download className="w-4 h-4" /> Download PDF
        </button>
        <button
          onClick={onRegenerate}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors border border-zinc-700"
        >
          <RefreshCw className="w-4 h-4" /> Regenerate
        </button>
      </div>

      {/* Fullscreen overlay */}
      {fullscreen && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setFullscreen(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fullscreen} alt="Slide" className="max-h-full max-w-full rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}

// ─── Pipeline Tab ─────────────────────────────────────────────────────────────

function PipelineTab() {
  const utils = api.useUtils();
  const { data: pipeline, isLoading } = api.carousel.pipelineGet.useQuery();
  const { data: kit } = api.brand.get.useQuery();

  const save = api.carousel.pipelineSave.useMutation({
    onSuccess: () => utils.carousel.pipelineGet.invalidate(),
  });
  const toggle = api.carousel.pipelineToggle.useMutation({
    onSuccess: () => utils.carousel.pipelineGet.invalidate(),
  });
  const trigger = api.carousel.triggerNow.useMutation({
    onSuccess: () => { utils.carousel.list.invalidate(); setTestResult("✅ Carousel generated and posted to Instagram!"); },
    onError: (e) => setTestResult(`❌ ${e.message}`),
  });

  const [maxPerDay, setMaxPerDay] = useState<number | null>(null);
  const [platforms, setPlatforms] = useState<string[] | null>(null);
  const [testTitle, setTestTitle] = useState("");
  const [testBody, setTestBody] = useState("");
  const [showTest, setShowTest] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
      </div>
    );
  }

  const effectiveMax = maxPerDay ?? pipeline?.maxPerDay ?? 1;
  const effectivePlatforms = platforms ?? pipeline?.platforms ?? ["instagram"];

  const hasPipeline = !!pipeline;
  const isActive = pipeline?.isActive ?? false;

  const handleSave = async () => {
    await save.mutateAsync({
      maxPerDay: effectiveMax,
      platforms: effectivePlatforms as ("instagram" | "linkedin")[],
    });
    setMaxPerDay(null);
    setPlatforms(null);
  };

  const handleToggle = async () => {
    if (!hasPipeline) {
      // Create + activate in one shot
      await save.mutateAsync({ isActive: true, maxPerDay: effectiveMax, platforms: effectivePlatforms as ("instagram" | "linkedin")[] });
    } else {
      await toggle.mutateAsync();
    }
  };

  const handleTestNow = async () => {
    setTestResult(null);
    await trigger.mutateAsync({ articleTitle: testTitle, articleBody: testBody });
  };

  const isDirty = maxPerDay !== null || platforms !== null;

  return (
    <div className="space-y-5">
      {/* Brand Kit warning */}
      {!kit?.brandName && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-amber-300 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            No Brand Kit set up yet.{" "}
            <a href="/dashboard/brand" className="underline underline-offset-2 hover:text-amber-200">
              Set up your brand
            </a>{" "}
            so carousels use your colors, logo, and voice.
          </span>
        </div>
      )}

      {/* Main control card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-6">
        {/* On/Off toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Auto-Post Pipeline</h2>
            <p className="text-sm text-zinc-400 mt-0.5">
              Hourly cron finds fresh articles for your niche and posts a branded carousel automatically.
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={toggle.isPending || save.isPending}
            className="flex items-center gap-2 transition-opacity disabled:opacity-50"
          >
            {isActive ? (
              <>
                <ToggleRight className="w-8 h-8 text-violet-400" />
                <span className="text-sm font-medium text-violet-300">Active</span>
              </>
            ) : (
              <>
                <ToggleLeft className="w-8 h-8 text-zinc-500" />
                <span className="text-sm font-medium text-zinc-400">Inactive</span>
              </>
            )}
          </button>
        </div>

        {/* Status strip */}
        {hasPipeline && (
          <div className="flex flex-wrap gap-4 text-xs text-zinc-500 border-t border-zinc-800 pt-4">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Last ran:{" "}
              {pipeline.lastRanAt
                ? new Date(pipeline.lastRanAt).toLocaleString()
                : "Never"}
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              {pipeline.isActive ? "Running hourly" : "Paused"}
            </span>
          </div>
        )}

        {/* Settings */}
        <div className="border-t border-zinc-800 pt-5 space-y-5">
          <div className="flex items-center gap-3">
            <Settings2 className="w-4 h-4 text-zinc-400 flex-shrink-0" />
            <h3 className="text-sm font-medium text-zinc-300">Settings</h3>
          </div>

          {/* Max per day */}
          <div>
            <label className="block text-xs text-zinc-400 mb-2">
              Max carousels per day
            </label>
            <div className="flex gap-2">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => setMaxPerDay(n)}
                  className={`w-10 h-10 rounded-lg text-sm font-semibold border transition-colors ${
                    effectiveMax === n
                      ? "border-violet-500 bg-violet-500/10 text-violet-300"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Platforms */}
          <div>
            <label className="block text-xs text-zinc-400 mb-2">
              Post to
            </label>
            <div className="flex gap-2">
              {(["instagram", "linkedin"] as const).map((p) => {
                const active = effectivePlatforms.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() => {
                      const next = active
                        ? effectivePlatforms.filter((x) => x !== p)
                        : [...effectivePlatforms, p];
                      if (next.length > 0) setPlatforms(next);
                    }}
                    className={`px-4 py-1.5 text-sm rounded-lg border font-medium capitalize transition-colors ${
                      active
                        ? "border-violet-500 bg-violet-500/10 text-violet-300"
                        : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Save button — only show when dirty */}
          {isDirty && (
            <button
              onClick={handleSave}
              disabled={save.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Save changes
            </button>
          )}
        </div>
      </div>

      {/* Test Now card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowTest((v) => !v)}
          className="w-full flex items-center justify-between px-6 py-4 text-sm text-zinc-300 hover:bg-zinc-800/50 transition-colors"
        >
          <span className="flex items-center gap-2 font-medium">
            <Play className="w-4 h-4 text-violet-400" />
            Test Pipeline Now
          </span>
          {showTest ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showTest && (
          <div className="px-6 pb-6 space-y-4 border-t border-zinc-800">
            <p className="text-xs text-zinc-500 pt-4">
              Generates a carousel from the article you provide and posts it immediately to Instagram — no wait for the hourly cron.
            </p>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Article Title</label>
              <input
                value={testTitle}
                onChange={(e) => setTestTitle(e.target.value)}
                placeholder="e.g. 5 AI tools that 10x my workflow"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Article Body / Key Points</label>
              <textarea
                value={testBody}
                onChange={(e) => setTestBody(e.target.value)}
                rows={5}
                placeholder="Paste the article or your key bullet points here…"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 resize-none"
              />
            </div>

            {testResult && (
              <div className={`text-sm rounded-lg px-4 py-3 border ${
                testResult.startsWith("✅")
                  ? "bg-green-500/10 border-green-500/30 text-green-300"
                  : "bg-red-500/10 border-red-500/30 text-red-400"
              }`}>
                {testResult}
              </div>
            )}

            <button
              onClick={handleTestNow}
              disabled={!testTitle.trim() || !testBody.trim() || trigger.isPending}
              className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
            >
              {trigger.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating + Posting…</>
              ) : (
                <><Play className="w-4 h-4" /> Run Now</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}



function HistoryTab() {
  const { data, isLoading } = api.carousel.list.useQuery({});

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
      </div>
    );
  }

  if (!data?.runs.length) {
    return (
      <div className="text-center py-16 text-zinc-500">
        <LayoutGrid className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>No carousels generated yet.</p>
        <p className="text-sm mt-1">Go to the Generate tab to create your first one.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.runs.map((run) => (
        <div key={run.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
          {/* Thumbnail */}
          {run.slideUrls[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={run.slideUrls[0]} alt="thumb" className="w-16 h-16 rounded-lg object-cover border border-zinc-700 flex-shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-zinc-800 border border-zinc-700 flex-shrink-0 flex items-center justify-center">
              <LayoutGrid className="w-6 h-6 text-zinc-600" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{run.title}</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {new Date(run.createdAt).toLocaleDateString()} · {run.platform}
            </p>
          </div>
          <StatusBadge status={run.status} />
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "DONE") return <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle className="w-3.5 h-3.5" /> Done</span>;
  if (status === "FAILED") return <span className="flex items-center gap-1 text-xs text-red-400"><XCircle className="w-3.5 h-3.5" /> Failed</span>;
  return <span className="flex items-center gap-1 text-xs text-yellow-400"><Clock className="w-3.5 h-3.5" /> Pending</span>;
}
