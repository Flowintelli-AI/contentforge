"use client";

import { useState } from "react";
import { api } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { MessageSquare, Zap, Plus, Trash2, Power, PowerOff, ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";

const PLATFORM_OPTIONS = [
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "YOUTUBE", label: "YouTube" },
  { value: "TWITTER_X", label: "Twitter / X" },
  { value: "LINKEDIN", label: "LinkedIn" },
] as const;

type Platform = (typeof PLATFORM_OPTIONS)[number]["value"];

interface NewAutomationForm {
  name: string;
  platform: Platform;
  triggerKeyword: string;
  postUrl: string;
  dmTemplate: string;
}

const DEFAULT_FORM: NewAutomationForm = {
  name: "",
  platform: "INSTAGRAM",
  triggerKeyword: "",
  postUrl: "",
  dmTemplate: "Hey {{first_name}}! Here's the link you asked for: ",
};

export default function AutomationsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<NewAutomationForm>(DEFAULT_FORM);

  const utils = api.useUtils();

  const { data: automations = [], isLoading } = api.automations.list.useQuery();

  const createMutation = api.automations.create.useMutation({
    onSuccess: () => {
      toast.success("Automation created");
      utils.automations.list.invalidate();
      setShowCreate(false);
      setForm(DEFAULT_FORM);
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleMutation = api.automations.toggle.useMutation({
    onSuccess: (updated) => {
      toast.success(updated.isActive ? "Automation activated" : "Automation paused");
      utils.automations.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = api.automations.delete.useMutation({
    onSuccess: () => {
      toast.success("Automation deleted");
      utils.automations.list.invalidate();
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/manychat`
      : "/api/webhooks/manychat";

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("Webhook URL copied");
  };

  const handleCreate = () => {
    if (!form.name || !form.triggerKeyword || !form.dmTemplate) {
      toast.error("Please fill in all required fields");
      return;
    }
    createMutation.mutate({
      name: form.name,
      platform: form.platform,
      triggerType: "COMMENT_KEYWORD",
      triggerKeyword: form.triggerKeyword.toUpperCase(),
      postUrl: form.postUrl || undefined,
      actions: [{ actionType: "SEND_DM", template: form.dmTemplate, delaySeconds: 0 }],
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Automation Center</h1>
          <p className="text-muted-foreground mt-1">
            Comment-keyword DM automations — powered by ManyChat
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Trigger
        </Button>
      </div>

      {/* Webhook URL card */}
      <Card className="border-indigo-200 bg-indigo-50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-indigo-800">
            <MessageSquare className="h-4 w-4" />
            ManyChat Webhook URL
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-indigo-700 mb-3">
            In your ManyChat flow, add an <strong>External Request</strong> block and POST to this
            URL with <code>keyword</code>, <code>platform</code>, and{" "}
            <code>subscriber_id</code> in the body.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border border-indigo-200 rounded px-3 py-1.5 text-sm text-indigo-900 truncate">
              {webhookUrl}
            </code>
            <Button variant="outline" size="sm" onClick={copyWebhookUrl}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Copy
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="https://manychat.com" target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> ManyChat
              </a>
            </Button>
          </div>
          <p className="text-xs text-indigo-600 mt-2">
            Tip: use <code>{"{{first_name}}"}</code> in your DM template to personalise the message.
          </p>
        </CardContent>
      </Card>

      {/* Automations list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Comment Triggers
            {automations.length > 0 && (
              <Badge variant="secondary" className="ml-1">{automations.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : automations.length === 0 ? (
            <div className="py-10 text-center">
              <Zap className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-sm text-muted-foreground mb-4">
                No automations yet. Create your first comment-keyword trigger.
              </p>
              <Button variant="outline" onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" /> New Trigger
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {automations.map((a) => {
                const firstAction = a.actions[0];
                return (
                  <div
                    key={a.id}
                    className="flex items-start justify-between rounded-lg border p-4 gap-4"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="rounded-md bg-primary/10 px-3 py-1 text-sm font-mono font-bold text-primary shrink-0 mt-0.5">
                        {a.triggerKeyword ?? "—"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{a.platform}</p>
                        {firstAction && (
                          <p className="text-xs text-gray-500 mt-1 truncate max-w-sm">
                            DM: {firstAction.template}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={a.isActive ? "success" : "outline"}>
                        {a.isActive ? "active" : "paused"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleMutation.mutate({ id: a.id })}
                        disabled={toggleMutation.isPending}
                        title={a.isActive ? "Pause" : "Activate"}
                      >
                        {a.isActive ? (
                          <PowerOff className="h-4 w-4 text-yellow-600" />
                        ) : (
                          <Power className="h-4 w-4 text-green-600" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteId(a.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create automation dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Comment Trigger</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Automation Name *</Label>
              <Input
                placeholder="e.g. Send free guide DM"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Platform *</Label>
                <Select
                  value={form.platform}
                  onValueChange={(v) => setForm((f) => ({ ...f, platform: v as Platform }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Trigger Keyword *</Label>
                <Input
                  placeholder="e.g. GUIDE"
                  value={form.triggerKeyword}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, triggerKeyword: e.target.value.toUpperCase() }))
                  }
                  className="font-mono uppercase"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Post URL <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                placeholder="https://instagram.com/p/..."
                value={form.postUrl}
                onChange={(e) => setForm((f) => ({ ...f, postUrl: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>DM Message Template *</Label>
              <Textarea
                placeholder="Hey {{first_name}}! Here's your link: https://..."
                value={form.dmTemplate}
                onChange={(e) => setForm((f) => ({ ...f, dmTemplate: e.target.value }))}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Use <code>{"{{first_name}}"}</code> to personalise.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create Automation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(o: boolean) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete automation?</DialogTitle>
            <DialogDescription>
              This cannot be undone. The automation and all its actions will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
