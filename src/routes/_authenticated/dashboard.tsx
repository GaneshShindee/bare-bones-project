import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { dashboardStats, listCampaigns, type CampaignSummary } from "@/lib/history.functions";
import { getGmailStatus, startGmailConnect } from "@/lib/gmail.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Mail,
  Send,
  AlertTriangle,
  LayoutTemplate,
  CheckCircle2,
  XCircle,
  Eye,
  Search,
  Users,
  FileText,
  Reply,
  Paperclip,
  ChevronRight,
} from "lucide-react";
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
  const listFn = useServerFn(listCampaigns);
  const [connecting, setConnecting] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const stats = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => statsFn() });
  const gmail = useQuery({ queryKey: ["gmail-status"], queryFn: () => gmailFn() });
  const campaigns = useQuery({
    queryKey: ["dashboard-campaigns", search, status],
    queryFn: () => listFn({ data: { search, status, limit: 500 } }),
  });
  const rows = (campaigns.data ?? []) as CampaignSummary[];

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
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of your sending activity.</p>
        </div>
        <Button onClick={() => navigate({ to: "/send" })}>
          <Send className="h-4 w-4" />Quick send
        </Button>
      </div>

      {gmail.data && !gmail.data.connected && (
        <Card className="border-primary/25 bg-primary/[0.06]">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold tracking-tight">Connect your Gmail account</div>
                <div className="text-sm text-muted-foreground">Grant send permission once. We'll handle token refresh from then on.</div>
              </div>
            </div>
            <Button onClick={onConnect} disabled={connecting}>
              {connecting ? "Redirecting…" : "Connect Gmail"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
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
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Campaigns</CardTitle>
              <p className="page-subtitle mt-1">
                {campaigns.isLoading ? "Loading…" : `${rows.length} campaign${rows.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subject, recipient or template…"
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {campaigns.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
          ) : rows.length ? (
            <ul className="divide-y divide-border/70">
              {rows.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 py-3 px-2 -mx-2 rounded-xl cursor-pointer transition-orbit hover:bg-muted/60"
                  onClick={() => navigate({ to: "/campaigns/$id", params: { id: c.id } })}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{c.subject}</div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {new Date(c.sent_at).toLocaleString()}
                      {c.sender_email ? ` · from ${c.sender_email}` : ""}
                      {c.template_name ? ` · ${c.template_name}` : ""}
                    </div>
                    {c.status === "failed" && c.error && (
                      <div className="text-xs text-destructive truncate mt-0.5">{c.error}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    <Badge variant="outline" className="gap-1">
                      <Users className="h-3 w-3" />{c.recipients}
                    </Badge>
                    {c.opened > 0 && (
                      <Badge variant="secondary" className="gap-1">
                        <Eye className="h-3 w-3" />{c.opened}/{c.recipients}
                      </Badge>
                    )}
                    {c.resume_views > 0 && (
                      <Badge variant="secondary" className="gap-1"><FileText className="h-3 w-3" />{c.resume_views}</Badge>
                    )}
                    {c.replied > 0 && (
                      <Badge className="gap-1"><Reply className="h-3 w-3" />{c.replied}</Badge>
                    )}
                    {c.attachment_count > 0 && (
                      <Badge variant="outline" className="gap-1"><Paperclip className="h-3 w-3" />{c.attachment_count}</Badge>
                    )}
                    <StatusBadge status={c.status} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Send}
              title={search || status !== "all" ? "No campaigns match" : "No emails yet"}
              desc={
                search || status !== "all"
                  ? "Try changing the search or status filter."
                  : "Once you send your first email, it will show up here."
              }
              action={
                search || status !== "all" ? undefined : (
                  <Button onClick={() => navigate({ to: "/send" })}>Send an email</Button>
                )
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, loading }: { icon: any; label: string; value: any; sub?: string; loading?: boolean }) {
  return (
    <Card className="transition-orbit hover:border-primary/25 hover:shadow-[var(--shadow-lift)]">
      <div className="stat-tile">
        <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-3.5 w-3.5" strokeWidth={1.85} />
        </div>
        <div className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
        {loading ? <Skeleton className="h-7 w-16" /> : (
          <>
            <div className="text-2xl font-semibold tracking-tight leading-none">{value}</div>
            {sub && <div className="text-xs text-muted-foreground truncate max-w-full px-2">{sub}</div>}
          </>
        )}
      </div>
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
    <div className="text-center py-12 px-4">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" strokeWidth={1.85} />
      </div>
      <div className="mt-3 text-base font-semibold tracking-tight">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">{desc}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
