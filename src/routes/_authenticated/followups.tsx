import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFollowups, refreshFollowupQueue, decideFollowup, deleteFollowup } from "@/lib/followups.functions";
import { listTemplates } from "@/lib/templates.functions";
import { getUserPreferences } from "@/lib/profile.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ListChecks, RefreshCw, Reply, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BulkReplyDialog, type BulkReplyRecipient } from "@/components/bulk-reply-dialog";

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
  const templatesFn = useServerFn(listTemplates);
  const prefsFn = useServerFn(getUserPreferences);
  const [status, setStatus] = useState<"pending" | "approved" | "sent" | "rejected" | "canceled" | "">("pending");
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<BulkReplyRecipient | null>(null);
  const [activeFollowupId, setActiveFollowupId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["followups", status],
    queryFn: () => listFn({ data: { status: status || undefined } }),
  });
  const templates = useQuery({ queryKey: ["templates"], queryFn: () => templatesFn({}) });
  const prefs = useQuery({ queryKey: ["user-prefs"], queryFn: () => prefsFn() });

  const templateOptions = useMemo(
    () =>
      (templates.data ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        body: t.body ?? "",
        is_default: !!(t as { is_default?: boolean }).is_default,
      })),
    [templates.data],
  );

  const refresh = useMutation({
    mutationFn: () => refreshFn(),
    onSuccess: (r) => { toast.success(`Queue refreshed — ${r.added} added`); qc.invalidateQueries({ queryKey: ["followups"] }); },
  });
  const decide = useMutation({
    mutationFn: (v: { id: string; action: "approve" | "reject" | "sent"; templateId?: string | null }) =>
      decideFn({ data: v }),
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

  const openFollowUpReply = (f: {
    id: string;
    recipient_id: string | null;
    recipient_email: string;
    recipient_name: string;
  }) => {
    if (!f.recipient_id) {
      toast.error("Missing recipient — refresh the queue and try again");
      return;
    }
    setActiveFollowupId(f.id);
    setReplyTarget({
      id: f.recipient_id,
      email: f.recipient_email,
      name: f.recipient_name || null,
      subject: "Follow-up",
    });
    setReplyOpen(true);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title flex items-center gap-2"><ListChecks className="h-4 w-4 shrink-0" /> Follow-up Queue</h1>
          <p className="text-sm text-muted-foreground">
            Follow-ups are sent as individual thread replies. Pick your follow-up template — it fills the reply body.
          </p>
        </div>
        <Button variant="outline" className="w-full sm:w-auto shrink-0" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          <RefreshCw className={`h-4 w-4 mr-1 ${refresh.isPending ? "animate-spin" : ""}`} /> Refresh queue
        </Button>
      </div>

      <div className="flex flex-wrap gap-1 overflow-x-auto">
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
              <CardContent className="py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                <div className="flex items-center gap-2 flex-wrap sm:shrink-0">
                  {(f.status === "pending" || f.status === "approved") && (
                    <>
                      {f.status === "pending" && (
                        <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => decide.mutate({ id: f.id, action: "reject" })}>
                          <X className="h-3.5 w-3.5 mr-1" /> Reject
                        </Button>
                      )}
                      <Button size="sm" className="flex-1 sm:flex-none" onClick={() => openFollowUpReply(f)}>
                        <Reply className="h-3.5 w-3.5 mr-1" /> Reply with follow-up
                      </Button>
                    </>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => del.mutate(f.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <BulkReplyDialog
        open={replyOpen}
        onOpenChange={(o) => {
          setReplyOpen(o);
          if (!o) {
            setReplyTarget(null);
            setActiveFollowupId(null);
          }
        }}
        recipients={replyTarget ? [replyTarget] : []}
        templates={templateOptions}
        followUpTemplateId={prefs.data?.followUpTemplateId ?? null}
        initialMode="followup"
        onDone={() => {
          if (activeFollowupId) {
            decide.mutate({
              id: activeFollowupId,
              action: "sent",
              templateId: prefs.data?.followUpTemplateId ?? null,
            });
          }
          qc.invalidateQueries({ queryKey: ["followups"] });
        }}
      />
    </div>
  );
}
