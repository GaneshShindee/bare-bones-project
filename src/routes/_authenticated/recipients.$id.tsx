import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRecipient, getRecipientThread, type ThreadMessage } from "@/lib/history.functions";
import { listTemplates } from "@/lib/templates.functions";
import { getUserPreferences } from "@/lib/profile.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Eye, Flame, Monitor, Smartphone, Tablet, Globe, Reply } from "lucide-react";
import { useMemo, useState } from "react";
import { relativeTime } from "@/lib/user-agent";
import { BulkReplyDialog } from "@/components/bulk-reply-dialog";

export const Route = createFileRoute("/_authenticated/recipients/$id")({
  head: () => ({ meta: [{ title: "Recipient — Smart Email Sender" }] }),
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">
      {error instanceof Error ? error.message : String(error)}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Recipient not found.</div>,
  component: RecipientDetailsPage,
});

type OpenRow = {
  id: string;
  opened_at: string;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  ip: string | null;
};

function RecipientDetailsPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const fn = useServerFn(getRecipient);
  const threadFn = useServerFn(getRecipientThread);
  const templatesFn = useServerFn(listTemplates);
  const prefsFn = useServerFn(getUserPreferences);
  const { data, isLoading } = useQuery({ queryKey: ["recipient", id], queryFn: () => fn({ data: { id } }) });
  const { data: thread, isLoading: loadingThread } = useQuery({
    queryKey: ["recipient-thread", id],
    queryFn: () => threadFn({ data: { id } }),
  });
  const { data: templates } = useQuery({ queryKey: ["templates"], queryFn: () => templatesFn({}) });
  const { data: prefs } = useQuery({ queryKey: ["user-prefs"], queryFn: () => prefsFn() });
  const [search, setSearch] = useState("");
  const [device, setDevice] = useState("all");
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyMode, setReplyMode] = useState<"free" | "template" | "followup">("followup");

  const openReply = (mode: "free" | "template" | "followup" = "free") => {
    setReplyMode(mode);
    setReplyOpen(true);
  };

  const filtered = useMemo(() => {
    const opens = (data?.opens ?? []) as OpenRow[];
    return opens.filter((o) => {
      if (device !== "all" && (o.device_type ?? "Unknown") !== device) return false;
      if (search) {
        const hay = `${o.browser ?? ""} ${o.os ?? ""} ${o.country ?? ""} ${o.city ?? ""} ${o.region ?? ""} ${o.ip ?? ""}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [data, device, search]);

  if (isLoading || !data) {
    return <div className="mx-auto max-w-5xl space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }
  const { recipient, campaign, opens } = data;
  const opensTyped = opens as OpenRow[];

  // Stats.
  const total = opensTyped.length;
  const first = opensTyped[0]?.opened_at ?? recipient.first_opened_at;
  const last = opensTyped[opensTyped.length - 1]?.opened_at ?? recipient.last_opened_at;
  const avgMs = (() => {
    if (opensTyped.length < 2) return null;
    let sum = 0;
    for (let i = 1; i < opensTyped.length; i++) {
      sum += new Date(opensTyped[i].opened_at).getTime() - new Date(opensTyped[i - 1].opened_at).getTime();
    }
    return sum / (opensTyped.length - 1);
  })();
  const mostUsed = (key: keyof OpenRow) => {
    const counts = new Map<string, number>();
    for (const o of opensTyped) {
      const v = (o[key] as string | null) ?? "Unknown";
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  };
  const mostDevice = mostUsed("device_type");
  const mostBrowser = mostUsed("browser");
  const mostDay = (() => {
    const counts = new Map<string, number>();
    for (const o of opensTyped) {
      const d = new Date(o.opened_at).toLocaleDateString(undefined, { weekday: "long" });
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  })();

  const insight = (() => {
    if (total === 0) return null;
    if (last) {
      const minsSince = (Date.now() - new Date(last).getTime()) / 60_000;
      if (minsSince < 60) return { emoji: "⚡", label: "Recently Active", desc: `Opened ${relativeTime(last)}.` };
    }
    if (total >= 5 && first && last) {
      const days = (new Date(last).getTime() - new Date(first).getTime()) / (1000 * 60 * 60 * 24);
      if (days <= 2) return { emoji: "🔥", label: "Very High Interest", desc: `Opened ${total} times in ${Math.max(1, Math.round(days))} day${days > 1 ? "s" : ""}.` };
    }
    if (total >= 3) return { emoji: "👀", label: "Frequently Revisiting", desc: `Viewed ${total} times.` };
    return null;
  })();

  const startFollowUp = () => openReply("followup");

  const hot = total >= 3;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link to="/campaigns/$id" params={{ id: recipient.email_history_id }}><ArrowLeft className="h-4 w-4 mr-1" /> Back to campaign</Link>
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="page-title break-words">{recipient.name ?? recipient.email}</h1>
            <p className="text-sm text-muted-foreground break-all">
              {recipient.email}
              {recipient.role ? ` · ${recipient.role}` : ""}
              {recipient.company ? ` · ${recipient.company}` : ""}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            {total === 0 && <Badge variant="secondary" className="self-start">Not opened</Badge>}
            <Button onClick={() => openReply("free")} size="lg" variant="outline" className="w-full sm:w-auto">
              <Reply className="h-4 w-4 mr-1" />
              Reply
            </Button>
            <Button onClick={startFollowUp} size="lg" variant={hot ? "default" : "outline"} className="w-full sm:w-auto">
              {hot && <Flame className="h-4 w-4 mr-1" />}
              {hot ? "Follow-up recommended" : "Follow-up"}
            </Button>
          </div>
        </div>
      </div>

      {insight && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="py-3 flex items-center gap-3">
            <div className="text-2xl">{insight.emoji}</div>
            <div><div className="font-medium">{insight.label}</div><div className="text-xs text-muted-foreground">{insight.desc}</div></div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Stat label="Total opens" value={String(total)} />
        <Stat label="First open" value={first ? new Date(first).toLocaleString() : "—"} />
        <Stat label="Last open" value={last ? new Date(last).toLocaleString() : "—"} />
        <Stat label="Avg between opens" value={avgMs != null ? formatDuration(avgMs) : "—"} />
        <Stat label="Most used device" value={mostDevice} />
        <Stat label="Most used browser" value={mostBrowser} />
        <Stat label="Most active day" value={mostDay} />
        <Stat label="Campaign" value={campaign?.subject ?? "—"} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between space-y-0">
          <CardTitle className="text-base">
            Conversation{thread ? ` (${thread.messages.length} message${thread.messages.length === 1 ? "" : "s"})` : ""}
          </CardTitle>
          <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => openReply("free")}>
            <Reply className="h-3.5 w-3.5 mr-1" /> Reply in thread
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingThread ? (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : (thread?.messages ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages recorded for this recipient yet.</p>
          ) : (
            (thread?.messages as ThreadMessage[]).map((m) => <ThreadBubble key={`${m.direction}-${m.id}`} m={m} />)
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between space-y-0">
            <CardTitle className="text-base">Complete open history ({total})</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-8 w-full sm:w-40" />
              <Select value={device} onValueChange={setDevice}>
                <SelectTrigger className="h-8 w-full sm:w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All devices</SelectItem>
                  <SelectItem value="Desktop">Desktop</SelectItem>
                  <SelectItem value="Mobile">Mobile</SelectItem>
                  <SelectItem value="Tablet">Tablet</SelectItem>
                  <SelectItem value="Bot">Bot</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                {total === 0 ? "No opens yet. When the recipient views this email, every open will appear here." : "No opens match your filters."}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((o, i) => (
                  <li key={o.id} className="px-4 py-3 flex items-start gap-3">
                    <div className="text-xs font-mono text-muted-foreground w-8 shrink-0">#{i + 1}</div>
                    <DeviceIcon type={o.device_type} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{new Date(o.opened_at).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{relativeTime(o.opened_at)}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>{o.device_type ?? "Unknown"}</span>
                        <span>{o.browser ?? "Unknown browser"}</span>
                        <span>{o.os ?? "Unknown OS"}</span>
                        {(o.city || o.country) && (
                          <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" />{[o.city, o.region, o.country].filter(Boolean).join(", ")}</span>
                        )}
                        {o.ip && <span className="font-mono text-[10px]">{o.ip}</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-3 border-l border-border pl-4">
              <TimelineDot label="Email Sent" when={campaign?.sent_at ?? recipient.first_opened_at} accent />
              {opensTyped.map((o, i) => (
                <TimelineDot key={o.id} label={`Open #${i + 1}`} when={o.opened_at} />
              ))}
              {opensTyped.length === 0 && (
                <li className="text-xs text-muted-foreground">Timeline will populate as opens arrive.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      <BulkReplyDialog
        open={replyOpen}
        onOpenChange={setReplyOpen}
        recipients={[
          {
            id: recipient.id,
            email: recipient.email,
            name: recipient.name,
            subject: campaign?.subject ?? "",
          },
        ]}
        templates={(templates ?? []).map((t: { id: string; name: string; body: string | null; is_default?: boolean }) => ({
          id: t.id,
          name: t.name,
          body: t.body ?? "",
          is_default: !!t.is_default,
        }))}
        followUpTemplateId={prefs?.followUpTemplateId ?? null}
        initialMode={replyMode}
        onDone={() => {
          void queryClient.invalidateQueries({ queryKey: ["recipient-thread", id] });
          void queryClient.invalidateQueries({ queryKey: ["recipient", id] });
        }}
      />
    </div>
  );
}

function ThreadBubble({ m }: { m: ThreadMessage }) {
  const outgoing = m.direction === "outgoing";
  return (
    <div className={`rounded-lg border p-3 ${outgoing ? "border-border bg-card" : "border-primary/40 bg-primary/5 sm:ml-6"}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-medium">
          {outgoing ? (m.is_original ? "You sent the original email" : "You replied") : "They replied"}
        </div>
        <div className="text-xs text-muted-foreground">{new Date(m.at).toLocaleString()}</div>
      </div>
      {m.subject && <div className="text-xs text-muted-foreground mt-0.5 truncate">{m.subject}</div>}
      <div className="mt-2 whitespace-pre-wrap text-xs max-h-48 overflow-auto rounded-md bg-muted/40 p-2">
        {m.body || "(no content)"}
      </div>
      {outgoing && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {!m.tracking_enabled ? (
            <Badge variant="outline">Tracking off</Badge>
          ) : m.open_count > 0 ? (
            <>
              <Badge className="gap-1"><Eye className="h-3 w-3" />Viewed {m.open_count}×</Badge>
              <span className="text-xs text-muted-foreground">
                last {m.last_opened_at ? relativeTime(m.last_opened_at) : "—"}
              </span>
            </>
          ) : (
            <Badge variant="secondary">Not viewed yet</Badge>
          )}
          {m.pdf_view_count > 0 && <Badge variant="secondary">Resume viewed {m.pdf_view_count}×</Badge>}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="transition-orbit hover:border-primary/25">
      <div className="stat-tile">
        <div className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold leading-snug break-words max-w-full px-2">{value}</div>
      </div>
    </Card>
  );
}

function TimelineDot({ label, when, accent }: { label: string; when: string | null | undefined; accent?: boolean }) {
  return (
    <li className="relative text-xs">
      <span className={`absolute -left-[19px] top-1 h-2.5 w-2.5 rounded-full ${accent ? "bg-primary" : "bg-muted-foreground/50"}`} />
      <div className="font-medium">{label}</div>
      <div className="text-muted-foreground">{when ? new Date(when).toLocaleString() : "—"}</div>
    </li>
  );
}

function DeviceIcon({ type }: { type: string | null }) {
  const cls = "h-4 w-4 text-muted-foreground mt-0.5";
  if (type === "Mobile") return <Smartphone className={cls} />;
  if (type === "Tablet") return <Tablet className={cls} />;
  return <Monitor className={cls} />;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}
