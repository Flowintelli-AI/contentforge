"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, User } from "lucide-react";

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.admin.listUsers.useQuery(
    { search: search || undefined, page, limit: 25 }
  );

  const totalPages = data ? Math.ceil(data.total / 25) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Users</h1>
        <p className="text-muted-foreground mt-1">
          {data ? `${data.total} total users` : "Loading…"}
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Users</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
          ) : !data?.users.length ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No users found.</p>
          ) : (
            <div className="space-y-1">
              {/* Header */}
              <div className="grid grid-cols-[1fr_1.5fr_1fr_auto] gap-4 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b">
                <span>Name</span>
                <span>Email</span>
                <span>Niche</span>
                <span>Joined</span>
              </div>
              {data.users.map((user) => (
                <div
                  key={user.id}
                  className="grid grid-cols-[1fr_1.5fr_1fr_auto] gap-4 items-center px-3 py-3 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <span className="text-sm font-medium truncate">{user.name}</span>
                  </div>
                  <span className="text-sm text-muted-foreground truncate">{user.email}</span>
                  <span>
                    {user.creatorProfile?.niches?.[0]?.niche?.name ? (
                      <Badge variant="secondary" className="text-xs">{user.creatorProfile.niches[0].niche.name}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-muted transition-colors"
          >
            Previous
          </button>
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-muted transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
