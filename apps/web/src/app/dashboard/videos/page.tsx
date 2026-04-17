"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Video, Scissors, ExternalLink } from "lucide-react";

export default function VideosPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Video Library</h1>
          <p className="text-muted-foreground mt-1">Upload raw footage and create clips</p>
        </div>
        <Button>
          <Upload className="mr-2 h-4 w-4" />
          Upload Video
        </Button>
      </div>

      {/* Upload zone */}
      <Card className="border-dashed border-2">
        <CardContent className="py-16 flex flex-col items-center justify-center text-center">
          <div className="rounded-full bg-primary/10 p-4 mb-4">
            <Video className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Upload your raw footage</h3>
          <p className="text-muted-foreground text-sm max-w-md mb-4">
            Upload long-form videos and we'll automatically create short clips optimized for
            TikTok, Instagram Reels, and YouTube Shorts via Opus Clip.
          </p>
          <Button variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            Choose File
          </Button>
        </CardContent>
      </Card>

      {/* Integration status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { name: "Opus Clip", desc: "AI video repurposing", status: "configured", icon: Scissors },
          { name: "HeyGen", desc: "AI avatar generation", status: "optional", icon: Video },
          { name: "ElevenLabs", desc: "AI voice cloning", status: "optional", icon: Video },
        ].map((integration) => (
          <Card key={integration.name}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{integration.name}</CardTitle>
                <Badge variant={integration.status === "configured" ? "success" : "outline"}>
                  {integration.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">{integration.desc}</p>
              <Button variant="outline" size="sm" className="w-full">
                <ExternalLink className="mr-2 h-3 w-3" />
                Configure
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
