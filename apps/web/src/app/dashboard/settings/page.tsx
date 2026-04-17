"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";

export default function SettingsPage() {
  const { user } = useUser();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account and integrations</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input defaultValue={user?.firstName ?? ""} />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input defaultValue={user?.lastName ?? ""} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input defaultValue={user?.emailAddresses[0]?.emailAddress ?? ""} disabled />
          </div>
          <Button>Save Changes</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Manage your plan and billing details</p>
              <p className="text-sm text-muted-foreground">View your current subscription, upgrade, or download invoices.</p>
            </div>
          </div>
          <Separator className="my-4" />
          <Button asChild>
            <Link href="/dashboard/settings/billing">Go to Billing</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { name: "Postiz", desc: "Social media scheduling", connected: true },
            { name: "Opus Clip", desc: "Video repurposing", connected: false },
            { name: "HeyGen", desc: "AI avatar generation", connected: false },
            { name: "ElevenLabs", desc: "Voice cloning", connected: false },
            { name: "ManyChat", desc: "Comment automation", connected: false },
          ].map((integration) => (
            <div key={integration.name} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">{integration.name}</p>
                <p className="text-xs text-muted-foreground">{integration.desc}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={integration.connected ? "success" : "outline"}>
                  {integration.connected ? "Connected" : "Not Connected"}
                </Badge>
                <Button variant="outline" size="sm">
                  {integration.connected ? "Manage" : "Connect"}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
