import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCampaign } from "@/lib/history.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Mail, Users, ArrowLeft, Flame, Paperclip } from "lucide-react";
import { StatusBadge } from "./dashboard";
import { relativeTime } from "@/lib/user-agent";

export const Route = createFileRoute("/_authenticated/campaigns/$id")({
  head: () => ({ meta: [{ title: "Campaign — Smart Email Sender" }] }),
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Campaign not found.</div>,
  component: CampaignDetailsPage,
});

function CampaignDetailsPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fn = useServerFn(getCampaign);
  const { data, isLoading } = useQuery({ queryKey: ["campaign", id], queryFn: () => fn({ data: { id } }) });

  if (isLoading || !data) {
    return <div className="mx-auto max-w-6xl space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }
  const { campaign, recipients } = data;
  const opened = recipients.filter((r) => (r.open_count ?? 0) > 0);
  const openRate = recipients.length ? opened.length / recipients.length : 0;
  const attachments = Array.isArray(campaign.attachments) ? (campaign.attachments as Array<{ name: string }>) : [];

  const followUp = (r: (typeof recipients)[number]) => {
    const sp = new URLSearchParams({
      to: r.email,
      followUp: "1",
      campaignId: campaign.id,
    });
    if (campaign.gmail_account_id) sp.set("sender", campaign.gmail_account_id);
    if (r.name) sp.set("name", r.name);
    if (r.company) sp.set("company", r.company);
    navigate({ to: "/send", search: Object.fromEntries(sp.entries()) as never });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link to="/history"><ArrowLeft className="h-4 w-4 mr-1" /> Back to history</Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight truncate">{campaign.subject}</h1>
          <p className="text-sm text-muted-foreground truncate">
            Sent {new Date(campaign.sent_at).toLocaleString()} · from {campaign.sender_email}
            {campaign.template_name ? ` · ${campaign.template_name}` : ""}
          </p>
        </div>
        <StatusBadge status={campaign.status} />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Recipients" value={String(recipients.length)} icon={Users} />
        <Stat label="Opened" value={`${opened.length} / ${recipients.length}`} icon={Eye} />
        <Stat label="Open rate" value={`${Math.round(openRate * 100)}%`} icon={Flame} />
        <Stat label="Total opens" value={String(campaign.open_count ?? 0)} icon={Mail} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Recipients ({recipients.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {recipients.map((r) => {
                const opens = r.open_count ?? 0;
                const hot = opens >= 3;
                return (
                  <li key={r.id} className="flex items-center justify-between px-4 py-3 gap-3 hover:bg-accent/30">
                    <Link to="/recipients/$id" params={{ id: r.id }} className="min-w-0 flex-1">
                      <div className="font-medium truncate">{r.name ?? r.email}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.email}
                        {r.company ? ` · ${r.company}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {opens > 0 ? (
                          <>Opened {opens} time{opens === 1 ? "" : "s"} · last {r.last_opened_at ? relativeTime(r.last_opened_at) : "—"}</>
                        ) : (
                          <span>Not opened</span>
                        )}
                      </div>
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      {opens > 0 && <Badge variant="secondary" className="gap-1"><Eye className="h-3 w-3" />{opens}</Badge>}
                      <Badge variant={r.status === "sent" || r.status === "opened" ? "outline" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge>
                      {opens > 0 && (
                        <Button size="sm" variant={hot ? "default" : "outline"} onClick={() => followUp(r)}>
                          {hot && <Flame className="h-3 w-3 mr-1" />}
                          {hot ? "Follow-up recommended" : "Follow-up"}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
              {recipients.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground">No recipients recorded.</li>
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Email preview</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-3">
            <div><span className="text-muted-foreground">Subject:</span> {campaign.subject}</div>
            {attachments.length > 0 && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Paperclip className="h-3 w-3" />{attachments.map((a) => a.name).join(", ")}
              </div>
            )}
            <div className="rounded-md border border-border p-3 whitespace-pre-wrap text-xs max-h-96 overflow-auto">{campaign.body}</div>
            {campaign.error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">{campaign.error}</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card><CardContent className="py-4 flex items-center gap-3">
      <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center"><Icon className="h-4 w-4" /></div>
      <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-semibold">{value}</div></div>
    </CardContent></Card>
  );
}