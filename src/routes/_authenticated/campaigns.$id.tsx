import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCampaign, listHistoryRecipients, setCampaignFollowupDay, setCampaignFollowupEnabled, type FollowupDay } from "@/lib/history.functions";
import { listTemplates } from "@/lib/templates.functions";
import { getUserPreferences } from "@/lib/profile.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Mail, Users, ArrowLeft, Flame, Paperclip, Search, FileText, Reply, CornerUpLeft, MailCheck, X, BellRing, BellOff } from "lucide-react";
import { StatusBadge } from "./dashboard";
import { relativeTime } from "@/lib/user-agent";
import { useMemo, useState } from "react";
import { defaultHistoryFilters, type HistoryFilters, type HistoryRecipientRow } from "@/lib/history-filters";
import { BulkReplyDialog, type BulkReplyRecipient } from "@/components/bulk-reply-dialog";

export const Route = createFileRoute("/_authenticated/campaigns/$id")({
  head: () => ({
    meta: [
      { title: "Campaign — Smart Email Sender" },
      { name: "description", content: "Recipients, opens, resume views and replies for this campaign." },
      { property: "og:title", content: "Campaign — Smart Email Sender" },
      { property: "og:description", content: "Filter recipients and reply in bulk, one personalized reply per person." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">
      {error instanceof Error ? error.message : String(error)}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Campaign not found.</div>,
  component: CampaignDetailsPage,
});

function CampaignDetailsPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fn = useServerFn(getCampaign);
  const listFn = useServerFn(listHistoryRecipients);
  const templatesFn = useServerFn(listTemplates);
  const prefsFn = useServerFn(getUserPreferences);
  const setFollowupDayFn = useServerFn(setCampaignFollowupDay);
  const setFollowupEnabledFn = useServerFn(setCampaignFollowupEnabled);

  const [filters, setFilters] = useState<HistoryFilters>(defaultHistoryFilters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyMode, setReplyMode] = useState<"free" | "template" | "followup">("free");
  const [replyTargets, setReplyTargets] = useState<BulkReplyRecipient[] | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["campaign", id], queryFn: () => fn({ data: { id } }) });
  const { data: recipientData, isLoading: loadingRecipients, refetch } = useQuery({
    queryKey: ["campaign-recipients", id, filters],
    queryFn: () =>
      listFn({
        data: {
          campaignId: id,
          search: filters.search,
          openCount: filters.openCount,
          replyStatus: filters.replyStatus,
          resume: filters.resume,
          status: filters.status,
          limit: 2000,
        },
      }),
  });
  const { data: templates } = useQuery({ queryKey: ["templates"], queryFn: () => templatesFn({}) });
  const { data: prefs } = useQuery({ queryKey: ["user-prefs"], queryFn: () => prefsFn() });

  const toggleFollowupDay = useMutation({
    mutationFn: (vars: { day: number; done: boolean }) =>
      setFollowupDayFn({ data: { campaignId: id, day: vars.day, done: vars.done } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-history"] });
    },
  });

  const toggleFollowupEnabled = useMutation({
    mutationFn: (enabled: boolean) => setFollowupEnabledFn({ data: { campaignId: id, enabled } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-history"] });
    },
  });

  const rows = (recipientData ?? []) as HistoryRecipientRow[];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  const templateOptions = useMemo(
    () =>
      (templates ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        body: t.body ?? "",
        is_default: !!(t as { is_default?: boolean }).is_default,
      })),
    [templates],
  );

  const set = <K extends keyof HistoryFilters>(k: K, v: HistoryFilters[K]) =>
    setFilters((f) => ({ ...f, [k]: v }));

  const toggle = (rid: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(rid)) next.delete(rid);
      else next.add(rid);
      return next;
    });

  const toReplyRecipient = (r: HistoryRecipientRow): BulkReplyRecipient => ({
    id: r.id,
    email: r.email,
    name: r.name,
    subject: r.subject,
  });

  const openReply = (targets: HistoryRecipientRow[], mode: "free" | "template" | "followup" = "free") => {
    setReplyTargets(targets.map(toReplyRecipient));
    setReplyMode(mode);
    setReplyOpen(true);
  };

  const followUp = (r: HistoryRecipientRow) => openReply([r], "followup");
  const replyOne = (r: HistoryRecipientRow) => openReply([r], "free");

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /><Skeleton className="h-96 w-full" />
      </div>
    );
  }
  const { campaign, recipients, followupDays } = data;
  const opened = recipients.filter((r) => (r.open_count ?? 0) > 0);
  const openRate = recipients.length ? opened.length / recipients.length : 0;
  const attachments = Array.isArray(campaign.attachments) ? (campaign.attachments as Array<{ name: string }>) : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link to="/history"><ArrowLeft className="h-4 w-4 mr-1" /> Back to history</Link>
          </Button>
          <h1 className="page-title truncate">{campaign.subject}</h1>
          <p className="text-[13px] text-muted-foreground truncate">
            Sent {new Date(campaign.sent_at).toLocaleString()} · from {campaign.sender_email}
            {campaign.template_name ? ` · ${campaign.template_name}` : ""}
          </p>
        </div>
        <StatusBadge status={campaign.status} />
      </div>

      <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
        <Stat label="Recipients" value={String(recipients.length)} icon={Users} />
        <Stat label="Opened" value={`${opened.length} / ${recipients.length}`} icon={Eye} />
        <Stat label="Open rate" value={`${Math.round(openRate * 100)}%`} icon={Flame} />
        <Stat label="Total opens" value={String(campaign.open_count ?? 0)} icon={Mail} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={filters.search}
                onChange={(e) => set("search", e.target.value)}
                placeholder="Search name, email, role or company…"
                className="pl-9"
              />
            </div>
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2">
              <Select value={filters.openCount} onValueChange={(v) => set("openCount", v as HistoryFilters["openCount"])}>
                <SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any opens</SelectItem>
                  <SelectItem value="0">0 opens</SelectItem>
                  <SelectItem value="1+">1+ viewed</SelectItem>
                  <SelectItem value="1">1 open</SelectItem>
                  <SelectItem value="2">2 opens</SelectItem>
                  <SelectItem value="3+">3+ opens</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.replyStatus} onValueChange={(v) => set("replyStatus", v as HistoryFilters["replyStatus"])}>
                <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any reply status</SelectItem>
                  <SelectItem value="replied">Replied</SelectItem>
                  <SelectItem value="not_replied">Not replied</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.resume} onValueChange={(v) => set("resume", v as HistoryFilters["resume"])}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any resume view</SelectItem>
                  <SelectItem value="viewed">Resume viewed</SelectItem>
                  <SelectItem value="not_viewed">Resume not viewed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-3">
                <Checkbox
                  checked={allSelected}
                  aria-label="Select all recipients"
                  onCheckedChange={(c) => setSelected(c ? new Set(rows.map((r) => r.id)) : new Set())}
                />
                Recipients ({rows.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingRecipients ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : rows.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">No recipients match your filters.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {rows.map((r) => {
                    const opens = r.open_count;
                    const hot = opens >= 3;
                    return (
                      <li
                        key={r.id}
                        className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 px-3 sm:px-4 py-3 transition-colors ${
                          selected.has(r.id) ? "bg-accent/50" : "hover:bg-accent/30"
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <Checkbox
                            checked={selected.has(r.id)}
                            aria-label={`Select ${r.email}`}
                            onCheckedChange={() => toggle(r.id)}
                            className="mt-1"
                          />
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => navigate({ to: "/recipients/$id", params: { id: r.id } })}
                          >
                            <div className="font-medium truncate">{r.name ?? r.email}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {r.email}{r.role ? ` · ${r.role}` : ""}{r.company ? ` · ${r.company}` : ""}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {opens > 0
                                ? `Opened ${opens} time${opens === 1 ? "" : "s"} · last ${r.last_opened_at ? relativeTime(r.last_opened_at) : "—"}`
                                : "Not opened"}
                            </div>
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap pl-8 sm:pl-0 sm:justify-end sm:shrink-0">
                          {opens > 0 && <Badge variant="secondary" className="gap-1"><Eye className="h-3 w-3" />{opens}</Badge>}
                          {r.pdf_view_count > 0 && (
                            <Badge variant="secondary" className="gap-1"><FileText className="h-3 w-3" />{r.pdf_view_count}</Badge>
                          )}
                          {r.has_reply && <Badge className="gap-1"><Reply className="h-3 w-3" />Replied</Badge>}
                          {r.user_reply_sent && (
                            <Badge variant="outline" className="gap-1">
                              <CornerUpLeft className="h-3 w-3" />You replied{r.user_reply_count > 1 ? ` ×${r.user_reply_count}` : ""}
                            </Badge>
                          )}
                          {r.followup_count > 0 && (
                            <Badge variant="outline" className="gap-1"><MailCheck className="h-3 w-3" />{r.followup_count}</Badge>
                          )}
                          <StatusBadge status={r.status} />
                          <Button size="sm" variant="outline" onClick={() => replyOne(r)}>
                            <Reply className="h-3 w-3 mr-1" />Reply
                          </Button>
                          {opens > 0 && !r.has_reply && (
                            <Button size="sm" variant={hot ? "default" : "outline"} onClick={() => followUp(r)}>
                              {hot && <Flame className="h-3 w-3 mr-1" />}Follow-up
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <FollowupTracker
            enabled={campaign.followup_enabled}
            days={followupDays}
            pending={toggleFollowupDay.isPending}
            enabledPending={toggleFollowupEnabled.isPending}
            onToggle={(day, done) => toggleFollowupDay.mutate({ day, done })}
            onToggleEnabled={(enabled) => toggleFollowupEnabled.mutate(enabled)}
          />

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

      {selectedRows.length > 0 && (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 w-[min(680px,calc(100%-1.5rem))]">
          <div className="flex items-center gap-2 sm:gap-3 rounded-lg border border-border bg-card/95 backdrop-blur px-3 sm:px-4 py-3 shadow-lg">
            <span className="text-sm font-medium shrink-0">{selectedRows.length} selected</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Each gets an individual reply in their own thread
            </span>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              <X className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Clear</span>
            </Button>
            <Button size="sm" onClick={() => openReply(selectedRows, "free")}>
              <Reply className="h-4 w-4 mr-1" /> Reply
            </Button>
          </div>
        </div>
      )}

      <BulkReplyDialog
        open={replyOpen}
        onOpenChange={(o) => {
          setReplyOpen(o);
          if (!o) setReplyTargets(null);
        }}
        recipients={replyTargets ?? selectedRows.map(toReplyRecipient)}
        templates={templateOptions}
        followUpTemplateId={prefs?.followUpTemplateId ?? null}
        initialMode={replyMode}
        onDone={() => refetch()}
      />
    </div>
  );
}

function FollowupTracker({
  enabled,
  days,
  pending,
  enabledPending,
  onToggle,
  onToggleEnabled,
}: {
  enabled: boolean;
  days: FollowupDay[];
  pending: boolean;
  enabledPending: boolean;
  onToggle: (day: number, done: boolean) => void;
  onToggleEnabled: (enabled: boolean) => void;
}) {
  const overdueCount = days.filter((d) => d.overdue).length;
  return (
    <Card className={overdueCount > 0 ? "border-destructive/40" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {enabled ? <BellRing className="h-4 w-4 text-muted-foreground" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
          7-day follow-up tracker
          {overdueCount > 0 && <Badge variant="destructive" className="ml-auto">{overdueCount} due</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <label className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-2 mb-2 cursor-pointer">
          <span className="text-sm">Track follow-ups for this campaign</span>
          <Switch checked={enabled} disabled={enabledPending} onCheckedChange={onToggleEnabled} />
        </label>
        {!enabled ? (
          <p className="text-xs text-muted-foreground">
            Follow-up tracking is off for this campaign — no reminders will show in history.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-1.5">
              Tick a day once you've followed up — the next day lights up red 24h later.
            </p>
            {days.map((d) => {
              const dueLabel = new Date(d.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
              return (
                <label
                  key={d.day}
                  className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors ${
                    d.overdue ? "bg-destructive/10 text-destructive" : d.done ? "text-muted-foreground" : "hover:bg-accent/40"
                  }`}
                >
                  <Checkbox checked={d.done} disabled={pending} onCheckedChange={(c) => onToggle(d.day, !!c)} />
                  <span className="flex-1">Day {d.day} follow-up</span>
                  <span className="text-xs text-muted-foreground">{dueLabel}</span>
                  {d.overdue && <BellRing className="h-3.5 w-3.5 shrink-0" />}
                </label>
              );
            })}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card className="transition-orbit hover:border-primary/25">
      <div className="stat-tile">
        <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="hidden md:block text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
        <div className="text-sm md:text-xl font-semibold tracking-tight leading-none truncate max-w-full px-1">{value}</div>
      </div>
    </Card>
  );
}
