import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TemplateCombobox } from "@/components/template-combobox";
import { Sparkles, Send, X, Check, Loader2, Circle, AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { bulkSendReply, generateBulkReplyDraft } from "@/lib/bulk-reply.functions";
import { ReplyAssistantModal, type ReplyLength, type ReplyTone } from "@/components/reply-assistant-modal";
import { replyPreviewSubject } from "@/lib/reply-subject";
import { toast } from "sonner";

export type BulkReplyRecipient = {
  id: string;
  email: string;
  name: string | null;
  subject: string;
};

export type BulkReplyTemplate = {
  id: string;
  name: string;
  body: string;
  is_default?: boolean;
};

type RowState = "pending" | "sending" | "success" | "failed";
type ComposeMode = "free" | "template" | "followup";

export function BulkReplyDialog({
  open,
  onOpenChange,
  recipients,
  templates,
  followUpTemplateId = null,
  initialMode = "free",
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  recipients: BulkReplyRecipient[];
  templates: BulkReplyTemplate[];
  /** Preferred follow-up template from user prefs (fills body when Follow-up mode is used). */
  followUpTemplateId?: string | null;
  initialMode?: ComposeMode;
  onDone: () => void;
}) {
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ComposeMode>(initialMode);
  const [templateId, setTemplateId] = useState<string>("");
  const [body, setBody] = useState("");
  const [assistOpen, setAssistOpen] = useState(false);
  const [progress, setProgress] = useState<Record<string, { state: RowState; reason?: string }>>({});
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const sendFn = useServerFn(bulkSendReply);
  const draftFn = useServerFn(generateBulkReplyDraft);

  const active = useMemo(() => recipients.filter((r) => !removed.has(r.id)), [recipients, removed]);

  const followUpTpl = useMemo(
    () => (followUpTemplateId ? templates.find((t) => t.id === followUpTemplateId) : null) ?? null,
    [templates, followUpTemplateId],
  );

  const applyTemplateBody = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setTemplateId(id);
    setBody(t.body ?? "");
  };

  // When dialog opens, hydrate mode + follow-up body if requested.
  useEffect(() => {
    if (!open) return;
    setRemoved(new Set());
    setProgress({});
    setRunning(false);
    setFinished(false);
    setAssistOpen(false);
    setMode(initialMode);

    if (initialMode === "followup" && followUpTpl) {
      setTemplateId(followUpTpl.id);
      setBody(followUpTpl.body ?? "");
    } else if (initialMode === "template") {
      setTemplateId("");
      setBody("");
    } else {
      setTemplateId("");
      setBody("");
    }
  }, [open, initialMode, followUpTpl]);

  const generate = useMutation({
    mutationFn: (opts: { tone: ReplyTone; length: ReplyLength; instruction: string }) =>
      draftFn({
        data: {
          recipientIds: active.map((r) => r.id),
          tone: opts.tone,
          length: opts.length,
          instruction: opts.instruction || undefined,
          templateId: templateId || undefined,
        },
      }),
    onSuccess: (r) => {
      setBody(r.body);
      setAssistOpen(false);
      toast.success("Draft generated — review before sending");
    },
    onError: (e) => toast.error("AI failed", { description: (e as Error).message }),
  });

  const reset = () => {
    setRemoved(new Set());
    setBody("");
    setTemplateId("");
    setMode("free");
    setProgress({});
    setRunning(false);
    setFinished(false);
  };

  const runSend = async (targets: BulkReplyRecipient[]) => {
    if (targets.length === 0) return;
    setRunning(true);
    setFinished(false);
    setProgress((p) => {
      const next = { ...p };
      for (const t of targets) next[t.id] = { state: "pending" };
      return next;
    });

    // Body-only send (template is applied into the textarea). One Gmail reply per recipient.
    for (const t of targets) {
      setProgress((p) => ({ ...p, [t.id]: { state: "sending" } }));
      try {
        const res = await sendFn({
          data: {
            recipientIds: [t.id],
            body,
          },
        });
        if (res.success.length > 0) {
          setProgress((p) => ({ ...p, [t.id]: { state: "success" } }));
        } else {
          setProgress((p) => ({
            ...p,
            [t.id]: { state: "failed", reason: res.failed[0]?.reason ?? "Unknown error" },
          }));
        }
      } catch (e) {
        setProgress((p) => ({ ...p, [t.id]: { state: "failed", reason: (e as Error).message } }));
      }
    }
    setRunning(false);
    setFinished(true);
    onDone();
  };

  const sentCount = active.filter((r) => progress[r.id]?.state === "success").length;
  const failed = active.filter((r) => progress[r.id]?.state === "failed");
  const doneCount = active.filter((r) => ["success", "failed"].includes(progress[r.id]?.state ?? "")).length;
  const canSend = !running && body.trim().length > 0 && active.length > 0;

  const selectMode = (next: ComposeMode) => {
    setMode(next);
    if (next === "followup") {
      if (followUpTpl) applyTemplateBody(followUpTpl.id);
      else {
        setTemplateId("");
        toast.message("No follow-up template set", {
          description: "Pick any template below, or set a follow-up template in preferences later.",
        });
      }
    }
    if (next === "free") {
      // keep body editable; don't wipe what they wrote
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (running) return;
          if (!o) reset();
          onOpenChange(o);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-hidden flex flex-col p-0 w-[calc(100%-1rem)] sm:w-full sm:rounded-lg">
          <DialogHeader className="p-5 pb-3">
            <DialogTitle>{initialMode === "followup" ? "Follow-up reply" : "Reply to selected"}</DialogTitle>
            <DialogDescription>
              {active.length} individual repl{active.length === 1 ? "y" : "ies"} — one per recipient, each inside their own
              Gmail conversation. No BCC. Template / follow-up content is attached as the reply body.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 px-5">
            <div className="space-y-4 pb-4">
              {!finished && (
                <>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <Label>Reply body</Label>
                      <Button size="sm" variant="outline" onClick={() => setAssistOpen(true)} disabled={generate.isPending}>
                        <Sparkles className="h-3.5 w-3.5 mr-1" /> {generate.isPending ? "Drafting…" : "Generate AI reply"}
                      </Button>
                    </div>
                    <Textarea
                      rows={8}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Write your reply. Use {{first_name}} for the recipient's name — each reply is personalized individually."
                      className="min-h-[160px]"
                      autoFocus
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Subject uses each original email with a <span className="font-mono">Re:</span> prefix. Each person gets this body in their own thread.
                    </p>
                  </div>

                  <div className="flex items-center gap-1 flex-wrap">
                    <Button size="sm" variant={mode === "free" ? "default" : "outline"} onClick={() => selectMode("free")}>
                      Free-form
                    </Button>
                    <Button size="sm" variant={mode === "template" ? "default" : "outline"} onClick={() => selectMode("template")}>
                      Template
                    </Button>
                    <Button size="sm" variant={mode === "followup" ? "default" : "outline"} onClick={() => selectMode("followup")}>
                      Follow-up template
                    </Button>
                  </div>

                  {(mode === "template" || mode === "followup") && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        {mode === "followup" ? "Follow-up template (fills body above)" : "Template (fills body above)"}
                      </Label>
                      <TemplateCombobox
                        templates={templates}
                        value={templateId}
                        onValueChange={(id) => {
                          if (!id) {
                            setTemplateId("");
                            return;
                          }
                          applyTemplateBody(id);
                        }}
                        placeholder={mode === "followup" ? "Choose follow-up template…" : "Choose a reply template…"}
                        searchPlaceholder="Search templates…"
                        allowClear
                        clearLabel="Clear template"
                      />
                      {mode === "followup" && !followUpTpl && (
                        <p className="text-xs text-muted-foreground">
                          No default follow-up template saved — pick any template to use as the reply body.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Recipients ({active.length})
                </Label>
                <ul className="mt-2 rounded-md border border-border divide-y divide-border">
                  {active.map((r) => {
                    const st = progress[r.id]?.state;
                    return (
                      <li key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm transition-colors">
                        <span className="shrink-0">
                          {st === "success" ? (
                            <Check className="h-4 w-4 text-primary" />
                          ) : st === "sending" ? (
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          ) : st === "failed" ? (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          ) : st === "pending" ? (
                            <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-medium truncate block">{r.name ?? r.email}</span>
                          <span className="text-xs text-muted-foreground truncate block">{r.email}</span>
                          <span className="text-xs text-muted-foreground truncate block">
                            {replyPreviewSubject(r.subject)}
                          </span>
                          {progress[r.id]?.reason && (
                            <span className="text-xs text-destructive block">{progress[r.id]?.reason}</span>
                          )}
                        </span>
                        {!running && !finished && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            aria-label={`Remove ${r.email}`}
                            onClick={() => setRemoved((s) => new Set(s).add(r.id))}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </li>
                    );
                  })}
                  {active.length === 0 && (
                    <li className="px-3 py-4 text-sm text-muted-foreground">All recipients removed.</li>
                  )}
                </ul>
              </div>

              {running && (
                <div className="text-sm text-muted-foreground">
                  Sending replies… {doneCount} / {active.length}
                </div>
              )}

              {finished && (
                <div className="rounded-md border border-border p-3 space-y-2">
                  <div className="flex gap-2 flex-wrap">
                    <Badge>Replies sent: {sentCount}</Badge>
                    <Badge variant={failed.length ? "destructive" : "secondary"}>Failed: {failed.length}</Badge>
                    <Badge variant="outline">Total: {active.length}</Badge>
                  </div>
                  {failed.length > 0 && (
                    <ul className="text-xs space-y-1">
                      {failed.map((f) => (
                        <li key={f.id} className="flex justify-between gap-2">
                          <span className="truncate">
                            {f.name ?? f.email} · {f.email}
                          </span>
                          <span className="text-destructive shrink-0 max-w-[50%] truncate">
                            {progress[f.id]?.reason}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="p-5 pt-3 border-t border-border">
            {finished ? (
              <>
                {failed.length > 0 && (
                  <Button variant="outline" onClick={() => runSend(failed)}>
                    <RotateCcw className="h-4 w-4 mr-2" /> Retry failed ({failed.length})
                  </Button>
                )}
                <Button
                  onClick={() => {
                    reset();
                    onOpenChange(false);
                  }}
                >
                  Close
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={running}>
                  Cancel
                </Button>
                <Button onClick={() => runSend(active)} disabled={!canSend} className="transition-transform active:scale-95">
                  <Send className="h-4 w-4 mr-2" />
                  {running ? `Sending ${doneCount}/${active.length}…` : `Send ${active.length} repl${active.length === 1 ? "y" : "ies"}`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReplyAssistantModal
        open={assistOpen}
        onOpenChange={setAssistOpen}
        pending={generate.isPending}
        onGenerate={(opts) => generate.mutate(opts)}
        recipientCount={active.length}
      />
    </>
  );
}
