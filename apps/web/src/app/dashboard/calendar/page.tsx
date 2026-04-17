"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const platformColors: Record<string, string> = {
  TIKTOK: "bg-pink-100 text-pink-800",
  INSTAGRAM: "bg-purple-100 text-purple-800",
  YOUTUBE: "bg-red-100 text-red-800",
  TWITTER: "bg-sky-100 text-sky-800",
  LINKEDIN: "bg-blue-100 text-blue-800",
};

export default function CalendarPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data: items, isLoading } = trpc.calendar.list.useQuery({ month, year });
  const generateMutation = trpc.calendar.generate.useMutation();
  const utils = trpc.useUtils();

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();

  const itemsByDate = (items ?? []).reduce(
    (acc, item) => {
      const d = new Date(item.scheduledFor).getDate();
      if (!acc[d]) acc[d] = [];
      acc[d].push(item);
      return acc;
    },
    {} as Record<number, typeof items>
  );

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const handleGenerate = async () => {
    await generateMutation.mutateAsync({ month, year });
    utils.calendar.list.invalidate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Content Calendar</h1>
          <p className="text-muted-foreground mt-1">Plan and visualize your monthly content</p>
        </div>
        <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
          <Sparkles className="mr-2 h-4 w-4" />
          {generateMutation.isPending ? "Generating…" : "Auto-Generate Month"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              {MONTHS[month - 1]} {year}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {DAYS.map((d) => (
              <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 border-l border-t">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="border-b border-r min-h-[100px] bg-muted/20" />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const dayItems = itemsByDate[day] ?? [];
              const isToday =
                day === now.getDate() && month === now.getMonth() + 1 && year === now.getFullYear();
              return (
                <div key={day} className={cn("border-b border-r min-h-[100px] p-1", isToday && "bg-primary/5")}>
                  <div className={cn("text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full",
                    isToday ? "bg-primary text-primary-foreground" : "text-foreground")}>
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {dayItems?.slice(0, 3).map((item) => (
                      <div
                        key={item.id}
                        className={cn("text-[10px] px-1 py-0.5 rounded truncate cursor-pointer",
                          platformColors[item.platform] ?? "bg-gray-100 text-gray-800")}
                        title={item.title}
                      >
                        {item.platform.slice(0, 2)} · {item.title.slice(0, 20)}
                      </div>
                    ))}
                    {(dayItems?.length ?? 0) > 3 && (
                      <div className="text-[10px] text-muted-foreground px-1">
                        +{(dayItems?.length ?? 0) - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(platformColors).map(([platform, colors]) => (
          <Badge key={platform} className={colors}>{platform}</Badge>
        ))}
      </div>
    </div>
  );
}
