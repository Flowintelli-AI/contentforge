"use client";

import { useState, useRef, useCallback } from "react";
import { api } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Upload,
  Video,
  Scissors,
  Trash2,
  Play,
  Clock,
  HardDrive,
  ExternalLink,
  Loader2,
  Film,
} from "lucide-react";
import { toast } from "sonner";

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: bigint | number) {
  const n = typeof bytes === "bigint" ? Number(bytes) : bytes;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  UPLOADING:  { label: "Uploading",  variant: "secondary" },
  PROCESSING: { label: "Processing", variant: "secondary" },
  READY:      { label: "Ready",      variant: "default" },
  FAILED:     { label: "Failed",     variant: "destructive" },
  ARCHIVED:   { label: "Archived",   variant: "outline" },
};

export default function VideosPage() {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [titleInput, setTitleInput] = useState("");
  const [showTitleDialog, setShowTitleDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  // sr-only input: position:absolute 1px — programmatic .click() always works
  const fileRef = useRef<HTMLInputElement>(null);

  const utils = api.useUtils();
  const { data: videos = [] } = api.videos.list.useQuery();

  const createMutation = api.videos.create.useMutation({
    onSuccess: () => {
      utils.videos.list.invalidate();
      toast.success("Video saved to your library");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = api.videos.delete.useMutation({
    onSuccess: () => {
      utils.videos.list.invalidate();
      setDeleteId(null);
      toast.success("Video deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFileSelect = (file: File) => {
    setPendingFile(file);
    const name = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
    setTitleInput(name.charAt(0).toUpperCase() + name.slice(1));
    setShowTitleDialog(true);
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) {
      handleFileSelect(file);
    } else {
      toast.error("Please drop a video file");
    }
  }, []);

  const triggerFilePicker = () => fileRef.current?.click();

  const handleUpload = async () => {
    if (!pendingFile || !titleInput.trim()) return;
    setShowTitleDialog(false);
    setUploading(true);
    setUploadProgress(0);

    try {
      const pathname = `videos/${Date.now()}-${pendingFile.name}`;

      // Step 1: get a client token from our server route (same protocol as @vercel/blob/client uses)
      const tokenRes = await fetch("/api/upload/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "blob.generate-client-token",
          payload: { pathname, clientPayload: null, multipart: false },
        }),
      });
      if (!tokenRes.ok) throw new Error("Failed to get upload token");
      const { clientToken } = await tokenRes.json() as { clientToken: string };

      // Step 2: PUT directly to Vercel Blob CDN with XHR so we get progress events
      const blobUrl = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText) as { url: string };
            resolve(data.url);
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        });
        xhr.addEventListener("error", () => reject(new Error("Upload failed: network error")));
        xhr.open("PUT", `https://vercel.com/api/blob/${pathname}`);
        xhr.setRequestHeader("Authorization", `Bearer ${clientToken}`);
        xhr.setRequestHeader("x-content-type", pendingFile.type);
        xhr.send(pendingFile);
      });

      await createMutation.mutateAsync({
        title: titleInput.trim(),
        storagePath: blobUrl,
        sizeBytes: pendingFile.size,
        mimeType: pendingFile.type,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setPendingFile(null);
      setTitleInput("");
    }
  };

  return (
    <div className="space-y-6">
      {/* sr-only file input — position:absolute 1px, so .click() always works */}
      <input
        ref={fileRef}
        id="video-file-input"
        type="file"
        accept="video/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
          e.target.value = "";
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Video Library</h1>
          <p className="text-muted-foreground mt-1">
            Upload raw footage — AI will create clips for TikTok, Reels &amp; Shorts
          </p>
        </div>
        {/* label wrapping button = valid HTML; triggers file picker natively */}
        <label htmlFor="video-file-input">
          <Button asChild disabled={uploading}>
            <span>
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {uploading ? `Uploading ${uploadProgress}%` : "Upload Video"}
            </span>
          </Button>
        </label>
      </div>

      {/* Drop zone (only when library is empty) */}
      {videos.length === 0 && !uploading && (
        <Card
          className="border-dashed border-2 border-muted-foreground/25 hover:border-primary/50 transition-colors cursor-pointer"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={triggerFilePicker}
        >
          <CardContent className="py-20 flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-primary/10 p-5 mb-4">
              <Video className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Drop your video here</h3>
            <p className="text-muted-foreground text-sm max-w-md mb-4">
              Upload long-form videos (up to 500 MB). ContentForge will automatically
              repurpose them into short clips optimized for each platform.
            </p>
            {/* Stop propagation so card onClick doesn't double-fire */}
            <Button
              variant="outline"
              onClick={(e) => { e.stopPropagation(); triggerFilePicker(); }}
            >
              <Upload className="mr-2 h-4 w-4" /> Choose File
            </Button>
            <p className="text-xs text-muted-foreground mt-3">
              Supports MP4, MOV, AVI, WebM
            </p>
          </CardContent>
        </Card>
      )}

      {/* Upload progress bar (when library already has videos) */}
      {uploading && (
        <Card className="border-primary/50">
          <CardContent className="py-4 flex items-center gap-4">
            <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">{pendingFile?.name ?? "Uploading…"}</p>
              <div className="w-full bg-muted rounded-full h-1.5 mt-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
            <span className="text-sm text-muted-foreground shrink-0">{uploadProgress}%</span>
          </CardContent>
        </Card>
      )}

      {/* Video library grid */}
      {videos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {videos.map((video) => {
            const statusInfo = STATUS_MAP[video.status] ?? STATUS_MAP.READY;
            return (
              <Card key={video.id} className="overflow-hidden group">
                <div
                  className="relative aspect-video bg-black cursor-pointer"
                  onClick={() => setPlayUrl(video.storagePath)}
                >
                  <video
                    src={video.storagePath}
                    className="w-full h-full object-cover opacity-80"
                    preload="metadata"
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                    <div className="rounded-full bg-white/20 backdrop-blur-sm p-3">
                      <Play className="h-6 w-6 text-white fill-white" />
                    </div>
                  </div>
                  <Badge
                    variant={statusInfo.variant}
                    className="absolute top-2 right-2 text-xs"
                  >
                    {statusInfo.label}
                  </Badge>
                </div>

                <CardContent className="pt-3 pb-3 space-y-2">
                  <p className="font-medium text-sm truncate">{video.title}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {video.duration && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(video.duration)}
                      </span>
                    )}
                    {video.sizeBytes && (
                      <span className="flex items-center gap-1">
                        <HardDrive className="h-3 w-3" />
                        {formatBytes(video.sizeBytes)}
                      </span>
                    )}
                    {video.clips.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Scissors className="h-3 w-3" />
                        {video.clips.length} clip{video.clips.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1" asChild>
                      <a href="https://www.opus.pro/" target="_blank" rel="noopener noreferrer">
                        <Scissors className="h-3.5 w-3.5 mr-1" /> Create Clips
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(video.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Add more */}
          <Card
            className="border-dashed border-2 border-muted-foreground/20 hover:border-primary/40 transition-colors cursor-pointer flex flex-col items-center justify-center min-h-[200px]"
            onClick={triggerFilePicker}
          >
            <CardContent className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <Upload className="h-8 w-8" />
              <span className="text-sm">Upload another video</span>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Integrations */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            name: "Opus Clip",
            desc: "AI-powered video repurposing into short clips",
            status: "Connect",
            href: "https://www.opus.pro/",
            icon: Scissors,
            color: "bg-violet-50 border-violet-200",
          },
          {
            name: "HeyGen",
            desc: "AI avatar video generation",
            status: "Coming Soon",
            href: null,
            icon: Film,
            color: "bg-gray-50",
          },
          {
            name: "ElevenLabs",
            desc: "AI voice cloning for narration",
            status: "Coming Soon",
            href: null,
            icon: Video,
            color: "bg-gray-50",
          },
        ].map((integration) => (
          <Card key={integration.name} className={integration.color}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">{integration.name}</CardTitle>
                <Badge variant={integration.href ? "default" : "outline"} className="text-xs">
                  {integration.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">{integration.desc}</p>
              {integration.href ? (
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <a href={integration.href} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Open {integration.name}
                  </a>
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="w-full" disabled>
                  Coming Soon
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Title dialog */}
      <Dialog open={showTitleDialog} onOpenChange={setShowTitleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name your video</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="vid-title">Title</Label>
              <Input
                id="vid-title"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="My raw footage..."
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleUpload()}
              />
            </div>
            {pendingFile && (
              <p className="text-xs text-muted-foreground">
                {pendingFile.name} · {formatBytes(pendingFile.size)}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowTitleDialog(false); setPendingFile(null); }}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={!titleInput.trim()}>
              <Upload className="mr-2 h-4 w-4" /> Start Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete video?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the video and all its clips. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Video player modal */}
      <Dialog open={!!playUrl} onOpenChange={(o) => !o && setPlayUrl(null)}>
        <DialogContent className="max-w-4xl p-2">
          {playUrl && (
            <video
              src={playUrl}
              controls
              autoPlay
              className="w-full rounded-lg"
              style={{ maxHeight: "70vh" }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
