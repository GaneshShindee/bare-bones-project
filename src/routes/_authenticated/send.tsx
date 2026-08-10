import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTemplates } from "@/lib/templates.functions";
import { sendEmail, listGmailAccounts } from "@/lib/gmail.functions";
import { listResumes } from "@/lib/resumes.functions";
import { getUserPreferences } from "@/lib/profile.functions";
import { isAllowedResumeFile, fileToBase64, formatBytes } from "@/lib/resumes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useEffect, useMemo, useRef, useState } from "react";
import { extractVariables, applyTemplate } from "@/lib/templating";
import { parseRecipients } from "@/lib/recipients";
import { toast } from "sonner";
import { Send, Sparkles, Paperclip, X, FileText, Upload, Flame } from "lucide-react";
import { EmailGeneratorDialog } from "@/components/email-generator-dialog";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getResumeVersion } from "@/lib/resume-studio.functions";

const searchSchema = z
  .object({
    to: z.string().optional(),
    sender: z.string().optional(),
    template: z.string().optional(),
    followUp: z.string().optional(),
    campaignId: z.string().optional(),
    name: z.string().optional(),
    company: z.string().optional(),
    resumeVersionId: z.string().optional(),
  })
  .partial();

export const Route = createFileRoute("/_authenticated/send")({
  head: () => ({ meta: [{ title: "Send Email — Smart Email Sender" }] }),
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  component: SendPage,
});

