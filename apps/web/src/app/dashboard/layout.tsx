"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { UserButton } from "@clerk/nextjs";
import { trpc } from "@/lib/trpc/client";
import {
  LayoutDashboard, Lightbulb, FileText, Video,
  Calendar, Zap, BookOpen, Settings, BarChart3, Users, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard",                icon: LayoutDashboard, label: "Dashboard" },
  { href: "/dashboard/ideas",          icon: Lightbulb,       label: "Ideas" },
  { href: "/dashboard/scripts",        icon: FileText,        label: "Scripts" },
  { href: "/dashboard/videos",         icon: Video,           label: "Videos" },
  { href: "/dashboard/calendar",       icon: Calendar,        label: "Calendar" },
  { href: "/dashboard/automations",    icon: Zap,             label: "Automations" },
  { href: "/dashboard/subscribers",    icon: Users,           label: "Subscribers" },
  { href: "/dashboard/blog",           icon: BookOpen,        label: "Blog" },
  { href: "/dashboard/analytics",      icon: BarChart3,       label: "Analytics" },
  { href: "/dashboard/inspire",        icon: TrendingUp,      label: "Inspire" },
  { href: "/dashboard/settings",       icon: Settings,        label: "Settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data, isSuccess, isError } = trpc.creators.getMyProfile.useQuery();

  useEffect(() => {
    if (isSuccess && !data?.creatorProfile) {
      router.replace("/onboarding");
    }
    // If user not found in DB (e.g. first login, context upsert raced), send to onboarding.
    if (isError) {
      router.replace("/onboarding");
    }
  }, [isSuccess, isError, data, router]);

  // Block rendering until profile check resolves — prevents child pages
  // from firing tRPC queries (which require creatorProfile) before we redirect.
  if (!isSuccess && !isError) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!data?.creatorProfile) return null; // redirect in progress

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r flex flex-col">
        {/* Logo */}
        <div className="px-6 py-5 border-b" suppressHydrationWarning>
          <span className="text-xl font-bold text-indigo-600">ContentForge</span>
          {data?.creatorProfile && (
            <p className="text-xs text-gray-500 mt-1 truncate">{data.creatorProfile.displayName}</p>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t flex items-center gap-3" suppressHydrationWarning>
          <UserButton afterSignOutUrl="/" />
          <div className="text-sm min-w-0" suppressHydrationWarning>
            <p className="font-medium text-gray-900 truncate">{data?.creatorProfile?.displayName ?? "Loading…"}</p>
            <p className="text-xs text-gray-500 truncate">
              {data?.creatorProfile?.postingGoal ?? 0} posts/mo goal
            </p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
