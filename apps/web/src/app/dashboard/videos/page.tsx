"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [clipsDialogVideoId, setClipsDialogVideoId] = useState<string | null>(null);
  // sr-only input: position:absolute 1px — programmatic .click() always works
  const fileRef = useRef<HTMLInputElement>(null);

  const utils = api.useUtils();

  // Auto-poll every 8 seconds while any video or clip is still rendering
  const { data: videos = [], refetch } = api.videos.list.useQuery(undefined, {
    refetchInterval: pollEnabled ? 8000 : false,
  });

  // Enable polling whenever processing clips exist
  useEffect(() => {
    const hasProcessing = videos.some(
      (v) => v.status === "PROCESSING" || v.clips.some((c) => c.status === "PROCESSING")
    );
    setPollEnabled(hasProcessing);
  }, [videos]);

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

  const generateClips = async (videoId: string) => {
    setProcessingId(videoId);
    try {
      const res = await fetch(`/api/videos/${videoId}/process`, { method: "POST" });
      const data = (await res.json()) as { error?: string; clipsQueued?: number };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to process video");
      } else {
        toast.success(
          `${data.clipsQueued ?? 10} clips are rendering — check back in a few minutes!`
        );
        void refetch();
      }
    } catch {
      toast.error("Network error while processing video");
    } finally {
      setProcessingId(null);
    }
  };

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
      // Step 1: get presigned URL from our server
      const tokenRes = await fetch("/api/upload/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: pendingFile.name,
          contentType: pendingFile.type,
          sizeBytes: pendingFile.size,
        }),
      });
      if (!tokenRes.ok) throw new Error("Failed to get upload URL");
      const { presignedUrl, publicUrl } = await tokenRes.json() as {
        presignedUrl: string;
        publicUrl: string;
      };

      // Step 2: upload directly to R2 with progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        });
        xhr.addEventListener("error", () => reject(new Error("Upload failed: network error")));
        xhr.open("PUT", presignedUrl);
        xhr.setRequestHeader("Content-Type", pendingFile.type);
        xhr.send(pendingFile);
      });

      await createMutation.mutateAsync({
        title: titleInput.trim(),
        storagePath: publicUrl,
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
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => generateClips(video.id)}
                      disabled={video.status === "PROCESSING" || processingId === video.id}
                    >
                      {video.status === "PROCESSING" || processingId === video.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          Analyzing…
                        </>
                      ) : (
                        <>
                          <Scissors className="h-3.5 w-3.5 mr-1" />
                          Generate Clips
                        </>
                      )}
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

                  {/* Clips list */}
                  {video.clips.length > 0 && (
                    <div className="pt-2 border-t space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        {video.clips.length} clip{video.clips.length !== 1 ? "s" : ""}
                      </p>
                      {video.clips.slice(0, 4).map((clip) => (
                        <div key={clip.id} className="flex items-center gap-2 text-xs">
                          <span className="truncate flex-1">{clip.title}</span>
                          {clip.status === "READY" && clip.storagePath ? (
                            <a
                              href={clip.storagePath}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline shrink-0 flex items-center gap-0.5"
                            >
                              <ExternalLink className="h-3 w-3" /> View
                            </a>
                          ) : (
                            <Badge
                              variant={clip.status === "FAILED" ? "destructive" : "secondary"}
                              className="text-[10px] px-1.5 py-0 shrink-0"
                            >
                              {clip.status === "PROCESSING" ? "Rendering…" : clip.status}
                            </Badge>
                          )}
                        </div>
                      ))}
                      {video.clips.length > 4 && (
                        <button
                          className="text-xs text-primary hover:underline text-left"
                          onClick={() => setClipsDialogVideoId(video.id)}
                        >
                          +{video.clips.length - 4} more — view all
                        </button>
                      )}
                    </div>
                  )}
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
            name: "AI Clips",
            desc: "Auto-repurpose your videos into 10 vertical Reels/Shorts via Whisper + GPT-4o",
            status: "Built-in",
            href: null,
            icon: Scissors,
            color: "bg-violet-50 border-violet-200",
            badge: "default" as const,
          },
          {
            name: "HeyGen",
            desc: "AI avatar video generation",
            status: "Coming Soon",
            href: null,
            icon: Film,
            color: "bg-gray-50",
            badge: "outline" as const,
          },
          {
            name: "ElevenLabs",
            desc: "AI voice cloning for narration",
            status: "Coming Soon",
            href: null,
            icon: Video,
            color: "bg-gray-50",
            badge: "outline" as const,
          },
        ].map((integration) => (
          <Card key={integration.name} className={integration.color}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">{integration.name}</CardTitle>
                <Badge variant={integration.badge} className="text-xs">
                  {integration.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">{integration.desc}</p>
              <Button variant="outline" size="sm" className="w-full" disabled>
                {integration.status === "Built-in" ? "Active" : "Coming Soon"}
              </Button>
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

      {/* All clips dialog */}
      <Dialog open={!!clipsDialogVideoId} onOpenChange={(o) => !o && setClipsDialogVideoId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {(() => {
                const v = videos.find((v) => v.id === clipsDialogVideoId);
                return v ? `${v.clips.length} clips — ${v.title}` : "Clips";
              })()}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {videos
              .find((v) => v.id === clipsDialogVideoId)
              ?.clips.map((clip, i) => (
                <div key={clip.id} className="flex items-center gap-3 text-sm py-1.5 border-b last:border-0">
                  <span className="text-muted-foreground w-6 shrink-0 text-right">{i + 1}.</span>
                  <span className="truncate flex-1">{clip.title}</span>
                  {clip.status === "READY" && clip.storagePath ? (
                    <a
                      href={clip.storagePath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline shrink-0 flex items-center gap-1 text-xs"
                    >
                      <ExternalLink className="h-3 w-3" /> View
                    </a>
                  ) : (
                    <Badge
                      variant={clip.status === "FAILED" ? "destructive" : "secondary"}
                      className="text-[10px] px-1.5 py-0 shrink-0"
                    >
                      {clip.status === "PROCESSING" ? "Rendering…" : clip.status}
                    </Badge>
                  )}
                </div>
              ))}
          </div>
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
