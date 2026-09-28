import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getResumeVersion,
  updateResumeVersionTex,
  uploadResumeVersionPdf,
  saveResumeVersionToLibrary,
  saveResumeVersionAsMaster,
  deleteResumeVersion,
  improveResumeSection,
  generateApplicationEmail,
} from "@/lib/resume-studio.functions";
import { getUserPreferences } from "@/lib/profile.functions";
import { resumeFileBaseName } from "@/lib/naming";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LatexEditor, type EditorSelection, type LatexEditorApi } from "@/components/latex-editor";
import { LatexPreview } from "@/components/latex-preview";
import { UpdateResumeDialog, InlineAskAi } from "@/components/resume-ai-dialogs";
import { ArrowLeft, Save, Wand2, Sparkles, Trash2, Send, CheckCircle2, AlertCircle, FolderPlus, Paperclip, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AI_JD_RESUME_FOLDER } from "@/lib/linkedin";
import { peekSendResumeHandoff, saveSendResumeHandoff } from "@/lib/send-resume-handoff";
import { setLinkedResumeVersionId } from "@/lib/job-resume-link";
import { z } from "zod";

const studioSearchSchema = z
  .object({
    /** Came from Send Email — attach PDF only, never AI-draft a new body. */
    returnToSend: z.union([z.boolean(), z.literal("true"), z.literal("1"), z.literal(1)]).optional(),
  })
  .partial();

function isReturnToSend(v: unknown): boolean {
  return v === true || v === "true" || v === "1" || v === 1;
}

export const Route = createFileRoute("/_authenticated/resume-studio/$id")({
  head: () => ({ meta: [{ title: "Resume workspace — Smart Email Sender" }] }),
  validateSearch: (s: Record<string, unknown>) => studioSearchSchema.parse(s),
  component: WorkspacePage,
});

