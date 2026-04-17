"use client";

import { api } from "@/lib/trpc/client";
import { useRouter } from "next/navigation";
import { CreditCard, ExternalLink, Zap } from "lucide-react";

const TIER_LABELS: Record<string, string> = {
  FREE: "Free",
  BASIC: "Basic — $29/mo",
  GROWTH: "Growth — $79/mo",
  PREMIUM: "Premium — $149/mo",
};

const STATUS_CLASSES: Record<string, string> = {
  ACTIVE: "bg-emerald-900/40 text-emerald-400",
  PAST_DUE: "bg-amber-900/40 text-amber-400",
  CANCELED: "bg-red-900/40 text-red-400",
};

export default function BillingPage() {
  const router = useRouter();
  const { data: sub, isLoading } = api.billing.getSubscription.useQuery();

  const portalMutation = api.billing.createPortalSession.useMutation({
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: (err) => alert(`Portal error: ${err.message}`),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const tier = sub?.tier ?? "FREE";
  const status = sub?.status ?? "ACTIVE";
  const isFree = tier === "FREE";
  const isCanceled = status === "CANCELED";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        <p className="text-gray-400 text-sm mt-1">
          Manage your subscription and payment details.
        </p>
      </div>

      {/* Current plan card */}
      <div className="bg-gray-900 rounded-2xl p-6 ring-1 ring-gray-800 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-500/10">
            <CreditCard size={20} className="text-violet-400" />
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Current Plan</p>
            <p className="text-lg font-semibold text-white">{TIER_LABELS[tier] ?? tier}</p>
          </div>
          {!isFree && (
            <span className={`ml-auto text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_CLASSES[status] ?? "bg-gray-800 text-gray-400"}`}>
              {status}
            </span>
          )}
        </div>

        {sub?.currentPeriodEnd && !isFree && (
          <p className="text-sm text-gray-400">
            {isCanceled ? "Access until" : sub.cancelAtPeriodEnd ? "Cancels on" : "Renews on"}{" "}
            <span className="text-white font-medium">
              {new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </p>
        )}

        <div className="flex gap-3 pt-2">
          {isFree || isCanceled ? (
            <button
              onClick={() => router.push("/pricing")}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
            >
              <Zap size={15} />
              Upgrade Plan
            </button>
          ) : (
            <button
              onClick={() => portalMutation.mutate()}
              disabled={portalMutation.isPending}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-60"
            >
              <ExternalLink size={15} />
              {portalMutation.isPending ? "Loading…" : "Manage Billing"}
            </button>
          )}

          {!isFree && !isCanceled && (
            <button
              onClick={() => router.push("/pricing")}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
            >
              <Zap size={15} />
              Upgrade
            </button>
          )}
        </div>
      </div>

      {/* Info box */}
      <div className="bg-gray-900/50 rounded-xl p-4 ring-1 ring-gray-800 text-sm text-gray-400">
        <p>
          Payments are securely processed by{" "}
          <a href="https://stripe.com" target="_blank" rel="noreferrer" className="text-violet-400 hover:underline">
            Stripe
          </a>
          . ContentForge never stores your card details.
        </p>
      </div>
    </div>
  );
}
