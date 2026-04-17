"use client";

import { useState } from "react";
import { api } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const WEBHOOK_URL = `${APP_URL}/api/webhooks/instagram`;

export function InstagramConnectionCard() {
  const utils = api.useUtils();
  const { data: conn, isLoading } = api.instagram.getConnection.useQuery();

  const [form, setForm] = useState({
    igUserId: "",
    igUsername: "",
    accessToken: "",
    pageId: "",
  });
  const [showForm, setShowForm] = useState(false);
  const [copied, setCopied] = useState(false);

  const save = api.instagram.saveConnection.useMutation({
    onSuccess: () => {
      void utils.instagram.getConnection.invalidate();
      setShowForm(false);
      setForm({ igUserId: "", igUsername: "", accessToken: "", pageId: "" });
    },
  });

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
                <Badge variant="success">Connected</Badge>
              ) : (
                <Badge variant="outline">Not Connected</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Native comment automation & DM workflows — no ManyChat required
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
                onClick={() => setShowForm(true)}
              >
                Update
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                Disconnect
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {conn && !showForm && (
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
                Meta Webhook URL (paste this in your Meta App → Webhooks)
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

        {(!conn || showForm) && (
          <div className="space-y-4">
            {!conn && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
                <p className="font-medium mb-1">How to connect</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Go to <a href="https://developers.facebook.com/apps" className="underline" target="_blank" rel="noreferrer">Meta for Developers</a> and create an app</li>
                  <li>Add the Instagram product and generate a long-lived token</li>
                  <li>Copy your IG User ID and token below</li>
                  <li>After saving, add the webhook URL to your Meta App</li>
                </ol>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>IG Username</Label>
                <Input
                  placeholder="yourhandle"
                  value={form.igUsername}
                  onChange={(e) => setForm((f) => ({ ...f, igUsername: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>IG User ID</Label>
                <Input
                  placeholder="17841400000000000"
                  value={form.igUserId}
                  onChange={(e) => setForm((f) => ({ ...f, igUserId: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Long-Lived Access Token</Label>
              <Input
                type="password"
                placeholder="EAA…"
                value={form.accessToken}
                onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Facebook Page ID <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                placeholder="123456789"
                value={form.pageId}
                onChange={(e) => setForm((f) => ({ ...f, pageId: e.target.value }))}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => save.mutate(form)}
                disabled={save.isPending || !form.igUserId || !form.igUsername || !form.accessToken}
              >
                {save.isPending ? "Saving…" : "Save Connection"}
              </Button>
              {showForm && (
                <Button variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              )}
            </div>

            {save.error && (
              <p className="text-sm text-destructive">{save.error.message}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