function SendPage() {
  const qc = useQueryClient();
  const search = Route.useSearch();
  const listFn = useServerFn(listTemplates);
  const sendFn = useServerFn(sendEmail);
  const accountsFn = useServerFn(listGmailAccounts);
  const resumesFn = useServerFn(listResumes);
  const prefsFn = useServerFn(getUserPreferences);

  const templates = useQuery({ queryKey: ["templates"], queryFn: () => listFn() });
  const accounts = useQuery({ queryKey: ["gmail-accounts"], queryFn: () => accountsFn() });
  const resumes = useQuery({ queryKey: ["resumes"], queryFn: () => resumesFn() });
  const prefs = useQuery({ queryKey: ["user-prefs"], queryFn: () => prefsFn() });

  const [tplId, setTplId] = useState<string>("");
  const [senderId, setSenderId] = useState<string>("");
  const [recipientText, setRecipientText] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [genOpen, setGenOpen] = useState(false);
  const [resumeIds, setResumeIds] = useState<string[]>([]);
  const [uploads, setUploads] = useState<File[]>([]);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const initedRef = useRef(false);
  const [report, setReport] = useState<null | {
    total: number; sent: number; failed: number;
    skipped: Array<{ email: string; reason: string; note?: string }>;
    recipientCount: number;
  }>(null);

  const isFollowUp = search.followUp === "1";

  const selectedSender = useMemo(
    () => accounts.data?.find((a) => a.id === senderId) ?? null,
    [accounts.data, senderId],
  );
  const variables = useMemo(() => extractVariables(`${subject}\n${body}`), [subject, body]);
  const previewSubject = applyTemplate(subject, vars);
  const previewBody = applyTemplate(body, vars);
  const parsed = useMemo(() => parseRecipients(recipientText), [recipientText]);

  const selectTemplate = (id: string) => {
    setTplId(id);
    const t = templates.data?.find((x) => x.id === id);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
    }
    const preferred = (t as { preferred_resume_id?: string | null } | undefined)?.preferred_resume_id;
    if (preferred) setResumeIds((cur) => (cur.includes(preferred) ? cur : [...cur, preferred]));
  };

  // One-time hydration: default sender, default/follow-up template, URL prefill.
  useEffect(() => {
    if (initedRef.current) return;
    if (!accounts.data || !templates.data || !prefs.data) return;
    initedRef.current = true;

    const urlSender = search.sender ? accounts.data.find((a) => a.id === search.sender) : null;
    const defAcc = accounts.data.find((a) => a.is_default) ?? accounts.data[0];
    setSenderId((urlSender ?? defAcc)?.id ?? "");

    let templateToUse: string | null = null;
    if (search.template && templates.data.some((t) => t.id === search.template)) {
      templateToUse = search.template;
    } else if (isFollowUp && prefs.data.followUpTemplateId && templates.data.some((t) => t.id === prefs.data.followUpTemplateId)) {
      templateToUse = prefs.data.followUpTemplateId;
    } else if (!isFollowUp && prefs.data.defaultTemplateId && templates.data.some((t) => t.id === prefs.data.defaultTemplateId)) {
      templateToUse = prefs.data.defaultTemplateId;
    } else {
      const marked = templates.data.find((t) => (t as { is_default?: boolean }).is_default);
      if (marked) templateToUse = marked.id;
    }
    if (templateToUse) selectTemplate(templateToUse);

    if (search.to) setRecipientText(search.to);
    const preVars: Record<string, string> = {};
    if (search.name) preVars.name = search.name;
    if (search.company) preVars.company = search.company;
    if (Object.keys(preVars).length) setVars((v) => ({ ...preVars, ...v }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.data, templates.data, prefs.data]);

  const toggleResume = (id: string) =>
    setResumeIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const onUpload = (files: FileList | null) => {
    if (!files) return;
    const next: File[] = [];
    for (const f of Array.from(files)) {
      const c = isAllowedResumeFile(f);
      if (!c.ok) {
        toast.error(`${f.name}: ${c.reason}`);
        continue;
      }
      next.push(f);
    }
    if (next.length) setUploads((u) => [...u, ...next]);
    if (uploadRef.current) uploadRef.current.value = "";
  };

  const selectedResumes = useMemo(
    () => (resumes.data ?? []).filter((r) => resumeIds.includes(r.id)),
    [resumes.data, resumeIds],
  );
  const totalAttachBytes =
    selectedResumes.reduce((n, r) => n + r.size_bytes, 0) + uploads.reduce((n, f) => n + f.size, 0);
  const overLimit = totalAttachBytes > 25 * 1024 * 1024;

  const send = useMutation({
    mutationFn: async () => {
      const inlineUploads = await Promise.all(
        uploads.map(async (f) => ({
          filename: f.name,
          mimeType: f.type || "application/octet-stream",
          base64: await fileToBase64(f),
          size: f.size,
        })),
      );
      return sendFn({
        data: {
          templateId: tplId || null,
          gmailAccountId: senderId || null,
          // Send everything the user typed — the server re-validates and skips.
          recipients: parsed.valid.length ? parsed.valid : [],
          recipientMeta: parsed.meta,
          subject,
          body,
          variables: vars,
          resumeIds,
          uploads: inlineUploads,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`Email sent to ${r.sent} recipient${r.sent === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      setReport({
        total: r.total ?? r.recipientCount,
        sent: r.sent,
        failed: r.failed,
        skipped: (r.skipped ?? []) as Array<{ email: string; reason: string; note?: string }>,
        recipientCount: r.recipientCount,
      });
      setRecipientText("");
      setUploads([]);
    },
    onError: (e) => toast.error("Send failed", { description: (e as Error).message }),
  });

  // Auto-attach a generated resume version when arriving from Resume Studio.
  const getVersionFn = useServerFn(getResumeVersion);
  useEffect(() => {
    if (!search.resumeVersionId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await getVersionFn({ data: { id: search.resumeVersionId! } });
        if (cancelled) return;
        // Attach as an inline upload (temporary) so the user can review/replace.
        const filename = `${(r.version.company || r.version.job_title || "resume").replace(/[^A-Za-z0-9._-]+/g, "_")}.tex`;
        const blob = new Blob([r.version.tex_content], { type: "application/x-tex" });
        const file = new File([blob], filename, { type: "application/x-tex" });
        setUploads((u) => (u.some((x) => x.name === file.name) ? u : [...u, file]));
        // If a PDF was compiled and uploaded to storage, prefer that.
        if (r.pdfUrl) {
          try {
            const resp = await fetch(r.pdfUrl);
            const buf = await resp.arrayBuffer();
            const pdf = new File(
              [buf],
              filename.replace(/\.tex$/, ".pdf"),
              { type: "application/pdf" },
            );
            setUploads((u) => (u.some((x) => x.name === pdf.name) ? u : [...u, pdf]));
          } catch { /* ignore, .tex still attached */ }
        }
      } catch (e) {
        toast.error("Could not load resume", { description: (e as Error).message });
      }
    })();
    return () => { cancelled = true; };
  }, [search.resumeVersionId, getVersionFn]);

  if (accounts.data && accounts.data.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <h2 className="text-lg font-semibold">Connect Gmail first</h2>
            <p className="text-sm text-muted-foreground">You need to grant Gmail send permission before you can send emails.</p>
            <Button asChild><Link to="/settings">Go to Settings</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            {isFollowUp && <Flame className="h-5 w-5 text-primary" />}
            {isFollowUp ? "Follow-up Email" : "Send Email"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isFollowUp ? "Review the pre-filled details and hit send." : "Pick a template, drop in recipients, and send."}
          </p>
        </div>
        <div className="min-w-[260px]">
          <Label className="text-xs">Send from</Label>
          <Select value={senderId} onValueChange={setSenderId}>
            <SelectTrigger><SelectValue placeholder="Select a Gmail account" /></SelectTrigger>
            <SelectContent>
              {accounts.data?.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {(a.label ?? a.full_name ?? a.gmail_email)}{a.is_default ? " · Default" : ""} — {a.gmail_email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardContent className="py-4 space-y-4">
              <div>
                <Label>Template</Label>
                <Select value={tplId} onValueChange={selectTemplate}>
                  <SelectTrigger><SelectValue placeholder="Choose a template (optional)" /></SelectTrigger>
                  <SelectContent>
                    {templates.data?.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}{(t as { is_default?: boolean }).is_default ? " · Default" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {variables.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Variables</div>
                  {variables.map((v) => (
                    <div key={v} className="grid grid-cols-[120px_1fr] items-center gap-2">
                      <Label className="text-xs">{`{{${v}}}`}</Label>
                      <Input value={vars[v] ?? ""} onChange={(e) => setVars({ ...vars, [v]: e.target.value })} />
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <Label>Recipients</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setGenOpen(true)}>
                    <Sparkles className="h-3.5 w-3.5 mr-1" /> Generate Emails
                  </Button>
                </div>
                <Textarea
                  rows={3}
                  value={recipientText}
                  onChange={(e) => setRecipientText(e.target.value)}
                  placeholder="Paste recipient emails…"
                  className="font-mono text-sm"
                />
                {parsed.total > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="secondary">{parsed.valid.length} Recipient{parsed.valid.length === 1 ? "" : "s"}</Badge>
                    {parsed.invalid.length > 0 && <Badge variant="destructive">{parsed.invalid.length} Invalid</Badge>}
                    {parsed.duplicates > 0 && <Badge variant="outline">{parsed.duplicates} Duplicate</Badge>}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" /> Attachments</Label>
                  <div>
                    <input
                      ref={uploadRef}
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      onChange={(e) => onUpload(e.target.files)}
                    />
                    <Button type="button" size="sm" variant="outline" onClick={() => uploadRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5 mr-1" /> Add file
                    </Button>
                  </div>
                </div>
                {resumes.data && resumes.data.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">From your Resume Library</div>
                    <div className="flex flex-wrap gap-1.5">
                      {resumes.data.map((r) => {
                        const on = resumeIds.includes(r.id);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => toggleResume(r.id)}
                            className={`text-xs rounded-full border px-2.5 py-1 inline-flex items-center gap-1 transition-colors ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"}`}
                          >
                            <FileText className="h-3 w-3" />
                            {r.name}{r.is_default ? " ·★" : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {(selectedResumes.length > 0 || uploads.length > 0) && (
                  <div className="space-y-1">
                    {selectedResumes.map((r) => (
                      <div key={r.id} className="flex items-center justify-between text-xs rounded-md bg-background border border-border px-2 py-1.5">
                        <span className="truncate flex items-center gap-1.5"><FileText className="h-3 w-3" /> {r.original_filename} <span className="text-muted-foreground">· {formatBytes(r.size_bytes)} · saved</span></span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => toggleResume(r.id)}><X className="h-3 w-3" /></Button>
                      </div>
                    ))}
                    {uploads.map((f, i) => (
                      <div key={`u-${i}`} className="flex items-center justify-between text-xs rounded-md bg-background border border-border px-2 py-1.5">
                        <span className="truncate flex items-center gap-1.5"><FileText className="h-3 w-3" /> {f.name} <span className="text-muted-foreground">· {formatBytes(f.size)} · temporary</span></span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setUploads((u) => u.filter((_, j) => j !== i))}><X className="h-3 w-3" /></Button>
                      </div>
                    ))}
                    <div className={`text-xs ${overLimit ? "text-destructive" : "text-muted-foreground"}`}>
                      Total: {formatBytes(totalAttachBytes)} / 25 MB
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Subject & body</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><Label>Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
              <div><Label>Body</Label><Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} /></div>
            </CardContent>
          </Card>

          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground flex items-start gap-2">
            <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Each recipient gets a personalized greeting like <span className="font-medium text-foreground">Hello Ganesh,</span> —
              the rest of the template is sent exactly as written. Invalid, duplicate, and unroutable addresses are automatically skipped.
            </span>
          </div>

          <Button
            onClick={() => send.mutate()}
            disabled={send.isPending || parsed.valid.length === 0 || !subject.trim() || !body.trim() || !senderId || overLimit}
            className="w-full"
            size="lg"
          >
            <Send className="h-4 w-4 mr-2" />
            {send.isPending ? "Sending…" : `Send to ${parsed.valid.length} recipient${parsed.valid.length === 1 ? "" : "s"}`}
          </Button>
        </div>

        <div className="lg:sticky lg:top-4 h-fit">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Preview</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border bg-background p-4 text-sm space-y-2 max-h-[70vh] overflow-auto">
                <div><span className="text-muted-foreground">From:</span> {selectedSender?.gmail_email ?? "—"}</div>
                <div className="break-words">
                  <span className="text-muted-foreground">Bcc ({parsed.valid.length}):</span>{" "}
                  {parsed.valid.length ? parsed.valid.slice(0, 8).join(", ") + (parsed.valid.length > 8 ? ` +${parsed.valid.length - 8} more` : "") : "—"}
                </div>
                <div><span className="text-muted-foreground">Subject:</span> {previewSubject || "—"}</div>
                {(selectedResumes.length > 0 || uploads.length > 0) && (
                  <div>
                    <span className="text-muted-foreground">Attachments ({selectedResumes.length + uploads.length}):</span>{" "}
                    {[...selectedResumes.map((r) => r.original_filename), ...uploads.map((u) => u.name)].join(", ")}
                  </div>
                )}
                <div className="border-t border-border pt-2 whitespace-pre-wrap">{previewBody || "—"}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <EmailGeneratorDialog
        open={genOpen}
        onOpenChange={setGenOpen}
        onUse={(emails) => {
          const existing = parsed.valid;
          const merged = Array.from(new Set([...existing, ...emails.map((e) => e.toLowerCase())]));
          setRecipientText(merged.join(", "));
        }}
      />

      <SendReportDialog report={report} onClose={() => setReport(null)} />
    </div>
  );
}

function SendReportDialog({
  report,
  onClose,
}: {
  report: null | { total: number; sent: number; failed: number; skipped: Array<{ email: string; reason: string; note?: string }>; recipientCount: number };
  onClose: () => void;
}) {
  const open = !!report;
  const download = () => {
    if (!report) return;
    const now = new Date().toISOString();
    const rows: string[] = ["Email,Status,Reason,Timestamp"];
    for (let i = 0; i < report.sent; i++) rows.push(`,sent,,${now}`);
    for (let i = 0; i < report.failed; i++) rows.push(`,failed,,${now}`);
    for (const s of report.skipped) rows.push(`${csv(s.email)},skipped,${csv(s.reason + (s.note ? ` (${s.note})` : ""))},${now}`);
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `send-report-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Campaign summary</DialogTitle></DialogHeader>
        {report && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Total" value={report.total} />
              <Stat label="Sent" value={report.sent} tone="ok" />
              <Stat label="Failed" value={report.failed} tone={report.failed ? "err" : undefined} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Invalid" value={report.skipped.filter((s) => s.reason === "invalid_syntax").length} />
              <Stat label="Duplicate" value={report.skipped.filter((s) => s.reason === "duplicate").length} />
              <Stat label="Domain errors" value={report.skipped.filter((s) => s.reason === "unroutable_domain").length} />
            </div>
            {report.skipped.length > 0 && (
              <div className="rounded-md border border-border bg-muted/30 p-2 max-h-40 overflow-auto text-xs space-y-1">
                {report.skipped.map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="truncate">{s.email || "(blank)"}</span>
                    <span className="text-muted-foreground">{s.reason}{s.note ? ` · ${s.note}` : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={download}>Download report</Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "err" }) {
  const color = tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : tone === "err" ? "text-destructive" : "";
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}
function csv(s: string) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}