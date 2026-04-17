"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/trpc/client";
import { Check } from "lucide-react";

const TIERS = [
  {
    id: "BASIC" as const,
    name: "Basic",
    price: 29,
    description: "Perfect for individual creators just getting started.",
    features: [
      "30 AI-generated scripts/month",
      "5 content pillars",
      "Basic analytics",
      "Voice dictation",
      "Email support",
    ],
    highlight: false,
  },
  {
    id: "GROWTH" as const,
    name: "Growth",
    price: 79,
    description: "For creators ready to scale their content output.",
    features: [
      "100 AI-generated scripts/month",
      "Unlimited content pillars",
      "Advanced analytics",
      "Voice dictation",
      "Calendar scheduling",
      "Priority support",
    ],
    highlight: true,
  },
  {
    id: "PREMIUM" as const,
    name: "Premium",
    price: 149,
    description: "Full power — built for professional creators and agencies.",
    features: [
      "Unlimited AI-generated scripts",
      "Unlimited content pillars",
      "Advanced analytics",
      "Voice dictation",
      "Calendar scheduling",
      "Video repurposing (coming soon)",
      "Avatar video generation (coming soon)",
      "Dedicated support",
    ],
    highlight: false,
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  const createCheckout = api.billing.createCheckoutSession.useMutation({
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err) => {
      alert(`Checkout error: ${err.message}`);
      setLoadingTier(null);
    },
  });

  const handleUpgrade = (tier: "BASIC" | "GROWTH" | "PREMIUM") => {
    setLoadingTier(tier);
    createCheckout.mutate({ tier });
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="max-w-5xl mx-auto px-6 pt-20 pb-12 text-center">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-sm text-gray-400 hover:text-white mb-8 inline-flex items-center gap-1"
        >
          ← Back to dashboard
        </button>
        <h1 className="text-4xl font-bold mb-4">Simple, transparent pricing</h1>
        <p className="text-gray-400 text-lg max-w-xl mx-auto">
          Turn one raw idea into 30 days of content. Cancel any time.
        </p>
      </div>

      {/* Tier cards */}
      <div className="max-w-5xl mx-auto px-6 pb-24 grid grid-cols-1 md:grid-cols-3 gap-6">
        {TIERS.map((tier) => (
          <div
            key={tier.id}
            className={`relative rounded-2xl p-6 flex flex-col gap-4 ${
              tier.highlight
                ? "bg-violet-600 ring-2 ring-violet-400"
                : "bg-gray-900 ring-1 ring-gray-800"
            }`}
          >
            {tier.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet-400 text-violet-950 text-xs font-bold px-3 py-1 rounded-full">
                Most Popular
              </div>
            )}

            <div>
              <h2 className="text-xl font-bold">{tier.name}</h2>
              <p className={`text-sm mt-1 ${tier.highlight ? "text-violet-200" : "text-gray-400"}`}>
                {tier.description}
              </p>
            </div>

            <div className="flex items-end gap-1">
              <span className="text-4xl font-extrabold">${tier.price}</span>
              <span className={`text-sm pb-1 ${tier.highlight ? "text-violet-200" : "text-gray-400"}`}>
                /month
              </span>
            </div>

            <ul className="flex flex-col gap-2 flex-1">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check
                    size={15}
                    className={`mt-0.5 shrink-0 ${tier.highlight ? "text-violet-200" : "text-violet-400"}`}
                  />
                  <span className={tier.highlight ? "text-white" : "text-gray-300"}>{f}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleUpgrade(tier.id)}
              disabled={loadingTier !== null}
              className={`mt-2 w-full py-2.5 rounded-xl text-sm font-semibold transition ${
                tier.highlight
                  ? "bg-white text-violet-700 hover:bg-violet-50"
                  : "bg-violet-600 text-white hover:bg-violet-500"
              } disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {loadingTier === tier.id ? "Redirecting…" : `Get ${tier.name}`}
            </button>
          </div>
        ))}
      </div>

      <div className="text-center pb-16 text-gray-500 text-sm">
        All plans include a 7-day free trial. No credit card required to start.
      </div>
    </div>
  );
}
