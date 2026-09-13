import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listReplies, syncReplies, getReply, updateReplyState, generateReplyDraft, sendReply } from "@/lib/replies.functions";
import { listTemplates } from "@/lib/templates.functions";
import { getUserPreferences } from "@/lib/profile.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "./dashboard";
import { Inbox, RefreshCw, Sparkles, Send, Archive, ArchiveRestore } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { relativeTime } from "@/lib/user-agent";
import { ReplyAssistantModal, type ReplyTone, type ReplyLength } from "@/components/reply-assistant-modal";
import { TemplateCombobox } from "@/components/template-combobox";

export const Route = createFileRoute("/_authenticated/replies")({
  head: () => ({ meta: [{ title: "Reply Center — Smart Email Sender" }] }),
  component: RepliesPage,
});

function RepliesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listReplies);
  const syncFn = useServerFn(syncReplies);
  const getFn = useServerFn(getReply);
  const updFn = useServerFn(updateReplyState);
  const genFn = useServerFn(generateReplyDraft);
  const sendFn = useServerFn(sendReply);
  const templatesFn = useServerFn(listTemplates);
  const prefsFn = useServerFn(getUserPreferences);

  const [filter, setFilter] = useState<"unread" | "read" | "archived" | "all">("unread");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [assistOpen, setAssistOpen] = useState(false);
  const [tplId, setTplId] = useState("");

  const list = useQuery({ queryKey: ["replies", filter], queryFn: () => listFn({ data: { filter } }) });
  const detail = useQuery({
    queryKey: ["reply", selectedId],
    queryFn: () => getFn({ data: { id: selectedId! } }),
    enabled: !!selectedId,
  });
  const templates = useQuery({ queryKey: ["templates"], queryFn: () => templatesFn({}) });
  const prefs = useQuery({ queryKey: ["user-prefs"], queryFn: () => prefsFn() });

  const sync = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      if (r.needsReconnect) {
        toast.info("Reconnect Gmail with read access to sync replies");
      } else {
        toast.success(`Synced ${r.replies} new repl${r.replies === 1 ? "y" : "ies"}`);
      }
      qc.invalidateQueries({ queryKey: ["replies"] });
    },
    onError: (e) => toast.error("Sync failed", { description: (e as Error).message }),
  });

  const setRead = useMutation({
    mutationFn: (id: string) => updFn({ data: { id, isRead: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["replies"] }),
  });
  const archive = useMutation({
    mutationFn: ({ id, isArchived }: { id: string; isArchived: boolean }) =>
      updFn({ data: { id, isArchived } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["replies"] });
      qc.invalidateQueries({ queryKey: ["reply"] });
    },
  });

  const generate = useMutation({
    mutationFn: (opts: { tone: ReplyTone; length: ReplyLength; instruction: string }) =>
      genFn({ data: { replyId: selectedId!, tone: opts.tone, length: opts.length, instruction: opts.instruction || undefined } }),
    onSuccess: (r) => { setSubject(r.subject); setBody(r.body); setAssistOpen(false); toast.success("Draft generated"); },
    onError: (e) => toast.error("AI failed", { description: (e as Error).message }),
  });

  const submit = useMutation({
    mutationFn: () => sendFn({ data: { replyId: selectedId!, subject, body } }),
    onSuccess: () => {
      toast.success("Reply sent");
      qc.invalidateQueries({ queryKey: ["replies"] });
      setSubject(""); setBody("");
    },
    onError: (e) => toast.error("Send failed", { description: (e as Error).message }),
  });

  const onSelect = (id: string) => {
    setSelectedId(id);
    setSubject("");
    setBody("");
    setTplId("");
    setRead.mutate(id);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">Reply Center</h1>
          <p className="text-sm text-muted-foreground">Every reply on your connected Gmail account, matched to a campaign when possible.</p>
        </div>
        <Button onClick={() => sync.mutate()} disabled={sync.isPending} variant="secondary" className="w-full sm:w-auto shrink-0">
          <RefreshCw className={`h-4 w-4 mr-2 ${sync.isPending ? "animate-spin" : ""}`} /> Sync now
        </Button>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {(["unread", "read", "archived", "all"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "ghost"} className="shrink-0" onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className={selectedId ? "hidden lg:block" : undefined}>
          <CardContent className="py-2 max-h-[70vh] overflow-auto">
            {list.isLoading ? (
              <div className="space-y-2 py-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : list.data?.length ? (
              <ul className="divide-y divide-border">
                {list.data.map((r) => (
                  <li
                    key={r.id}
                    onClick={() => onSelect(r.id)}
                    className={`py-3 px-2 -mx-2 cursor-pointer rounded-md ${selectedId === r.id ? "bg-accent" : "hover:bg-accent/40"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className={`text-sm truncate ${r.is_read ? "" : "font-semibold"}`}>
                        {r.from_name ?? r.from_email}
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{relativeTime(r.received_at)}</span>
                    </div>
                    <div className="text-xs truncate">{r.subject ?? "(no subject)"}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.snippet ?? ""}</div>
                    {!r.is_read && <Badge variant="secondary" className="mt-1 text-[10px]">New</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Inbox} title="No replies yet" desc="Hit Sync to check for new replies on your Gmail." />
            )}
          </CardContent>
        </Card>

        <Card className={!selectedId ? "hidden lg:block" : undefined}>
          <CardContent className="py-4 min-h-[280px] lg:min-h-[400px]">
            {!selectedId ? (
              <EmptyState icon={Inbox} title="Select a reply" desc="Pick a message on the left to read it and draft a response." />
            ) : detail.isLoading || !detail.data ? (
              <div className="space-y-3"><Skeleton className="h-6 w-64" /><Skeleton className="h-4 w-40" /><Skeleton className="h-32 w-full" /></div>
            ) : (
              <div className="space-y-4">
                <Button
                  size="sm"
                  variant="ghost"
                  className="lg:hidden -ml-2 mb-1"
                  onClick={() => setSelectedId(null)}
                >
                  ← Back to inbox
                </Button>
                <div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-base sm:text-lg font-semibold break-words">{detail.data.reply.subject ?? "(no subject)"}</div>
                      <div className="text-xs text-muted-foreground">
                        From <span className="font-medium">{detail.data.reply.from_name ?? detail.data.reply.from_email}</span>
                        {" · "}{new Date(detail.data.reply.received_at).toLocaleString()}
                      </div>
                    </div>
                    <Button
                      size="sm" variant="outline" className="w-full sm:w-auto shrink-0"
                      onClick={() => archive.mutate({ id: detail.data!.reply.id, isArchived: !detail.data!.reply.is_archived })}
                    >
                      {detail.data.reply.is_archived ? <><ArchiveRestore className="h-3.5 w-3.5 mr-1" /> Unarchive</> : <><Archive className="h-3.5 w-3.5 mr-1" /> Archive</>}
                    </Button>
                  </div>
                  {detail.data.campaign && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      In reply to campaign: <span className="font-medium">{detail.data.campaign.subject}</span>
                    </div>
                  )}
                </div>
                <div className="rounded-md bg-muted/30 border border-border p-3 whitespace-pre-wrap text-sm max-h-64 overflow-auto">
                  {detail.data.reply.body ?? detail.data.reply.snippet ?? ""}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Label>Your reply</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const id = prefs.data?.followUpTemplateId;
                          const t = (templates.data ?? []).find((x) => x.id === id);
                          if (t) {
                            setTplId(t.id);
                            setBody(t.body ?? "");
                            toast.success("Follow-up template applied to body");
                          } else {
                            toast.message("No follow-up template set", {
                              description: "Pick a template below to fill the reply body.",
                            });
                          }
                        }}
                      >
                        Use follow-up template
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setAssistOpen(true)} disabled={generate.isPending}>
                        <Sparkles className="h-3.5 w-3.5 mr-1" /> {generate.isPending ? "Drafting…" : "AI Draft"}
                      </Button>
                    </div>
                  </div>
                  <TemplateCombobox
                    templates={(templates.data ?? []).map((t) => ({
                      id: t.id,
                      name: t.name,
                      is_default: !!(t as { is_default?: boolean }).is_default,
                    }))}
                    value={tplId}
                    onValueChange={(id) => {
                      setTplId(id);
                      const t = (templates.data ?? []).find((x) => x.id === id);
                      if (t) setBody(t.body ?? "");
                    }}
                    placeholder="Optional: fill body from a template…"
                    searchPlaceholder="Search templates…"
                    allowClear
                    clearLabel="Clear template"
                  />
                  <Input
                    placeholder="Subject"
                    value={subject || `Re: ${detail.data.reply.subject ?? ""}`}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                  <Textarea rows={8} placeholder="Write a reply…" value={body} onChange={(e) => setBody(e.target.value)} />
                  <div className="flex justify-end">
                    <Button onClick={() => submit.mutate()} disabled={submit.isPending || !body.trim()}>
                      <Send className="h-4 w-4 mr-2" /> {submit.isPending ? "Sending…" : "Send reply"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ReplyAssistantModal
        open={assistOpen}
        onOpenChange={setAssistOpen}
        pending={generate.isPending}
        onGenerate={(opts) => generate.mutate(opts)}
      />
    </div>
  );
}