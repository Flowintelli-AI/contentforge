"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, ChevronRight, Loader2 } from "lucide-react";

const STEPS = ["welcome", "niche", "posting-goal", "done"] as const;
type Step = typeof STEPS[number];

const NICHES = [
  "Personal Finance","Fitness & Health","Business & Entrepreneurship",
  "Beauty & Skincare","Parenting","Real Estate","Tech & AI",
  "Fashion","Food & Recipes","Mental Health","Travel","Home & Decor",
  "Career & Productivity","Relationships","Spirituality",
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [selectedNiches, setSelectedNiches] = useState<string[]>([]);
  const [postingGoal, setPostingGoal] = useState(20);

  const stepIndex = STEPS.indexOf(step);
  const progress = (stepIndex / (STEPS.length - 1)) * 100;

  const completeOnboarding = api.creators.completeOnboarding.useMutation({
    onSuccess: () => router.push("/dashboard"),
  });

  function next() {
    const nextStep = STEPS[stepIndex + 1];
    if (nextStep === "done") {
      completeOnboarding.mutate({ niches: selectedNiches, postingGoal });
      setStep("done");
    } else if (nextStep) {
      setStep(nextStep);
    }
  }

  function toggleNiche(niche: string) {
    if (selectedNiches.includes(niche)) {
      setSelectedNiches(selectedNiches.filter((n) => n !== niche));
    } else if (selectedNiches.length < 3) {
      setSelectedNiches([...selectedNiches, niche]);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <span className="text-2xl font-bold text-indigo-600">ContentForge</span>
          <p className="text-sm text-gray-500 mt-1">Step {stepIndex + 1} of {STEPS.length}</p>
          <Progress value={progress} className="mt-3 h-1.5" />
        </div>

        {step === "welcome" && (
          <Card>
            <CardHeader className="text-center">
              <div className="text-5xl mb-4">🚀</div>
              <CardTitle className="text-2xl">Welcome to ContentForge</CardTitle>
              <CardDescription className="text-base mt-2">Let's set up your content machine in 3 minutes.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={next}>Get Started <ChevronRight className="ml-2 w-4 h-4" /></Button>
            </CardContent>
          </Card>
        )}

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
                    <button
                      key={niche}
                      onClick={() => toggleNiche(niche)}
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

        {step === "done" && (
          <Card>
            <CardHeader className="text-center">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <CardTitle className="text-2xl">You're all set!</CardTitle>
              <CardDescription className="text-base mt-2">Your content machine is ready.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center py-4">
              {completeOnboarding.isPending
                ? <Loader2 className="animate-spin w-6 h-6 text-indigo-600" />
                : <Button className="w-full" onClick={() => router.push("/dashboard")}>Go to Dashboard</Button>
              }
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
