"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Instagram,
  Film,
  Clock,
  Trash2,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  X,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, addHours, startOfDay } from "date-fns";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const platformColors: Record<string, { bg: string; text: string }> = {
  INSTAGRAM: { bg: "bg-purple-100", text: "text-purple-800" },
  TIKTOK:    { bg: "bg-pink-100",   text: "text-pink-800" },
  YOUTUBE:   { bg: "bg-red-100",    text: "text-red-800" },
  TWITTER:   { bg: "bg-sky-100",    text: "text-sky-800" },
  LINKEDIN:  { bg: "bg-blue-100",   text: "text-blue-800" },
};

type ReadyClip = {
  id: string;
  title: string | null;
  thumbnailUrl: string | null;
  storagePath: string | null;
  postCopy: string | null;
  hashtags: string[];
};

type CalItem = {
  id: string;
  title: string;
  scheduledFor: Date;
  platform: string;
  status: string;
  clip: { id: string; title: string | null; thumbnailUrl: string | null; storagePath: string | null } | null;
  scheduledPost: { status: string; postUrl: string | null; failureReason: string | null } | null;
};

// ─── Draggable Clip Card ───────────────────────────────────────────────────────

function DraggableClip({ clip }: { clip: ReadyClip }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: clip.id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      className={cn(
        "group flex items-center gap-2 p-2 rounded-lg border bg-card cursor-grab active:cursor-grabbing transition-opacity select-none",
        isDragging && "opacity-40"
      )}
    >
      <div {...listeners} className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground">
        <GripVertical className="h-4 w-4" />
      </div>
      {/* Thumbnail */}
      <div className="relative w-9 h-16 rounded overflow-hidden bg-black shrink-0 flex items-center justify-center">
        {clip.thumbnailUrl ? (
          <img src={clip.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : clip.storagePath ? (
          <video src={clip.storagePath} className="w-full h-full object-cover" preload="metadata" />
        ) : (
          <Film className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      {/* Meta */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{clip.title ?? "Untitled clip"}</p>
        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
          {clip.postCopy ? clip.postCopy.slice(0, 40) + "…" : "No caption yet"}
        </p>
        <div className="flex items-center gap-1 mt-1">
          <Instagram className="h-3 w-3 text-purple-500" />
          <span className="text-[10px] text-muted-foreground">Drag to schedule</span>
        </div>
      </div>
    </div>
  );
}

// ─── Ghost card shown while dragging ──────────────────────────────────────────

function DragGhostCard({ clip }: { clip: ReadyClip }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border bg-card shadow-xl w-52 opacity-95 rotate-2 cursor-grabbing">
      <div className="relative w-9 h-16 rounded overflow-hidden bg-black shrink-0">
        {clip.thumbnailUrl ? (
          <img src={clip.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : clip.storagePath ? (
          <video src={clip.storagePath} className="w-full h-full object-cover" preload="metadata" />
        ) : (
          <Film className="h-4 w-4 text-muted-foreground m-auto" />
        )}
      </div>
      <p className="text-xs font-medium truncate">{clip.title ?? "Untitled clip"}</p>
    </div>
  );
}

// ─── Droppable Day Cell ────────────────────────────────────────────────────────

function DroppableDay({
  day, month, year, isToday, items, onItemClick,
}: {
  day: number;
  month: number;
  year: number;
  isToday: boolean;
  items: CalItem[];
  onItemClick: (item: CalItem) => void;
}) {
  const id = `day-${year}-${month}-${day}`;
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "border-b border-r min-h-[110px] p-1 transition-colors",
        isToday && "bg-primary/5",
        isOver && "bg-purple-50 ring-2 ring-inset ring-purple-400"
      )}
    >
      <div className={cn(
        "text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full",
        isToday ? "bg-primary text-primary-foreground" : "text-foreground"
      )}>
        {day}
      </div>

      <div className="space-y-0.5">
        {items.slice(0, 3).map((item) => {
          const colors = platformColors[item.platform] ?? { bg: "bg-gray-100", text: "text-gray-800" };
          const thumb = item.clip?.thumbnailUrl ?? item.clip?.storagePath ?? null;
          return (
            <div
              key={item.id}
              onClick={() => onItemClick(item)}
              className={cn(
                "flex items-center gap-1 rounded px-1 py-0.5 cursor-pointer hover:opacity-80 transition-opacity",
                colors.bg
              )}
              title={item.title}
            >
              {thumb ? (
                <div className="w-4 h-6 rounded-[2px] overflow-hidden bg-black shrink-0">
                  {item.clip?.thumbnailUrl ? (
                    <img src={thumb} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <video src={thumb} className="w-full h-full object-cover" preload="metadata" />
                  )}
                </div>
              ) : (
                <ImageIcon className={cn("h-3 w-3 shrink-0", colors.text)} />
              )}
              <span className={cn("text-[10px] truncate flex-1", colors.text)}>
                {item.title.slice(0, 18)}
              </span>
              {item.status === "FAILED" && (
                <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-red-500" title="Publish failed" />
              )}
            </div>
          );
        })}
        {items.length > 3 && (
          <div className="text-[10px] text-muted-foreground px-1">+{items.length - 3} more</div>
        )}
      </div>
    </div>
  );
}

// ─── Confirm-schedule modal (shown after drop) ─────────────────────────────────

function ConfirmScheduleModal({
  clip,
  date,
  onClose,
  onSuccess,
}: {
  clip: ReadyClip;
  date: Date;
  onClose: () => void;
  onSuccess: () => void;
}) {
  // Default to 12:00pm on the dropped day
  const defaultDateTime = (() => {
    const d = startOfDay(date);
    d.setHours(12, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  })();

  const [dateTime, setDateTime] = useState(defaultDateTime);

  const scheduleMutation = api.videos.scheduleClip.useMutation({
    onSuccess: () => {
      toast.success("Scheduled to Instagram 🎉");
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleConfirm = () => {
    scheduleMutation.mutate({
      clipId: clip.id,
      caption: clip.postCopy ?? "",
      hashtags: clip.hashtags,
      scheduledFor: new Date(dateTime),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Instagram className="h-5 w-5 text-pink-500" />
            Confirm Schedule
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mini clip preview */}
          <div className="flex items-center gap-3 p-2 rounded-lg bg-muted">
            <div className="relative w-8 h-14 rounded overflow-hidden bg-black shrink-0">
              {clip.thumbnailUrl ? (
                <img src={clip.thumbnailUrl} alt="" className="w-full h-full object-cover" />
              ) : clip.storagePath ? (
                <video src={clip.storagePath} className="w-full h-full object-cover" preload="metadata" />
              ) : (
                <Film className="h-4 w-4 text-muted-foreground m-auto" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{clip.title ?? "Untitled"}</p>
              {clip.postCopy && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{clip.postCopy.slice(0, 60)}…</p>
              )}
            </div>
          </div>

          {/* Time picker */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Date &amp; Time
            </Label>
            <Input
              type="datetime-local"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
              className="text-sm"
            />
          </div>

          {clip.hashtags.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {clip.hashtags.slice(0, 5).map((h) => `#${h}`).join(" ")}
              {clip.hashtags.length > 5 ? ` +${clip.hashtags.length - 5} more` : ""}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={scheduleMutation.isPending}
            className="bg-gradient-to-r from-pink-500 to-purple-600 text-white border-0 hover:opacity-90"
          >
            {scheduleMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Scheduling…</>
            ) : (
              "Schedule Post"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Item detail panel (click on scheduled item) ──────────────────────────────

function ItemDetailPanel({
  item,
  onClose,
  onCancelled,
  onRescheduled,
}: {
  item: CalItem;
  onClose: () => void;
  onCancelled: () => void;
  onRescheduled: () => void;
}) {
  const [newDateTime, setNewDateTime] = useState(
    new Date(item.scheduledFor).toISOString().slice(0, 16)
  );

  const cancelMutation = api.calendar.cancel.useMutation({
    onSuccess: () => { toast.success("Post cancelled"); onCancelled(); },
    onError: (e) => toast.error(e.message),
  });

  const rescheduleMutation = api.calendar.reschedule.useMutation({
    onSuccess: () => { toast.success("Post rescheduled"); onRescheduled(); },
    onError: (e) => toast.error(e.message),
  });

  const colors = platformColors[item.platform] ?? { bg: "bg-gray-100", text: "text-gray-800" };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{item.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Thumbnail */}
          {(item.clip?.thumbnailUrl ?? item.clip?.storagePath) && (
            <div className="relative aspect-[9/16] max-h-48 mx-auto overflow-hidden rounded-lg bg-black">
              {item.clip?.thumbnailUrl ? (
                <img src={item.clip.thumbnailUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <video src={item.clip?.storagePath!} className="w-full h-full object-cover" preload="metadata" />
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Badge className={cn(colors.bg, colors.text, "border-0")}>{item.platform}</Badge>
            <Badge
              variant={item.status === "SCHEDULED" ? "default" : item.status === "FAILED" ? "destructive" : "secondary"}
              className="text-xs"
            >
              {item.status}
            </Badge>
            {item.scheduledPost?.postUrl && (
              <a
                href={item.scheduledPost.postUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-purple-600 hover:underline ml-auto"
              >
                View on Instagram →
              </a>
            )}
          </div>

          <div className="text-sm text-muted-foreground">
            Scheduled: {format(new Date(item.scheduledFor), "PPp")}
          </div>

          {/* Failure reason alert */}
          {item.status === "FAILED" && item.scheduledPost?.failureReason && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-medium mb-0.5">Instagram publish failed</p>
                <p className="opacity-80">{item.scheduledPost.failureReason}</p>
              </div>
            </div>
          )}

          {/* Reschedule */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" /> Reschedule to
            </Label>
            <div className="flex gap-2">
              <Input
                type="datetime-local"
                value={newDateTime}
                onChange={(e) => setNewDateTime(e.target.value)}
                className="text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={rescheduleMutation.isPending}
                onClick={() => rescheduleMutation.mutate({ id: item.id, scheduledFor: new Date(newDateTime) })}
              >
                {rescheduleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <Button
            variant="destructive"
            size="sm"
            disabled={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate({ id: item.id })}
          >
            {cancelMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
            Cancel Post
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{ clip: ReadyClip; date: Date } | null>(null);
  const [selectedItem, setSelectedItem] = useState<CalItem | null>(null);

  const utils = api.useUtils();

  const { data: calItems = [] } = api.calendar.list.useQuery({ month, year });
  const { data: readyClips = [] } = api.videos.listReadyClips.useQuery();

  // Build a map from clipId → whether already scheduled this month
  const scheduledClipIds = new Set(
    calItems.filter((i) => i.clipId).map((i) => i.clipId!)
  );

  // Filter clips not yet scheduled
  const unscheduledClips: ReadyClip[] = (readyClips as ReadyClip[]).filter(
    (c) => !scheduledClipIds.has(c.id)
  );

  const dnskit_sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const itemsByDay = calItems.reduce((acc, item) => {
    const d = new Date(item.scheduledFor).getDate();
    if (!acc[d]) acc[d] = [];
    acc[d].push(item as CalItem);
    return acc;
  }, {} as Record<number, CalItem[]>);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1);
  };

  const activeClip = activeDragId ? (readyClips as ReadyClip[]).find((c) => c.id === activeDragId) ?? null : null;

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveDragId(String(e.active.id));
  }, []);

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    if (!overId.startsWith("day-")) return;

    const [, y, m, d] = overId.split("-").map(Number);
    const droppedDate = new Date(y, m - 1, d);
    const clip = (readyClips as ReadyClip[]).find((c) => c.id === String(active.id));
    if (!clip) return;
    setPendingDrop({ clip, date: droppedDate });
  }, [readyClips]);

  const invalidateCalendar = () => {
    utils.calendar.list.invalidate();
    utils.videos.listReadyClips.invalidate();
  };

  return (
    <DndContext sensors={dnskit_sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 h-[calc(100vh-8rem)]">

        {/* ── Sidebar ── */}
        <div className="w-60 shrink-0 flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold">Ready to Post</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Drag clips onto the calendar</p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {unscheduledClips.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Film className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs">No clips ready to schedule</p>
              </div>
            ) : (
              unscheduledClips.map((clip) => (
                <DraggableClip key={clip.id} clip={clip} />
              ))
            )}
          </div>

          {scheduledClipIds.size > 0 && (
            <p className="text-[10px] text-muted-foreground text-center">
              {scheduledClipIds.size} clip{scheduledClipIds.size !== 1 ? "s" : ""} scheduled this month
            </p>
          )}
        </div>

        {/* ── Calendar ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-2xl font-bold">Content Calendar</h1>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium w-32 text-center">
                {MONTHS[month - 1]} {year}
              </span>
              <Button variant="ghost" size="icon" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7">
            {DAYS.map((d) => (
              <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground border-b">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 border-l border-t flex-1 overflow-y-auto">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="border-b border-r bg-muted/20" />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const isToday =
                day === now.getDate() &&
                month === now.getMonth() + 1 &&
                year === now.getFullYear();
              return (
                <DroppableDay
                  key={day}
                  day={day}
                  month={month}
                  year={year}
                  isToday={isToday}
                  items={itemsByDay[day] ?? []}
                  onItemClick={setSelectedItem}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Drag ghost */}
      <DragOverlay dropAnimation={null}>
        {activeClip ? <DragGhostCard clip={activeClip} /> : null}
      </DragOverlay>

      {/* Confirm drop → schedule */}
      {pendingDrop && (
        <ConfirmScheduleModal
          clip={pendingDrop.clip}
          date={pendingDrop.date}
          onClose={() => setPendingDrop(null)}
          onSuccess={() => {
            setPendingDrop(null);
            invalidateCalendar();
          }}
        />
      )}

      {/* Item detail */}
      {selectedItem && (
        <ItemDetailPanel
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onCancelled={() => { setSelectedItem(null); invalidateCalendar(); }}
          onRescheduled={() => { setSelectedItem(null); invalidateCalendar(); }}
        />
      )}
    </DndContext>
  );
}
