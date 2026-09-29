import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { TemplateCombobox } from "@/components/template-combobox";
import { ResumeCombobox } from "@/components/resume-combobox";
import { Badge } from "@/components/ui/badge";
import { useEffect, useMemo, useRef, useState } from "react";
import { extractVariables, applyTemplate } from "@/lib/templating";
import { parseRecipients } from "@/lib/recipients";
import { toast } from "sonner";
import { Send, Sparkles, Paperclip, X, FileText, Upload, Flame, Pencil, Eye, Wand2 } from "lucide-react";
import { EmailGeneratorDialog } from "@/components/email-generator-dialog";
import { AiBodyDialog } from "@/components/ai-body-dialog";
import { GenerateResumeDialog, openLinkedOrGenerateResume } from "@/components/generate-resume-dialog";
import { getLinkedResumeVersionId } from "@/lib/job-resume-link";
import { DraftManager, filesFromDraftAttachments, type DraftState, type LoadedDraft } from "@/components/draft-manager";
import { getAutosaveDraft, saveEmailDraft, deleteEmailDraft } from "@/lib/drafts.functions";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getResumeVersion } from "@/lib/resume-studio.functions";
import { getJob } from "@/lib/jobs.functions";
import { jobToContextFields, jobToTemplateVars } from "@/lib/job-context";
import { generateAiEmail } from "@/lib/ai-email.functions";
import { peekSendResumeHandoff, clearSendResumeHandoff } from "@/lib/send-resume-handoff";

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
    jobId: z.string().uuid().optional(),
  })
  .partial();

export const Route = createFileRoute("/_authenticated/send")({
  head: () => ({ meta: [{ title: "Send Email — Smart Email Sender" }] }),
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  component: SendPage,
});

function SendPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
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
  const [aiOpen, setAiOpen] = useState(false);
  const [resumeGenOpen, setResumeGenOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [autosaveId, setAutosaveId] = useState<string | null>(null);
  const [tplPickerOpen, setTplPickerOpen] = useState(false);
  const [resumePickerOpen, setResumePickerOpen] = useState(false);
  const [jobMeta, setJobMeta] = useState({
    company: "",
    role: "",
    jobDescription: "",
    jobContext: "",
    instructions: "",
  });
  const [resumeIds, setResumeIds] = useState<string[]>([]);
  const [uploads, setUploads] = useState<File[]>([]);
  const [savedAttachments, setSavedAttachments] = useState<
    Array<{ filename: string; mimeType: string; size: number; storagePath: string }>
  >([]);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const initedRef = useRef(false);
  const jobHydratedRef = useRef<string | null>(null);
  const skipAutosaveUntilRef = useRef(0);
  const autosaveIdRef = useRef<string | null>(null);
  const getJobFn = useServerFn(getJob);
  const [report, setReport] = useState<null | {
    total: number; sent: number; failed: number;
    skipped: Array<{ email: string; reason: string; note?: string }>;
    recipientCount: number;
  }>(null);
  const [editingPreview, setEditingPreview] = useState(false);
  const [aiFilling, setAiFilling] = useState(false);

  const autosaveFn = useServerFn(saveEmailDraft);
  const getAutosaveFn = useServerFn(getAutosaveDraft);
  const deleteDraftFn = useServerFn(deleteEmailDraft);
  const generateAiEmailFn = useServerFn(generateAiEmail);

  const isFollowUp = search.followUp === "1";
  const hasUrlPrefill = !!(search.to || search.followUp || search.resumeVersionId || search.campaignId || search.jobId);

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

  // One-time hydration: URL prefill, cross-device autosave, or defaults.
  useEffect(() => {
    if (initedRef.current) return;
    if (!accounts.data || !templates.data || !prefs.data) return;

    const urlSender = search.sender ? accounts.data.find((a) => a.id === search.sender) : null;
    const defAcc = accounts.data.find((a) => a.is_default) ?? accounts.data[0];
    setSenderId((urlSender ?? defAcc)?.id ?? "");

    const applyDefaultTemplate = () => {
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
    };

    if (search.to) setRecipientText(search.to);
    const preVars: Record<string, string> = {};
    if (search.name) preVars.name = search.name;
    if (search.company) preVars.company = search.company;
    if (Object.keys(preVars).length) setVars((v) => ({ ...preVars, ...v }));
    if (search.company) {
      setJobMeta((m) => ({ ...m, company: search.company || m.company }));
    }

    if (hasUrlPrefill) {
      // When returning from Resume Studio with a preserved email, don't wipe it with a template.
      const handoff = peekSendResumeHandoff();
      if (!(search.resumeVersionId && handoff?.attachOnly && (handoff.subject || handoff.body))) {
        applyDefaultTemplate();
      }
      initedRef.current = true;
      skipAutosaveUntilRef.current = Date.now() + 2000;
      // Reuse the user's single existing autosave row (if any) so composing from a job
      // posting overwrites that in-progress draft instead of leaving an orphaned extra one behind.
      getAutosaveFn()
        .then((r) => {
          if (r.draft && !autosaveIdRef.current) {
            setAutosaveId(r.draft.id);
            autosaveIdRef.current = r.draft.id;
          }
        })
        .catch(() => {});
      return;
    }

    initedRef.current = true; // block re-entry while fetching
    (async () => {
      try {
        const r = await getAutosaveFn();
        const d = r.draft;
        const hasContent = !!(d && (d.recipients?.trim() || d.subject?.trim() || d.body?.trim()));
        if (!hasContent || !d) {
          applyDefaultTemplate();
          if (d) {
            setAutosaveId(d.id);
            autosaveIdRef.current = d.id;
          }
        } else {
          const files = await filesFromDraftAttachments(r.attachments);
          setTplId(d.template_id ?? "");
          if (d.gmail_account_id) setSenderId(d.gmail_account_id);
          setRecipientText(d.recipients ?? "");
          setSubject(d.subject ?? "");
          setBody(d.body ?? "");
          setVars(d.variables ?? {});
          setResumeIds(d.resume_ids ?? []);
          setUploads(files);
          setSavedAttachments(d.attachments ?? []);
          setJobMeta({
            company: d.company ?? "",
            role: d.role ?? "",
            jobDescription: d.job_description ?? "",
            jobContext: d.job_description ?? "",
            instructions: d.instructions ?? "",
          });
          setAutosaveId(d.id);
          autosaveIdRef.current = d.id;
          toast.message("Restored autosaved draft", {
            description: `Last saved ${new Date(d.updated_at).toLocaleString()}`,
          });
        }
      } catch {
        applyDefaultTemplate();
      } finally {
        skipAutosaveUntilRef.current = Date.now() + 2000;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.data, templates.data, prefs.data]);

  // Load full Jobs Community posting when navigated with ?jobId=, then auto-fill subject/body via AI.
  useEffect(() => {
    if (!search.jobId || jobHydratedRef.current === search.jobId) return;
    // Wait until template hydration can resolve (same deps as one-time init).
    if (!accounts.data || !templates.data || !prefs.data) return;

    let cancelled = false;
    (async () => {
      try {
        const job = await getJobFn({ data: { id: search.jobId! } });
        if (cancelled) return;
        const fields = jobToContextFields(job);
        jobHydratedRef.current = search.jobId!;
        setJobMeta((m) => ({
          ...m,
          company: fields.company || m.company,
          role: fields.role || m.role,
          jobDescription: fields.jobDescription || m.jobDescription,
          jobContext: fields.jobContext || m.jobContext,
        }));
        setVars((v) => ({
          ...v,
          ...jobToTemplateVars(job),
        }));
        if (job.recruiter_email) {
          setRecipientText((cur) => (cur.trim() ? cur : job.recruiter_email));
        }

        // Resolve template the same way as page init (tplId state may still be stale this tick).
        let templateId: string | null = null;
        if (search.template && templates.data.some((t) => t.id === search.template)) {
          templateId = search.template;
        } else if (prefs.data.defaultTemplateId && templates.data.some((t) => t.id === prefs.data.defaultTemplateId)) {
          templateId = prefs.data.defaultTemplateId;
        } else {
          const marked = templates.data.find((t) => (t as { is_default?: boolean }).is_default);
          templateId = marked?.id ?? templates.data[0]?.id ?? null;
        }

        setAiFilling(true);
        skipAutosaveUntilRef.current = Date.now() + 8000;
        toast.message("Generating email from job…", {
          description: [job.title, job.company].filter(Boolean).join(" · "),
        });

        const result = await generateAiEmailFn({
          data: {
            templateId,
            resumeVersionId: search.resumeVersionId ?? null,
            company: fields.company || null,
            jobTitle: fields.role || null,
            jobDescription: fields.jobDescription || null,
            jobContext: fields.jobContext || null,
            instructions: null,
          },
        });
        if (cancelled) return;

        if (result.subject) setSubject(result.subject);
        if (result.body) setBody(result.body);
        setEditingPreview(false);
        skipAutosaveUntilRef.current = Date.now() + 2000;
        toast.success("Email filled from job posting", {
          description: "Review the preview — you can still edit or regenerate.",
        });
      } catch (e) {
        if (!cancelled) {
          toast.error("Could not load job / generate email", {
            description: (e as Error).message,
          });
        }
      } finally {
        if (!cancelled) setAiFilling(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.jobId, accounts.data, templates.data, prefs.data, getJobFn, generateAiEmailFn]);

  // Restore preserved email after returning from Resume Studio (attach-only — no new AI body).
  // Peek only (do not take) so React Strict Mode remounts / revisits keep the same draft.
  const handoffRestoredForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!search.resumeVersionId) return;
    if (handoffRestoredForRef.current === search.resumeVersionId) return;
    const h = peekSendResumeHandoff();
    if (!h?.attachOnly) return;
    handoffRestoredForRef.current = search.resumeVersionId;
    if (h.subject) setSubject(h.subject);
    if (h.body) setBody(h.body);
    if (h.recipientText) setRecipientText(h.recipientText);
    if (h.vars && Object.keys(h.vars).length) setVars((v) => ({ ...v, ...h.vars }));
    setJobMeta((m) => ({
      company: h.company || m.company,
      role: h.role || m.role,
      jobDescription: h.jobDescription || m.jobDescription,
      jobContext: h.jobContext || m.jobContext,
      instructions: h.instructions || m.instructions,
    }));
    setEditingPreview(false);
    skipAutosaveUntilRef.current = Date.now() + 2500;
    toast.message("Email restored", {
      description: "Subject & body unchanged — resume PDF attaching…",
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.resumeVersionId]);

  useEffect(() => {
    autosaveIdRef.current = autosaveId;
  }, [autosaveId]);

  const toggleResume = (id: string) =>
    setResumeIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const collectDraftState = async (): Promise<DraftState> => {
    const inline = await Promise.all(
      uploads.map(async (f) => ({
        filename: f.name,
        mimeType: f.type || "application/octet-stream",
        size: f.size,
        base64: await fileToBase64(f),
      })),
    );
    const keptSaved = savedAttachments.filter((a) => uploads.some((u) => u.name === a.filename));
    const fresh = inline.filter((a) => !keptSaved.some((k) => k.filename === a.filename));
    return {
      name: subject || "Untitled draft",
      gmailAccountId: senderId || null,
      templateId: tplId || null,
      resumeVersionId: search.resumeVersionId ?? null,
      recipients: recipientText,
      subject,
      body,
      variables: vars,
      resumeIds,
      attachments: [...keptSaved, ...fresh],
      company: jobMeta.company,
      role: jobMeta.role,
      jobDescription: jobMeta.jobDescription,
      instructions: jobMeta.instructions,
    };
  };

  const applyLoadedDraft = ({ draft, files }: LoadedDraft) => {
    initedRef.current = true;
    skipAutosaveUntilRef.current = Date.now() + 2500;
    setTplId(draft.template_id ?? "");
    setSenderId(draft.gmail_account_id ?? senderId);
    setRecipientText(draft.recipients ?? "");
    setSubject(draft.subject ?? "");
    setBody(draft.body ?? "");
    setVars(draft.variables ?? {});
    setResumeIds(draft.resume_ids ?? []);
    setUploads(files);
    setSavedAttachments(draft.attachments ?? []);
    setJobMeta({
      company: draft.company ?? "",
      role: draft.role ?? "",
      jobDescription: draft.job_description ?? "",
      jobContext: draft.job_description ?? "",
      instructions: draft.instructions ?? "",
    });
  };

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
      const company = jobMeta.company.trim() || vars.company?.trim() || undefined;
      const role = jobMeta.role.trim() || undefined;
      return sendFn({
        data: {
          templateId: tplId || null,
          gmailAccountId: senderId || null,
          // Send everything the user typed — the server re-validates and skips.
          recipients: parsed.valid.length ? parsed.valid : [],
          recipientMeta:
            company || role
              ? parsed.meta.map((m) => ({ ...m, ...(company ? { company } : {}), ...(role ? { role } : {}) }))
              : parsed.meta,
          subject,
          body,
          variables: vars,
          resumeIds,
          uploads: inlineUploads,
        },
      });
    },
    onSuccess: async (r) => {
      toast.success(`Email sent to ${r.sent} recipient${r.sent === 1 ? "" : "s"}`);
      clearSendResumeHandoff();
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
      skipAutosaveUntilRef.current = Date.now() + 5000;
      const id = autosaveIdRef.current;
      if (id) {
        try {
          await deleteDraftFn({ data: { id } });
        } catch {
          /* ignore */
        }
        setAutosaveId(null);
        autosaveIdRef.current = null;
      }
    },
    onError: (e) => toast.error("Send failed", { description: (e as Error).message }),
  });

  // Debounced cross-device autosave (text + attachments to Supabase).
  useEffect(() => {
    if (!initedRef.current) return;
    const meaningful = !!(recipientText.trim() || subject.trim() || body.trim() || resumeIds.length || uploads.length);
    if (!meaningful) return;

    const delay = Math.max(1600, skipAutosaveUntilRef.current - Date.now());
    const timer = window.setTimeout(async () => {
      try {
        const state = await collectDraftState();
        const r = await autosaveFn({
          data: {
            ...state,
            id: autosaveIdRef.current ?? undefined,
            name: "Autosaved draft",
            metadata: { autosave: true },
          },
        });
        setAutosaveId(r.id);
        autosaveIdRef.current = r.id;
        if (r.attachments?.length) {
          setSavedAttachments(r.attachments);
        }
      } catch {
        /* silent — named Save draft still works */
      }
    }, delay);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientText, subject, body, vars, tplId, senderId, resumeIds, uploads, jobMeta]);

  // Keyboard: ⌘/Ctrl+Enter send · ⌘/Ctrl+⌥/Alt+T template · ⌘/Ctrl+⌥/Alt+R resumes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (genOpen || aiOpen || resumeGenOpen || report) return;

      if (e.key === "Enter") {
        e.preventDefault();
        if (
          !send.isPending &&
          parsed.valid.length > 0 &&
          subject.trim() &&
          body.trim() &&
          senderId &&
          !overLimit
        ) {
          send.mutate();
        }
        return;
      }
      if (e.altKey && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        setTplPickerOpen(true);
        setResumePickerOpen(false);
        return;
      }
      if (e.altKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        setResumePickerOpen(true);
        setTplPickerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [genOpen, aiOpen, resumeGenOpen, report, send, parsed.valid.length, subject, body, senderId, overLimit]);

  // Auto-attach the compiled PDF from Resume Studio. Only attach PDFs — never .tex.
  const getVersionFn = useServerFn(getResumeVersion);
  useEffect(() => {
    if (!search.resumeVersionId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await getVersionFn({ data: { id: search.resumeVersionId! } });
        if (cancelled) return;
        if (!r.pdfUrl) {
          toast.error("No compiled PDF for this resume yet", {
            description: "Open the resume in Resume Studio and click Compile before sending.",
          });
          return;
        }
        const { resumePdfName } = await import("@/lib/naming");
        const pdfName = resumePdfName({
          fullName: prefs.data?.fullName ?? null,
          email: prefs.data?.email ?? null,
          company: r.version.company ?? null,
        });
        try {
          const resp = await fetch(r.pdfUrl);
          const buf = await resp.arrayBuffer();
          if (!buf.byteLength) throw new Error("Empty PDF");
          const pdf = new File([buf], pdfName, { type: "application/pdf" });
          setUploads((u) => (u.some((x) => x.name === pdf.name) ? u : [...u, pdf]));
        } catch (err) {
          toast.error("Could not attach the compiled PDF", { description: (err as Error).message });
        }
      } catch (e) {
        toast.error("Could not load resume", { description: (e as Error).message });
      }
    })();
    return () => { cancelled = true; };
  }, [search.resumeVersionId, getVersionFn, prefs.data]);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title flex items-center gap-2">
            {isFollowUp && <Flame className="h-4 w-4 text-primary shrink-0" />}
            {isFollowUp ? "Follow-up Email" : "Send Email"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isFollowUp ? "Review the pre-filled details and hit send." : "Pick a template, drop in recipients, and send."}
          </p>
        </div>
        <div className="flex items-stretch sm:items-center gap-2 flex-wrap w-full sm:w-auto">
          <DraftManager
            draftId={draftId}
            onDraftIdChange={setDraftId}
            getState={collectDraftState}
            onLoad={applyLoadedDraft}
          />
          <Select value={senderId} onValueChange={setSenderId}>
            <SelectTrigger className="w-full sm:w-[220px] h-10 min-w-0">
              <SelectValue placeholder="Gmail account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.data?.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {(a.label ?? a.full_name ?? a.gmail_email)}{a.is_default ? " · Default" : ""} — {a.gmail_email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => send.mutate()}
            disabled={
              send.isPending ||
              parsed.valid.length === 0 ||
              !subject.trim() ||
              !body.trim() ||
              !senderId ||
              overLimit
            }
            className="shrink-0 h-10 w-full sm:w-auto"
          >
            <Send className="h-4 w-4 mr-2" />
            {send.isPending ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardContent className="py-4 space-y-4">
              <div>
                <Label>Template</Label>
                <TemplateCombobox
                  templates={(templates.data ?? []).map((t) => ({
                    id: t.id,
                    name: t.name,
                    is_default: !!(t as { is_default?: boolean }).is_default,
                  }))}
                  value={tplId}
                  onValueChange={selectTemplate}
                  placeholder="Choose a template (optional)"
                  searchPlaceholder="Search templates by name…"
                  allowClear
                  clearLabel="No template"
                  open={tplPickerOpen}
                  onOpenChange={setTplPickerOpen}
                />
              </div>

              {variables.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Variables</div>
                  {variables.map((v) => (
                    <div key={v} className="grid grid-cols-1 sm:grid-cols-[120px_1fr] items-start sm:items-center gap-1.5 sm:gap-2">
                      <Label className="text-xs">{`{{${v}}}`}</Label>
                      <Input value={vars[v] ?? ""} onChange={(e) => setVars({ ...vars, [v]: e.target.value })} />
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Label>Recipients</Label>
                  <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => setGenOpen(true)}>
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

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
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
                  <ResumeCombobox
                    resumes={resumes.data.map((r) => ({
                      id: r.id,
                      name: r.name,
                      is_default: !!r.is_default,
                    }))}
                    value={resumeIds}
                    onToggle={toggleResume}
                    placeholder="Attach from Resume Library…"
                    searchPlaceholder="Search resumes by name…"
                    open={resumePickerOpen}
                    onOpenChange={setResumePickerOpen}
                  />
                )}

                {(selectedResumes.length > 0 || uploads.length > 0) && (
                  <div className="space-y-1">
                    {selectedResumes.map((r) => (
                      <div key={r.id} className="flex items-center justify-between text-xs rounded-md bg-muted/40 border border-border px-2 py-1.5">
                        <span className="truncate flex items-center gap-1.5"><FileText className="h-3 w-3 shrink-0" /> {r.original_filename} <span className="text-muted-foreground">· {formatBytes(r.size_bytes)}</span></span>
                        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => toggleResume(r.id)}><X className="h-3 w-3" /></Button>
                      </div>
                    ))}
                    {uploads.map((f, i) => (
                      <div key={`u-${i}`} className="flex items-center justify-between text-xs rounded-md bg-muted/40 border border-border px-2 py-1.5">
                        <span className="truncate flex items-center gap-1.5"><FileText className="h-3 w-3 shrink-0" /> {f.name} <span className="text-muted-foreground">· {formatBytes(f.size)} · temp</span></span>
                        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setUploads((u) => u.filter((_, j) => j !== i))}><X className="h-3 w-3" /></Button>
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

          <Button
            onClick={() => send.mutate()}
            disabled={send.isPending || parsed.valid.length === 0 || !subject.trim() || !body.trim() || !senderId || overLimit}
            className="w-full"
            size="lg"
          >
            <Send className="h-4 w-4 mr-2" />
            {send.isPending ? "Sending…" : "Send"}
          </Button>
        </div>

        <div className="lg:sticky lg:top-4 h-fit">
          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between space-y-0 gap-2 flex-wrap">
              <CardTitle className="text-base">Preview</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={editingPreview ? "default" : "outline"}
                  onClick={() => setEditingPreview((v) => !v)}
                >
                  {editingPreview ? (
                    <><Eye className="h-3.5 w-3.5 mr-1" /> Preview</>
                  ) : (
                    <><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const company = jobMeta.company || (vars.company ?? "");
                    const role = jobMeta.role || (vars.name ?? "");
                    openLinkedOrGenerateResume({
                      navigate,
                      jobId: search.jobId,
                      company,
                      role,
                      jobContext: jobMeta.jobContext || jobMeta.jobDescription,
                      instructions: jobMeta.instructions,
                      existingResumeVersionId:
                        search.resumeVersionId ||
                        getLinkedResumeVersionId({ jobId: search.jobId, company, role }),
                      preserveEmail: { subject, body, recipientText, vars },
                      openDialog: () => setResumeGenOpen(true),
                    });
                  }}
                  disabled={aiFilling}
                >
                  <Wand2 className="h-3.5 w-3.5 mr-1" />
                  {search.resumeVersionId ||
                  getLinkedResumeVersionId({
                    jobId: search.jobId,
                    company: jobMeta.company || (vars.company ?? ""),
                    role: jobMeta.role,
                  })
                    ? "Open Resume"
                    : "Generate Resume"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setAiOpen(true)} disabled={aiFilling}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  {aiFilling ? "Filling from job…" : "Generate Body Using AI"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {aiFilling && (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Tailoring subject & body from the full job posting…
                </div>
              )}
              {editingPreview ? (
                <>
                  <div>
                    <Label>Subject</Label>
                    <Input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Email subject…"
                    />
                  </div>
                  <div>
                    <Label>Body</Label>
                    <Textarea
                      rows={16}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Write your email body…"
                      className="min-h-[280px]"
                    />
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-border bg-background p-4 text-sm space-y-3 max-h-[70vh] overflow-auto">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Subject</div>
                    <div className="font-medium break-words">{previewSubject || subject || "—"}</div>
                  </div>
                  <div className="border-t border-border pt-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Body</div>
                    <div className="whitespace-pre-wrap leading-relaxed">{previewBody || body || "—"}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <EmailGeneratorDialog
        open={genOpen}
        onOpenChange={setGenOpen}
        companyFromEmail={jobMeta.company || vars.company || ""}
        onUse={(emails) => {
          const existing = parsed.valid;
          const merged = Array.from(new Set([...existing, ...emails.map((e) => e.toLowerCase())]));
          setRecipientText(merged.join(", "));
        }}
      />

      <SendReportDialog report={report} onClose={() => setReport(null)} />

      <AiBodyDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        templateId={tplId || null}
        resumeVersionId={search.resumeVersionId ?? null}
        jobId={search.jobId ?? null}
        initialCompany={jobMeta.company || (vars.company ?? "")}
        initialRole={jobMeta.role}
        initialJobDescription={jobMeta.jobDescription}
        initialJobContext={jobMeta.jobContext || jobMeta.jobDescription}
        preserveEmail={{
          subject,
          body,
          recipientText,
          vars,
        }}
        onUse={(r) => {
          if (r.subject) setSubject(r.subject);
          setBody(r.body);
          setJobMeta({
            company: r.company,
            role: r.role,
            jobDescription: r.jobDescription,
            jobContext: r.jobContext ?? r.jobDescription,
            instructions: r.instructions,
          });
          setEditingPreview(false);
          toast.success("AI email applied");
        }}
      />

      <GenerateResumeDialog
        open={resumeGenOpen}
        onOpenChange={setResumeGenOpen}
        jobId={search.jobId ?? null}
        existingResumeVersionId={search.resumeVersionId ?? null}
        initialCompany={jobMeta.company || (vars.company ?? "")}
        initialRole={jobMeta.role}
        initialJobContext={jobMeta.jobContext || jobMeta.jobDescription}
        initialInstructions={jobMeta.instructions}
        preserveEmail={{
          subject,
          body,
          recipientText,
          vars,
        }}
      />
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
    <div className="rounded-xl border border-border bg-card px-3 py-3 flex flex-col items-center justify-center text-center min-h-[4rem] gap-1">
      <div className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold leading-none ${color}`}>{value}</div>
    </div>
  );
}
function csv(s: string) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}