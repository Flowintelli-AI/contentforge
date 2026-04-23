"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { api } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
  Instagram,
  Calendar,
  Image as ImageIcon,
  Hash,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

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

function formatScheduledDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  UPLOADING:     { label: "Uploading",       variant: "secondary" },
  PROCESSING:    { label: "Processing",      variant: "secondary" },
  GENERATING_AI: { label: "✨ AI Generating…", variant: "secondary" },
  READY:         { label: "Ready",           variant: "default" },
  FAILED:        { label: "Failed",          variant: "destructive" },
  ARCHIVED:      { label: "Archived",        variant: "outline" },
};

type ReadyClip = {
  id: string;
  title: string | null;
  storagePath: string | null;
  thumbnailUrl: string | null;
  postCopy: string | null;
  hashtags: string[];
  calendarItems: Array<{
    scheduledFor: Date;
    status: string;
    scheduledPost: { status: string; postizPostId: string | null } | null;
  }>;
  video: { title: string };
};

function ScheduleModal({
  clip,
  onClose,
  onSuccess,
}: {
  clip: ReadyClip;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [caption, setCaption] = useState(clip.postCopy ?? "");
  const [hashtags, setHashtags] = useState(clip.hashtags.join(" "));
  const [scheduledDate, setScheduledDate] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d.toISOString().slice(0, 16); // datetime-local format
  });

  const scheduleMutation = api.videos.scheduleClip.useMutation({
    onSuccess: () => {
      toast.success("Clip scheduled to Instagram 🎉");
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    const tagList = hashtags
      .split(/[\s,]+/)
      .map((t) => t.replace(/^#/, "").trim())
      .filter(Boolean);

    scheduleMutation.mutate({
      clipId: clip.id,
      caption,
      hashtags: tagList,
      scheduledFor: new Date(scheduledDate),
    });
  };

  const captionLen = caption.length;
  const hashtagStr = hashtags
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean)
    .map((t) => `#${t}`)
    .join(" ");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Instagram className="h-5 w-5 text-pink-500" />
            Schedule to Instagram
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Thumbnail preview */}
          <div className="relative aspect-[9/16] max-h-40 w-auto mx-auto overflow-hidden rounded-lg bg-black flex items-center justify-center">
            {clip.thumbnailUrl ? (
              <img src={clip.thumbnailUrl} alt="Thumbnail" className="object-cover w-full h-full" />
            ) : clip.storagePath ? (
              <video src={clip.storagePath} className="object-cover w-full h-full" preload="metadata" />
            ) : (
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <p className="text-sm font-medium text-center truncate">{clip.title ?? "Untitled clip"}</p>

          {/* Caption */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Caption</Label>
              <span className={`text-xs ${captionLen > 2200 ? "text-destructive" : "text-muted-foreground"}`}>
                {captionLen}/2200
              </span>
            </div>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write your caption…"
              rows={4}
              className="resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground">First 125 chars shown in feed preview</p>
          </div>

          {/* Hashtags */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5" /> Hashtags
            </Label>
            <Input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="fitness health motivation"
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">Space or comma separated — # optional</p>
            {hashtagStr && (
              <p className="text-xs text-muted-foreground truncate">{hashtagStr}</p>
            )}
          </div>

          {/* Date/time */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Schedule For
            </Label>
            <Input
              type="datetime-local"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">Min 10 min from now · Max 75 days</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={scheduleMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={scheduleMutation.isPending || captionLen > 2200}
            className="bg-gradient-to-r from-pink-500 to-purple-600 text-white border-0 hover:from-pink-600 hover:to-purple-700"
          >
            {scheduleMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Scheduling…</>
            ) : (
              <><Instagram className="h-4 w-4 mr-2" /> Schedule Post</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
  const [scheduleClip, setScheduleClip] = useState<ReadyClip | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const utils = api.useUtils();

  const { data: videos = [], refetch } = api.videos.list.useQuery(undefined, {
    refetchInterval: pollEnabled ? 8000 : false,
  });

  const { data: readyClips = [], refetch: refetchClips } = api.videos.listReadyClips.useQuery();
  const { data: igConn } = api.instagram.getConnection.useQuery();

  useEffect(() => {
    const hasProcessing = videos.some(
      (v) => v.status === "PROCESSING" || v.clips.some((c) => c.status === "PROCESSING" || c.status === "GENERATING_AI")
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
      const { presignedUrl, publicUrl, contentType: normalizedContentType } = await tokenRes.json() as {
        presignedUrl: string;
        publicUrl: string;
        contentType: string;
      };

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
        xhr.setRequestHeader("Content-Type", normalizedContentType);
        xhr.send(pendingFile);
      });

      await createMutation.mutateAsync({
        title: titleInput.trim(),
        storagePath: publicUrl,
        sizeBytes: pendingFile.size,
        mimeType: normalizedContentType,
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

      <Tabs defaultValue="library">
        <TabsList>
          <TabsTrigger value="library">
            <Video className="h-4 w-4 mr-1.5" /> Library
          </TabsTrigger>
          <TabsTrigger value="clips">
            <Scissors className="h-4 w-4 mr-1.5" /> Ready Clips
            {readyClips.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary text-primary-foreground text-[10px] px-1.5 py-0">
                {readyClips.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─── Library Tab ─── */}
        <TabsContent value="library" className="space-y-4 mt-4">
          {/* Drop zone (empty state) */}
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

                      {video.clips.length > 0 && (
                        <div className="pt-2 border-t space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">
                            {video.clips.length} clip{video.clips.length !== 1 ? "s" : ""}
                          </p>
                          {video.clips.slice(0, 4).map((clip) => (
                            <div key={clip.id} className="flex items-center gap-2 text-xs">
                              <span className="truncate flex-1">{clip.title}</span>
                              {(clip as { isAIGenerated?: boolean }).isAIGenerated && (
                                <span className="shrink-0 text-[9px] bg-violet-100 text-violet-700 px-1 py-0 rounded">✨AI</span>
                              )}
                              {clip.status === "READY" && clip.storagePath ? (
                                <button
                                  onClick={() => setPlayUrl(clip.storagePath!)}
                                  className="text-primary hover:underline shrink-0 flex items-center gap-0.5"
                                >
                                  <Play className="h-3 w-3 fill-current" /> Play
                                </button>
                              ) : clip.status === "GENERATING_AI" ? (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                                  <Loader2 className="h-2.5 w-2.5 animate-spin mr-0.5" /> AI…
                                </Badge>
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
        </TabsContent>

        {/* ─── Ready Clips Tab ─── */}
        <TabsContent value="clips" className="mt-4">
          {/* Instagram not connected banner */}
          {!igConn && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-amber-500" />
              <div>
                <p className="font-medium">Instagram not connected</p>
                <p className="text-amber-700 text-xs mt-0.5">
                  Connect your Instagram Business or Creator account to schedule posts.{" "}
                  <Link href="/dashboard/settings" className="underline font-medium">
                    Go to Settings →
                  </Link>
                </p>
              </div>
            </div>
          )}

          {readyClips.length === 0 ? (
            <Card className="border-dashed border-2 border-muted-foreground/20">
              <CardContent className="py-16 flex flex-col items-center justify-center text-center text-muted-foreground">
                <Scissors className="h-10 w-10 mb-4 opacity-30" />
                <p className="font-medium">No ready clips yet</p>
                <p className="text-sm mt-1">Generate clips from your videos — they'll appear here when done.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {readyClips.map((clip) => {
                const scheduled = clip.calendarItems[0];
                const isScheduled = !!scheduled;

                return (
                  <Card key={clip.id} className="overflow-hidden group flex flex-col">
                    {/* Thumbnail */}
                    <div
                      className="relative aspect-[9/16] bg-black cursor-pointer overflow-hidden"
                      onClick={() => clip.storagePath && setPlayUrl(clip.storagePath)}
                    >
                      {clip.thumbnailUrl ? (
                        <img
                          src={clip.thumbnailUrl}
                          alt={clip.title ?? "Clip thumbnail"}
                          className="w-full h-full object-cover opacity-90 group-hover:opacity-75 transition-opacity"
                        />
                      ) : clip.storagePath ? (
                        <video
                          src={clip.storagePath}
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-opacity"
                          preload="metadata"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Film className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="rounded-full bg-white/20 backdrop-blur-sm p-3">
                          <Play className="h-6 w-6 text-white fill-white" />
                        </div>
                      </div>
                      {isScheduled && (
                        <div className="absolute top-2 left-2 bg-green-500 text-white text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Scheduled
                        </div>
                      )}
                    </div>

                    <CardContent className="pt-3 pb-3 flex flex-col gap-2 flex-1">
                      <p className="font-medium text-sm leading-tight line-clamp-2">
                        {clip.title ?? "Untitled clip"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{clip.video.title}</p>

                      {/* Caption preview */}
                      {clip.postCopy && (
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {clip.postCopy}
                        </p>
                      )}

                      {/* Hashtag pills */}
                      {clip.hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {clip.hashtags.slice(0, 4).map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full"
                            >
                              #{tag}
                            </span>
                          ))}
                          {clip.hashtags.length > 4 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{clip.hashtags.length - 4}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="mt-auto pt-1">
                        {isScheduled ? (
                          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-green-500" />
                            {formatScheduledDate(new Date(scheduled.scheduledFor))}
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            className="w-full bg-gradient-to-r from-pink-500 to-purple-600 text-white border-0 hover:from-pink-600 hover:to-purple-700"
                            onClick={() => setScheduleClip(clip as ReadyClip)}
                            disabled={!igConn}
                          >
                            <Instagram className="h-3.5 w-3.5 mr-1.5" />
                            Schedule to Instagram
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Schedule Modal ─── */}
      {scheduleClip && (
        <ScheduleModal
          clip={scheduleClip}
          onClose={() => setScheduleClip(null)}
          onSuccess={() => {
            setScheduleClip(null);
            void refetchClips();
          }}
        />
      )}

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
                  {(clip as { isAIGenerated?: boolean }).isAIGenerated && (
                    <span className="shrink-0 text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">✨AI</span>
                  )}
                  {clip.status === "READY" && clip.storagePath ? (
                    <button
                      onClick={() => { setClipsDialogVideoId(null); setPlayUrl(clip.storagePath!); }}
                      className="text-primary hover:underline shrink-0 flex items-center gap-1 text-xs"
                    >
                      <Play className="h-3 w-3 fill-current" /> Play
                    </button>
                  ) : clip.status === "GENERATING_AI" ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                      <Loader2 className="h-2.5 w-2.5 animate-spin mr-0.5" /> AI…
                    </Badge>
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
