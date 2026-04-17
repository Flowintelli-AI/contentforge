"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/trpc/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const WEBHOOK_URL = `${APP_URL}/api/webhooks/instagram`;

const ERROR_MESSAGES: Record<string, string> = {
  ig_denied: "You cancelled the Instagram connection.",
  ig_not_configured: "Instagram is not configured on this server yet.",
  ig_state_mismatch: "Security check failed — please try again.",
  ig_no_code: "No authorization code received from Instagram.",
  ig_oauth_failed: "Something went wrong connecting your account. Please try again.",
};

export function InstagramConnectionCard() {
  const utils = api.useUtils();
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data: conn, isLoading } = api.instagram.getConnection.useQuery();

  const [copied, setCopied] = useState(false);
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Read OAuth result from query params, then clean URL
  useEffect(() => {
    const connected = searchParams.get("instagram");
    const error = searchParams.get("error");

    if (connected === "connected") {
      setBanner({ type: "success", message: "Instagram connected successfully! 🎉" });
      void utils.instagram.getConnection.invalidate();
      router.replace("/dashboard/settings");
    } else if (error && error.startsWith("ig_")) {
      setBanner({ type: "error", message: ERROR_MESSAGES[error] ?? "Instagram connection failed." });
      router.replace("/dashboard/settings");
    }
  }, [searchParams, router, utils.instagram.getConnection]);

  const disconnect = api.instagram.disconnect.useMutation({
    onSuccess: () => void utils.instagram.getConnection.invalidate(),
  });

  const refresh = api.instagram.refreshToken.useMutation({
    onSuccess: () => void utils.instagram.getConnection.invalidate(),
  });

  function copyWebhook() {
    void navigator.clipboard.writeText(WEBHOOK_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isExpiringSoon =
    conn?.tokenExpiry &&
    new Date(conn.tokenExpiry).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span>Instagram</span>
              {conn ? (
                <Badge variant="secondary" className="bg-green-100 text-green-800">Connected</Badge>
              ) : (
                <Badge variant="outline">Not Connected</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Native comment automation &amp; DM workflows — no ManyChat required
            </CardDescription>
          </div>

          {conn && (
            <div className="flex gap-2">
              {isExpiringSoon && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refresh.mutate()}
                  disabled={refresh.isPending}
                >
                  {refresh.isPending ? "Refreshing…" : "Refresh Token"}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <a href="/api/auth/instagram">Reconnect</a>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* OAuth result banner */}
        {banner && (
          <div
            className={`rounded-md border p-3 text-sm ${
              banner.type === "success"
                ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
                : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            }`}
          >
            {banner.message}
          </div>
        )}

        {/* Connected state */}
        {conn && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground w-28">Account</span>
              <span className="font-medium">@{conn.igUsername}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground w-28">Token expires</span>
              <span className={isExpiringSoon ? "text-orange-500 font-medium" : ""}>
                {conn.tokenExpiry
                  ? new Date(conn.tokenExpiry).toLocaleDateString()
                  : "Unknown"}
                {isExpiringSoon && " ⚠ Expiring soon"}
              </span>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Webhook URL — paste into your Meta App → Webhooks
              </Label>
              <div className="flex gap-2">
                <Input value={WEBHOOK_URL} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="sm" onClick={copyWebhook}>
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Subscribe to: <code>comments</code>, <code>messages</code>
              </p>
            </div>
          </div>
        )}

        {/* Not connected — OAuth button */}
        {!conn && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect your Instagram Business or Creator account to enable comment
              automations, keyword-triggered DMs, and subscriber broadcasts.
            </p>
            <Button asChild size="lg" className="w-full sm:w-auto">
              <a href="/api/auth/instagram">
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
                Connect with Instagram
              </a>
            </Button>
            <p className="text-xs text-muted-foreground">
              You&apos;ll be redirected to Instagram to approve access. Requires a
              Business or Creator account.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
