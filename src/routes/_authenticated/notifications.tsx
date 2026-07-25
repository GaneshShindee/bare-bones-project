import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { notificationsFeed } from "@/lib/replies.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "./dashboard";
import { Bell, Eye, MailOpen, FileText } from "lucide-react";
import { relativeTime } from "@/lib/user-agent";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Smart Email Sender" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const navigate = useNavigate();
  const feedFn = useServerFn(notificationsFeed);
  const { data, isLoading } = useQuery({ queryKey: ["notifications-feed"], queryFn: () => feedFn() });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground">Everything happening across your campaigns.</p>
      </div>
      <Card>
        <CardContent className="py-2">
          {isLoading ? (
            <div className="space-y-2 py-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : data?.length ? (
            <ul className="divide-y divide-border">
              {data.map((n) => (
                <li
                  key={n.id}
                  className={`py-3 px-2 -mx-2 rounded-md flex items-center gap-3 ${n.link ? "cursor-pointer hover:bg-accent/40" : ""}`}
                  onClick={() => n.link && navigate({ to: n.link })}
                >
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground shrink-0">
                    {n.type === "reply" ? <MailOpen className="h-4 w-4" /> : n.type === "pdf" ? <FileText className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{n.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{n.sub}</div>
                  </div>
                  <div className="text-[11px] text-muted-foreground shrink-0">{relativeTime(n.time)}</div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Bell} title="No activity yet" desc="Sent-email opens, PDF views and replies show up here." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}