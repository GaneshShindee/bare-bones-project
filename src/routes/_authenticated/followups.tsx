import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFollowups, refreshFollowupQueue, decideFollowup, deleteFollowup } from "@/lib/followups.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, ListChecks, RefreshCw, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/followups")({
  head: () => ({ meta: [{ title: "Follow-up Queue — Smart Email Sender" }] }),
  component: FollowupsPage,
});

function FollowupsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listFollowups);
  const refreshFn = useServerFn(refreshFollowupQueue);
  const decideFn = useServerFn(decideFollowup);
  const delFn = useServerFn(deleteFollowup);
  const [status, setStatus] = useState<"pending" | "approved" | "sent" | "rejected" | "canceled" | "">("pending");

  const q = useQuery({
    queryKey: ["followups", status],
    queryFn: () => listFn({ data: { status: status || undefined } }),
  });

  const refresh = useMutation({
    mutationFn: () => refreshFn(),
    onSuccess: (r) => { toast.success(`Queue refreshed — ${r.added} added`); qc.invalidateQueries({ queryKey: ["followups"] }); },
  });
  const decide = useMutation({
    mutationFn: (v: { id: string; action: "approve" | "reject" }) => decideFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["followups"] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["followups"] }),
  });

  const tabs: { key: typeof status; label: string }[] = [
    { key: "pending", label: "Pending" }, { key: "approved", label: "Scheduled" },
    { key: "sent", label: "Sent" }, { key: "rejected", label: "Rejected" }, { key: "canceled", label: "Canceled" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><ListChecks className="h-6 w-6" /> Follow-up Queue</h1>
          <p className="text-sm text-muted-foreground">Approved follow-ups are scheduled for the next day at 3:00 PM IST.</p>
        </div>
        <Button variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          <RefreshCw className={`h-4 w-4 mr-1 ${refresh.isPending ? "animate-spin" : ""}`} /> Refresh queue
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {tabs.map((t) => (
          <Button key={t.key} size="sm" variant={status === t.key ? "default" : "outline"} onClick={() => setStatus(t.key)}>{t.label}</Button>
        ))}
      </div>

      {q.isLoading ? <Skeleton className="h-40" /> : (q.data ?? []).length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
          Nothing here yet. Click <b>Refresh queue</b> to scan recent opens.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {(q.data ?? []).map((f) => (
            <Card key={f.id}>
              <CardContent className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{f.recipient_name || f.recipient_email}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {f.recipient_email} {f.company ? `· ${f.company}` : ""}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="secondary">{f.condition.replace("_", " ")}</Badge>
                    <Badge variant="outline">Opens: {f.open_count}</Badge>
                    {f.scheduled_at && <Badge variant="outline">Scheduled {new Date(f.scheduled_at).toLocaleString()}</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {f.status === "pending" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: f.id, action: "reject" })}><X className="h-3.5 w-3.5 mr-1" /> Reject</Button>
                      <Button size="sm" onClick={() => decide.mutate({ id: f.id, action: "approve" })}><Check className="h-3.5 w-3.5 mr-1" /> Approve</Button>
                    </>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => del.mutate(f.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}