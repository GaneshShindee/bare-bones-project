import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { dashboardStats } from "@/lib/history.functions";
import { getGmailStatus, startGmailConnect } from "@/lib/gmail.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, Send, AlertTriangle, LayoutTemplate, ArrowUpRight, CheckCircle2, XCircle, Eye } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Smart Email Sender" }] }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const statsFn = useServerFn(dashboardStats);
  const gmailFn = useServerFn(getGmailStatus);
  const startConnect = useServerFn(startGmailConnect);
  const [connecting, setConnecting] = useState(false);

  const stats = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => statsFn() });
  const gmail = useQuery({ queryKey: ["gmail-status"], queryFn: () => gmailFn() });

  const onConnect = async () => {
    setConnecting(true);
    try {
      const { url } = await startConnect();
      window.location.href = url;
    } catch (e) {
      toast.error("Couldn't start Gmail connection", { description: (e as Error).message });
      setConnecting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of your sending activity.</p>
        </div>
        <Button onClick={() => navigate({ to: "/send" })}><Send className="h-4 w-4 mr-2" />Quick send</Button>
      </div>

      {gmail.data && !gmail.data.connected && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground"><Mail className="h-5 w-5" /></div>
              <div>
                <div className="font-medium">Connect your Gmail account</div>
                <div className="text-sm text-muted-foreground">Grant send permission once. We'll handle token refresh from then on.</div>
              </div>
            </div>
            <Button onClick={onConnect} disabled={connecting}>{connecting ? "Redirecting…" : "Connect Gmail"}</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-5">
        <StatCard icon={Mail} label="Gmail" value={gmail.data?.connected ? "Connected" : "Not connected"} sub={gmail.data?.email ?? "—"} loading={gmail.isLoading} />
        <StatCard icon={Send} label="Total sent" value={stats.data?.sent ?? 0} loading={stats.isLoading} />
        <StatCard
          icon={Eye}
          label="Opens"
          value={stats.data?.totalOpens ?? 0}
          sub={stats.data ? `${Math.round((stats.data.openRate ?? 0) * 100)}% open rate` : undefined}
          loading={stats.isLoading}
        />
        <StatCard icon={AlertTriangle} label="Failed" value={stats.data?.failed ?? 0} loading={stats.isLoading} />
        <StatCard icon={LayoutTemplate} label="Templates" value={stats.data?.templates ?? 0} loading={stats.isLoading} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent emails</CardTitle>
          <Button asChild variant="ghost" size="sm"><Link to="/history">View all <ArrowUpRight className="h-4 w-4 ml-1" /></Link></Button>
        </CardHeader>
        <CardContent>
          {stats.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : stats.data?.recent.length ? (
            <ul className="divide-y divide-border">
              {stats.data.recent.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between py-3 gap-3 cursor-pointer hover:bg-accent/40 rounded-md px-2 -mx-2"
                  onClick={() => navigate({ to: "/campaigns/$id", params: { id: r.id } })}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{r.subject}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      to {r.recipient_count} recipient{r.recipient_count === 1 ? "" : "s"} · {new Date(r.sent_at).toLocaleString()}
                      {r.template_name ? ` · ${r.template_name}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.open_count > 0 && (
                      <Badge variant="secondary" className="gap-1"><Eye className="h-3 w-3" />{r.open_count}</Badge>
                    )}
                    <StatusBadge status={r.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Send}
              title="No emails yet"
              desc="Once you send your first email, it will show up here."
              action={<Button onClick={() => navigate({ to: "/send" })}>Send an email</Button>}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, loading }: { icon: any; label: string; value: any; sub?: string; loading?: boolean }) {
  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        {loading ? <Skeleton className="h-7 w-24 mt-2" /> : (
          <>
            <div className="text-2xl font-semibold mt-1">{value}</div>
            {sub && <div className="text-xs text-muted-foreground truncate">{sub}</div>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "sent") return <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" />Sent</Badge>;
  if (status === "failed") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Failed</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export function EmptyState({ icon: Icon, title, desc, action }: { icon: any; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-10">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground"><Icon className="h-5 w-5" /></div>
      <div className="mt-3 font-medium">{title}</div>
      <div className="text-sm text-muted-foreground">{desc}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}