function WorkspacePage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const nav = useNavigate();

  const getFn = useServerFn(getResumeVersion);
  const saveFn = useServerFn(updateResumeVersionTex);
  const uploadPdfFn = useServerFn(uploadResumeVersionPdf);
  const saveLibraryFn = useServerFn(saveResumeVersionToLibrary);
  const saveAsMasterFn = useServerFn(saveResumeVersionAsMaster);
  const delFn = useServerFn(deleteResumeVersion);
  const improveFn = useServerFn(improveResumeSection);
  const emailFn = useServerFn(generateApplicationEmail);
  const prefsFn = useServerFn(getUserPreferences);

  const q = useQuery({ queryKey: ["resume-version", id], queryFn: () => getFn({ data: { id } }) });
  const prefs = useQuery({ queryKey: ["user-prefs"], queryFn: () => prefsFn() });
  const [tex, setTex] = useState("");
  const [dirty, setDirty] = useState(false);
  const [errorLines, setErrorLines] = useState<number[]>([]);
  const [compiledTex, setCompiledTex] = useState<string | null>(null);
  const [hasPdf, setHasPdf] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [selection, setSelection] = useState<EditorSelection | null>(null);
  const editorApi = useRef<LatexEditorApi | null>(null);
  const [attachOnlyHandoff, setAttachOnlyHandoff] = useState(
    () => peekSendResumeHandoff()?.attachOnly === true || isReturnToSend(search.returnToSend),
  );

  useEffect(() => {
    setAttachOnlyHandoff(
      peekSendResumeHandoff()?.attachOnly === true || isReturnToSend(search.returnToSend),
    );
  }, [id, search.returnToSend]);

  useEffect(() => {
    if (q.data && !dirty) setTex(q.data.version.tex_content);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { id, tex } }),
    onSuccess: () => { setDirty(false); toast.success("Saved"); qc.invalidateQueries({ queryKey: ["resume-version", id] }); },
    onError: (e) => toast.error("Save failed", { description: (e as Error).message }),
  });

  // Auto-save 1.5s after the user stops editing.
  useEffect(() => {
    if (!dirty || save.isPending) return;
    const t = setTimeout(() => save.mutate(), 1500);
    return () => clearTimeout(t);
  }, [tex, dirty]);

  const uploadPdf = useMutation({
    mutationFn: (b64: string) => uploadPdfFn({ data: { id, pdfBase64: b64 } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resume-version", id] });
      qc.invalidateQueries({ queryKey: ["resumes"] });
    },
  });

  const saveToLibrary = useMutation({
    mutationFn: () => saveLibraryFn({ data: { id } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["resumes"] });
      toast.success(r.updated ? "Updated in Resumes" : "Saved to Resumes", {
        description: `Folder: ${r.folder}`,
        action: {
          label: "Open Resumes",
          onClick: () => nav({ to: "/resumes" }),
        },
      });
    },
    onError: (e) => toast.error("Could not save to Resumes", { description: (e as Error).message }),
  });

  const saveAsMaster = useMutation({
    mutationFn: () => saveAsMasterFn({ data: { id } }),
    onSuccess: (proj) => {
      qc.invalidateQueries({ queryKey: ["resume-projects"] });
      toast.success(`Saved as Master resume "${proj.name}"`, {
        action: { label: "Open Resume Studio", onClick: () => nav({ to: "/resume-studio" }) },
      });
    },
    onError: (e) => toast.error("Could not save as Master", { description: (e as Error).message }),
  });

  const del = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Version deleted"); nav({ to: "/resume-studio" }); },
  });

  const improve = useMutation({
    mutationFn: (section: "summary" | "experience" | "projects" | "skills" | "ats") =>
      improveFn({ data: { id, section } }),
    onSuccess: (r) => { setTex(r.tex); setDirty(true); toast.success("AI updated the section"); },
    onError: (e) => toast.error("AI failed", { description: (e as Error).message }),
  });

  const draftEmail = useMutation({
    mutationFn: () => emailFn({ data: { versionId: id } }),
    onSuccess: (r) => {
      nav({
        to: "/send",
        search: { resumeVersionId: id, name: q.data?.version.job_title ?? "", company: q.data?.version.company ?? "" },
      });
      try {
        sessionStorage.setItem("resume-studio-email", JSON.stringify({ versionId: id, ...r }));
      } catch { /* ignore */ }
      toast.success("Draft ready — attaching in Send Email");
    },
    onError: (e) => toast.error("AI failed", { description: (e as Error).message }),
  });

  const pdfStale = compiledTex !== tex;

  /** Return to Send with existing email + this PDF — no new AI email. */
  const attachToExistingEmail = () => {
    if (!hasPdf) {
      toast.error("Compile the resume first", { description: "Click Compile in the preview to generate the PDF." });
      return;
    }
    if (pdfStale) {
      toast.error("Source changed since last compile", { description: "Re-compile so the newest PDF is attached." });
      return;
    }
    const existing = peekSendResumeHandoff();
    if (existing?.attachOnly) {
      saveSendResumeHandoff({ ...existing, resumeVersionId: id });
    } else {
      saveSendResumeHandoff({
        attachOnly: true,
        subject: "",
        body: "",
        company: q.data?.version.company ?? "",
        role: q.data?.version.job_title ?? "",
        resumeVersionId: id,
      });
    }
    // Keep this version linked to the company/role for future "Generate Resume" clicks.
    setLinkedResumeVersionId(
      {
        jobId: existing?.jobId,
        company: existing?.company || q.data?.version.company,
        role: existing?.role || q.data?.version.job_title,
      },
      id,
    );
    nav({
      to: "/send",
      search: {
        resumeVersionId: id,
        company: q.data?.version.company ?? "",
        name: q.data?.version.job_title ?? "",
        ...(existing?.jobId ? { jobId: existing.jobId } : {}),
      },
    });
    toast.success("Attaching resume to your email", {
      description: "Subject & body are unchanged.",
    });
  };

  const onSendClick = () => {
    // Re-check at click time — handoff / returnToSend must never AI-draft a new email.
    const handoff = peekSendResumeHandoff();
    if (handoff?.attachOnly || isReturnToSend(search.returnToSend) || attachOnlyHandoff) {
      attachToExistingEmail();
      return;
    }
    if (!hasPdf) {
      toast.error("Compile the resume first", { description: "Click Compile in the preview to generate resume.pdf." });
      return;
    }
    if (pdfStale) {
      toast.error("Source changed since last compile", { description: "Re-compile so the newest PDF is attached." });
      return;
    }
    draftEmail.mutate();
  };

  if (q.isLoading || !q.data) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
          <Skeleton className="h-[600px]" />
          <Skeleton className="h-[600px]" />
        </div>
      </div>
    );
  }

  const v = q.data.version;
  const score = v.ats_score ?? null;

  return (
    <div className="mx-auto max-w-7xl space-y-4 h-[calc(100vh-100px)] flex flex-col">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button asChild variant="ghost" size="sm">
            <Link to="/resume-studio"><ArrowLeft className="h-4 w-4 mr-1" /> All resumes</Link>
          </Button>
          <div className="min-w-0">
            <h1 className="page-title truncate">{v.job_title || "Untitled role"}{v.company ? ` · ${v.company}` : ""}</h1>
            <div className="text-xs text-muted-foreground">Version updated {new Date(v.updated_at).toLocaleString()}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {score !== null && (
            <Badge variant={score >= 75 ? "default" : score >= 50 ? "secondary" : "outline"} className="h-8 px-3 text-sm">
              ATS Score: {score}
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            <Save className="h-3.5 w-3.5 mr-1" /> {save.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => saveToLibrary.mutate()}
            disabled={!hasPdf || pdfStale || saveToLibrary.isPending}
            title={
              !hasPdf
                ? "Compile the PDF first"
                : pdfStale
                  ? "Re-compile so the newest PDF is saved"
                  : `Save PDF to Resumes → ${AI_JD_RESUME_FOLDER}`
            }
          >
            <FolderPlus className="h-3.5 w-3.5 mr-1" />
            {saveToLibrary.isPending ? "Saving…" : "Save to Resumes"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => saveAsMaster.mutate()}
            disabled={saveAsMaster.isPending}
            title="Save this .tex as a new Master resume, so you can Tailor/Duplicate from it later"
          >
            <Copy className="h-3.5 w-3.5 mr-1" />
            {saveAsMaster.isPending ? "Saving…" : "Save as Master"}
          </Button>
          <Button
            size="sm"
            onClick={onSendClick}
            disabled={draftEmail.isPending}
            title={
              !hasPdf
                ? "Compile first to generate resume.pdf"
                : pdfStale
                  ? "Source changed — re-compile before sending"
                  : attachOnlyHandoff
                    ? "Attach this PDF to your existing email (no new body)"
                    : "Attach the latest PDF and open the email composer"
            }
          >
            {attachOnlyHandoff ? (
              <><Paperclip className="h-3.5 w-3.5 mr-1" /> {!hasPdf ? "Compile to attach" : pdfStale ? "Re-compile to attach" : "Attach to email"}</>
            ) : (
              <><Send className="h-3.5 w-3.5 mr-1" /> {draftEmail.isPending ? "Drafting…" : !hasPdf ? "Compile to send" : pdfStale ? "Re-compile to send" : "Send with email"}</>
            )}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this version?")) del.mutate(); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setUpdateOpen(true)}>
          <Wand2 className="h-3.5 w-3.5 mr-1" /> Update Resume with AI
        </Button>
        {(["summary", "experience", "projects", "skills", "ats"] as const).map((s) => (
          <Button key={s} size="sm" variant="outline" onClick={() => improve.mutate(s)} disabled={improve.isPending}>
            <Wand2 className="h-3.5 w-3.5 mr-1" /> Improve {s === "ats" ? "ATS coverage" : s}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground self-center">
          Tip: select any LaTeX in the editor to get an inline “Ask AI” rewrite.
        </span>
      </div>

      <InsightsBar version={v} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 flex-1 min-h-0">
        <Card className="overflow-hidden flex flex-col min-h-0">
          <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
            <span>LaTeX source · {q.data.project?.main_tex_filename ?? "resume.tex"}</span>
            {dirty && <span className="text-amber-600 dark:text-amber-400">● Unsaved</span>}
          </div>
          <div className="flex-1 min-h-0 relative">
            <LatexEditor
              value={tex}
              onChange={(v) => { setTex(v); setDirty(true); }}
              errorLines={errorLines}
              onSelectionChange={setSelection}
              onReady={(api) => { editorApi.current = api; }}
            />
            <InlineAskAi
              selection={selection}
              versionId={id}
              document={tex}
              onReplace={(start, end, text) => {
                editorApi.current?.replaceRange(start, end, text);
                setDirty(true);
                setSelection(null);
              }}
            />
          </div>
        </Card>
        <Card className="overflow-hidden flex flex-col min-h-0">
          <LatexPreview
            tex={tex}
            filename={q.data.project?.main_tex_filename ?? "resume.tex"}
            downloadName={resumeFileBaseName({ fullName: prefs.data?.fullName ?? null, email: prefs.data?.email ?? null, company: v.company ?? null })}
            autoCompile
            onCompiled={(b64) => { setCompiledTex(tex); setHasPdf(true); uploadPdf.mutate(b64); }}
            onErrors={(errs) => setErrorLines(errs.map((e) => e.line ?? 0).filter((n) => n > 0))}
          />
        </Card>
      </div>

      <UpdateResumeDialog
        open={updateOpen}
        onOpenChange={setUpdateOpen}
        versionId={id}
        onApplied={(newTex) => { setTex(newTex); setDirty(false); qc.invalidateQueries({ queryKey: ["resume-version", id] }); }}
      />
    </div>
  );
}

function InsightsBar({ version }: { version: { matched_keywords: string[]; missing_keywords: string[]; strengths: string[]; suggestions: string[] } }) {
  const { matched_keywords, missing_keywords, strengths, suggestions } = version;
  const hasAny = matched_keywords.length || missing_keywords.length || strengths.length || suggestions.length;
  if (!hasAny) return null;
  return (
    <Card>
      <CardContent className="py-3 grid gap-3 md:grid-cols-4">
        <InsightCol icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />} title="Matched" items={matched_keywords} tone="ok" />
        <InsightCol icon={<AlertCircle className="h-3.5 w-3.5 text-amber-500" />} title="Missing" items={missing_keywords} tone="warn" />
        <InsightCol icon={<Sparkles className="h-3.5 w-3.5 text-primary" />} title="Strengths" items={strengths} />
        <InsightCol icon={<Wand2 className="h-3.5 w-3.5 text-primary" />} title="Suggestions" items={suggestions} />
      </CardContent>
    </Card>
  );
}

function InsightCol({ icon, title, items, tone }: { icon: React.ReactNode; title: string; items: string[]; tone?: "ok" | "warn" }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-1">
        {icon} {title}
      </div>
      {items.length ? (
        <div className="flex flex-wrap gap-1">
          {items.slice(0, 12).map((k, i) => (
            <Badge key={i} variant={tone === "ok" ? "secondary" : tone === "warn" ? "outline" : "outline"} className="text-[10px]">
              {k}
            </Badge>
          ))}
        </div>
      ) : <div className="text-xs text-muted-foreground">—</div>}
    </div>
  );
}
