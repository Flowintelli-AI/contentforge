"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, ChevronRight, Loader2, Palette, Sparkles } from "lucide-react";

const STEPS = ["welcome", "niche", "brand", "pillars", "posting-goal", "done"] as const;
type Step = typeof STEPS[number];

const NICHES = [
  "Personal Finance","Fitness & Health","Business & Entrepreneurship",
  "Beauty & Skincare","Parenting","Real Estate","Tech & AI",
  "Fashion","Food & Recipes","Mental Health","Travel","Home & Decor",
  "Career & Productivity","Relationships","Spirituality",
];

const PILLAR_PLACEHOLDERS: Record<string, string[]> = {
  "Tech & AI":                    ["AI tools & automation","Startup growth","Software engineering"],
  "Business & Entrepreneurship":  ["Leadership mindset","Sales strategy","Building in public"],
  "Personal Finance":             ["Investing basics","Budget hacks","Side hustles"],
  "Fitness & Health":             ["Workout routines","Nutrition tips","Mental wellness"],
  "Marketing":                    ["Content strategy","Growth hacks","Brand storytelling"],
  "Real Estate":                  ["Market trends","Investment tips","Deal analysis"],
  "Career & Productivity":        ["Career growth","Deep work","Productivity systems"],
};

const DEFAULT_PLACEHOLDERS = ["Your main topic","Supporting topic","Niche expertise"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");

  // Niche step
  const [selectedNiches, setSelectedNiches] = useState<string[]>([]);

  // Brand step
  const [brandName, setBrandName]       = useState("");
  const [handle, setHandle]             = useState("");
  const [primaryColor, setPrimaryColor] = useState("#0f172a");
  const [accentColor, setAccentColor]   = useState("#06b6d4");
  const [logoUrl, setLogoUrl]           = useState("");

  // Pillars step
  const [pillars, setPillars] = useState(["", "", ""]);

  // Posting goal step
  const [postingGoal, setPostingGoal] = useState(20);

  const stepIndex = STEPS.indexOf(step);
  const progress  = (stepIndex / (STEPS.length - 1)) * 100;

  const utils = api.useUtils();
  const completeOnboarding = api.creators.completeOnboarding.useMutation({
    onSuccess: async () => {
      await utils.creators.getMyProfile.invalidate();
      router.push("/dashboard");
    },
  });

  function next() {
    const nextStep = STEPS[stepIndex + 1];
    if (nextStep === "done") {
      completeOnboarding.mutate({
        niches: selectedNiches,
        postingGoal,
        brand: { brandName: brandName || undefined, handle: handle || undefined, primaryColor, accentColor, logoUrl: logoUrl || undefined },
        pillars: pillars.filter(Boolean),
      });
      setStep("done");
    } else if (nextStep) {
      setStep(nextStep);
    }
  }

  function skip() {
    const nextStep = STEPS[stepIndex + 1];
    if (nextStep) setStep(nextStep as Step);
  }

  function toggleNiche(niche: string) {
    setSelectedNiches((prev) =>
      prev.includes(niche) ? prev.filter((n) => n !== niche) : prev.length < 3 ? [...prev, niche] : prev
    );
  }

  function setPillar(index: number, value: string) {
    setPillars((prev) => prev.map((p, i) => (i === index ? value : p)));
  }

  const pillarHints = PILLAR_PLACEHOLDERS[selectedNiches[0] ?? ""] ?? DEFAULT_PLACEHOLDERS;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <span className="text-2xl font-bold text-indigo-600">ContentForge</span>
          <p className="text-sm text-gray-500 mt-1">Step {stepIndex + 1} of {STEPS.length}</p>
          <Progress value={progress} className="mt-3 h-1.5" />
        </div>

        {/* ── Welcome ── */}
        {step === "welcome" && (
          <Card>
            <CardHeader className="text-center">
              <div className="text-5xl mb-4">🚀</div>
              <CardTitle className="text-2xl">Welcome to ContentForge</CardTitle>
              <CardDescription className="text-base mt-2">Let's set up your personalised content machine in 3 minutes.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={next}>Get Started <ChevronRight className="ml-2 w-4 h-4" /></Button>
            </CardContent>
          </Card>
        )}

        {/* ── Niche ── */}
        {step === "niche" && (
          <Card>
            <CardHeader>
              <CardTitle>What's your niche?</CardTitle>
              <CardDescription>Select up to 3. We'll tailor your content strategy.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 mb-6">
                {NICHES.map((niche) => {
                  const isSelected = selectedNiches.includes(niche);
                  return (
                    <button key={niche} onClick={() => toggleNiche(niche)}
                      className={`px-3 py-2.5 rounded-lg text-sm font-medium border-2 text-left transition-all ${
                        isSelected ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5" />}
                      {niche}
                    </button>
                  );
                })}
              </div>
              <Button className="w-full" onClick={next} disabled={selectedNiches.length === 0}>
                Continue <ChevronRight className="ml-2 w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Brand ── */}
        {step === "brand" && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 mb-1">
                <Palette className="w-5 h-5 text-indigo-500" />
                <CardTitle>Your brand identity</CardTitle>
              </div>
              <CardDescription>Used to personalise every carousel we generate for you.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Brand name</label>
                  <input value={brandName} onChange={(e) => setBrandName(e.target.value)}
                    placeholder="Flowintelli"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Handle</label>
                  <input value={handle} onChange={(e) => setHandle(e.target.value)}
                    placeholder="@yourhandle"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Primary colour</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded border border-gray-200 p-0.5" />
                    <input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)}
                      className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Accent colour</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded border border-gray-200 p-0.5" />
                    <input value={accentColor} onChange={(e) => setAccentColor(e.target.value)}
                      className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
              </div>

              {/* Live preview swatch */}
              <div className="rounded-lg overflow-hidden border border-gray-100">
                <div className="h-10" style={{ backgroundColor: primaryColor }} />
                <div className="h-4" style={{ backgroundColor: accentColor }} />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Logo URL <span className="text-gray-400">(optional)</span></label>
                <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://yourbrand.com/logo.png"
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={skip}>Skip</Button>
                <Button className="flex-1" onClick={next}>Continue <ChevronRight className="ml-2 w-4 h-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Pillars ── */}
        {step === "pillars" && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-5 h-5 text-indigo-500" />
                <CardTitle>Your content pillars</CardTitle>
              </div>
              <CardDescription>
                What topics do you post about? We'll use these to surface the most relevant articles for your carousels.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Pillar {i + 1} {i > 0 && <span className="text-gray-400">(optional)</span>}</label>
                  <input
                    value={pillars[i]}
                    onChange={(e) => setPillar(i, e.target.value)}
                    placeholder={pillarHints[i]}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={skip}>Skip</Button>
                <Button className="flex-1" onClick={next} disabled={pillars[0].trim() === ""}>
                  Continue <ChevronRight className="ml-2 w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Posting goal ── */}
        {step === "posting-goal" && (
          <Card>
            <CardHeader>
              <CardTitle>How many posts per month?</CardTitle>
              <CardDescription>We'll build your content calendar around this.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-6">
                <span className="text-6xl font-extrabold text-indigo-600">{postingGoal}</span>
                <p className="text-gray-500 mt-2">posts per month</p>
              </div>
              <input type="range" min={8} max={60} step={4} value={postingGoal}
                onChange={(e) => setPostingGoal(Number(e.target.value))}
                className="w-full accent-indigo-600" />
              <div className="flex justify-between text-xs text-gray-400 mt-1"><span>8</span><span>60</span></div>
              <Button className="w-full mt-6" onClick={next}>Continue <ChevronRight className="ml-2 w-4 h-4" /></Button>
            </CardContent>
          </Card>
        )}

        {/* ── Done ── */}
        {step === "done" && (
          <Card>
            <CardHeader className="text-center">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <CardTitle className="text-2xl">You're all set!</CardTitle>
              <CardDescription className="text-base mt-2">
                Your personalised content machine is spinning up. Head to the Carousel tab to activate automatic posting.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-4 gap-3">
              {completeOnboarding.isPending ? (
                <Loader2 className="animate-spin w-6 h-6 text-indigo-600" />
              ) : completeOnboarding.isError ? (
                <>
                  <p className="text-sm text-red-600 text-center">Something went wrong — please try again.</p>
                  <Button className="w-full" onClick={() => completeOnboarding.mutate({
                    niches: selectedNiches, postingGoal,
                    brand: { brandName: brandName || undefined, handle: handle || undefined, primaryColor, accentColor, logoUrl: logoUrl || undefined },
                    pillars: pillars.filter(Boolean),
                  })}>
                    Retry
                  </Button>
                </>
              ) : (
                <Loader2 className="animate-spin w-6 h-6 text-indigo-600" />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
