import Link from "next/link";
import { Shield, LayoutDashboard, FileText, Users } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <aside className="w-56 border-r bg-card px-3 py-4 flex flex-col">
        <div className="mb-6 px-3 flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-semibold">Admin</span>
        </div>
        <nav className="space-y-1 flex-1">
          {[
            { href: "/admin", label: "Overview", icon: LayoutDashboard },
            { href: "/admin/review", label: "Review Queue", icon: FileText },
            { href: "/admin/users", label: "Users", icon: Users },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/dashboard" className="text-xs text-muted-foreground px-3 hover:text-foreground">
          ← Back to App
        </Link>
      </aside>
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
