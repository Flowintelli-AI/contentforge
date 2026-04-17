"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Lightbulb,
  FileText,
  Calendar,
  Video,
  Zap,
  Settings,
  Shield,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/ideas", label: "Ideas", icon: Lightbulb },
  { href: "/dashboard/scripts", label: "Scripts", icon: FileText },
  { href: "/dashboard/calendar", label: "Calendar", icon: Calendar },
  { href: "/dashboard/videos", label: "Videos", icon: Video },
  { href: "/dashboard/automations", label: "Automations", icon: Zap },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card px-3 py-4">
      {/* Logo */}
      <div className="mb-8 flex items-center gap-2 px-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <span className="text-sm font-bold text-primary-foreground">CF</span>
        </div>
        <span className="text-lg font-semibold">ContentForge</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Admin link (shown if admin) */}
      <div className="mt-4 border-t pt-4 space-y-1">
        <Link
          href="/admin"
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          )}
        >
          <Shield className="h-4 w-4" />
          Admin
        </Link>
        <div className="flex items-center gap-3 rounded-md px-3 py-2">
          <UserButton afterSignOutUrl="/" />
          <span className="text-sm text-muted-foreground">Account</span>
        </div>
      </div>
    </aside>
  );
}
