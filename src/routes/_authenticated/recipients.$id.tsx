import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRecipient } from "@/lib/history.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Eye, Flame, Monitor, Smartphone, Tablet, Globe, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { relativeTime } from "@/lib/user-agent";

export const Route = createFileRoute("/_authenticated/recipients/$id")({
  head: () => ({ meta: [{ title: "Recipient — Smart Email Sender" }] }),
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
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
  const navigate = useNavigate();
  const fn = useServerFn(getRecipient);
  const { data, isLoading } = useQuery({ queryKey: ["recipient", id], queryFn: () => fn({ data: { id } }) });
  const [search, setSearch] = useState("");
  const [device, setDevice] = useState("all");

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

  const startFollowUp = () => {
    const sp = new URLSearchParams({ to: recipient.email, followUp: "1" });
    if (campaign?.gmail_account_id) sp.set("sender", campaign.gmail_account_id);
    if (campaign?.id) sp.set("campaignId", campaign.id);
    if (recipient.name) sp.set("name", recipient.name);
    if (recipient.company) sp.set("company", recipient.company);
    navigate({ to: "/send", search: Object.fromEntries(sp.entries()) as never });
  };

  const hot = total >= 3;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link to="/campaigns/$id" params={{ id: recipient.email_history_id }}><ArrowLeft className="h-4 w-4 mr-1" /> Back to campaign</Link>
        </Button>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{recipient.name ?? recipient.email}</h1>
            <p className="text-sm text-muted-foreground">{recipient.email}{recipient.company ? ` · ${recipient.company}` : ""}</p>
          </div>
          {total > 0 ? (
            <Button onClick={startFollowUp} size="lg" variant={hot ? "default" : "outline"}>
              {hot && <Flame className="h-4 w-4 mr-1" />}
              <Send className="h-4 w-4 mr-1" />
              {hot ? "Follow-up recommended" : "Follow-up"}
            </Button>
          ) : (
            <Badge variant="secondary">Not opened</Badge>
          )}
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total opens" value={String(total)} />
        <Stat label="First open" value={first ? new Date(first).toLocaleString() : "—"} />
        <Stat label="Last open" value={last ? new Date(last).toLocaleString() : "—"} />
        <Stat label="Avg between opens" value={avgMs != null ? formatDuration(avgMs) : "—"} />
        <Stat label="Most used device" value={mostDevice} />
        <Stat label="Most used browser" value={mostBrowser} />
        <Stat label="Most active day" value={mostDay} />
        <Stat label="Campaign" value={campaign?.subject ?? "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Complete open history ({total})</CardTitle>
            <div className="flex gap-2">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-8 w-40" />
              <Select value={device} onValueChange={setDevice}>
                <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold truncate">{value}</div>
    </CardContent></Card>
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

// Suppress unused import lint for icon list; used within component.
void Eye;