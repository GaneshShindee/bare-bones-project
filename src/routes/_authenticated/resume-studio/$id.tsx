import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getResumeVersion,
  updateResumeVersionTex,
  uploadResumeVersionPdf,
  deleteResumeVersion,
  improveResumeSection,
  generateApplicationEmail,
} from "@/lib/resume-studio.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LatexEditor } from "@/components/latex-editor";
import { LatexPreview } from "@/components/latex-preview";
import { ArrowLeft, Save, Wand2, Sparkles, Trash2, Send, CheckCircle2, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/resume-studio/$id")({
  head: () => ({ meta: [{ title: "Resume workspace — Smart Email Sender" }] }),
  component: WorkspacePage,
});

function WorkspacePage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();

  const getFn = useServerFn(getResumeVersion);
  const saveFn = useServerFn(updateResumeVersionTex);
  const uploadPdfFn = useServerFn(uploadResumeVersionPdf);
  const delFn = useServerFn(deleteResumeVersion);
  const improveFn = useServerFn(improveResumeSection);
  const emailFn = useServerFn(generateApplicationEmail);

  const q = useQuery({ queryKey: ["resume-version", id], queryFn: () => getFn({ data: { id } }) });
  const [tex, setTex] = useState("");
  const [dirty, setDirty] = useState(false);
  const [errorLines, setErrorLines] = useState<number[]>([]);
  const [compiledTex, setCompiledTex] = useState<string | null>(null);
  const [hasPdf, setHasPdf] = useState(false);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tex, dirty]);

  const uploadPdf = useMutation({
    mutationFn: (b64: string) => uploadPdfFn({ data: { id, pdfBase64: b64 } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resume-version", id] }),
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
      // Store the draft in sessionStorage so the send page can pick it up if needed.
      try {
        sessionStorage.setItem("resume-studio-email", JSON.stringify({ versionId: id, ...r }));
      } catch { /* ignore */ }
      toast.success("Draft ready — attaching in Send Email");
    },
    onError: (e) => toast.error("AI failed", { description: (e as Error).message }),
  });

  if (q.isLoading || !q.data) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
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
            <h1 className="text-xl font-semibold tracking-tight truncate">{v.job_title || "Untitled role"}{v.company ? ` · ${v.company}` : ""}</h1>
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
          <Button size="sm" onClick={() => draftEmail.mutate()} disabled={draftEmail.isPending}>
            <Send className="h-3.5 w-3.5 mr-1" /> {draftEmail.isPending ? "Drafting…" : "Send with email"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this version?")) del.mutate(); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["summary", "experience", "projects", "skills", "ats"] as const).map((s) => (
          <Button key={s} size="sm" variant="outline" onClick={() => improve.mutate(s)} disabled={improve.isPending}>
            <Wand2 className="h-3.5 w-3.5 mr-1" /> Improve {s === "ats" ? "ATS coverage" : s}
          </Button>
        ))}
      </div>

      <InsightsBar version={v} />

      <div className="grid gap-3 lg:grid-cols-2 flex-1 min-h-0">
        <Card className="overflow-hidden flex flex-col min-h-0">
          <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
            <span>LaTeX source · {q.data.project?.main_tex_filename ?? "resume.tex"}</span>
            {dirty && <span className="text-amber-600 dark:text-amber-400">● Unsaved</span>}
          </div>
          <div className="flex-1 min-h-0">
            <LatexEditor value={tex} onChange={(v) => { setTex(v); setDirty(true); }} errorLines={errorLines} />
          </div>
        </Card>
        <Card className="overflow-hidden flex flex-col min-h-0">
          <LatexPreview
            tex={tex}
            filename={q.data.project?.main_tex_filename ?? "resume.tex"}
            downloadName={`${(v.company || "resume").replace(/[^A-Za-z0-9]+/g, "_")}_${(v.job_title || "role").replace(/[^A-Za-z0-9]+/g, "_")}`}
            autoCompile
            onCompiled={(b64) => uploadPdf.mutate(b64)}
            onErrors={(errs) => setErrorLines(errs.map((e) => e.line ?? 0).filter((n) => n > 0))}
          />
        </Card>
      </div>
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
