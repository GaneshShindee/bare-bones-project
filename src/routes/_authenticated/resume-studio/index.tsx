import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listResumeProjects,
  createResumeProject,
  deleteResumeProject,
  listResumeVersions,
  generateResumeVersion,
} from "@/lib/resume-studio.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "../dashboard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Wand2, FileText, Sparkles, ArrowRight, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fileToBase64 } from "@/lib/resumes";
import { relativeTime } from "@/lib/user-agent";
import { z } from "zod";

const searchSchema = z.object({
  jd: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  jobId: z.string().optional(),
}).partial();

export const Route = createFileRoute("/_authenticated/resume-studio/")({
  head: () => ({ meta: [{ title: "AI Resume Studio — Smart Email Sender" }] }),
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  component: ResumeStudioPage,
});

function ResumeStudioPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const search = Route.useSearch();
  const listFn = useServerFn(listResumeProjects);
  const createFn = useServerFn(createResumeProject);
  const delFn = useServerFn(deleteResumeProject);
  const listVersionsFn = useServerFn(listResumeVersions);
  const genFn = useServerFn(generateResumeVersion);

  const projects = useQuery({ queryKey: ["resume-projects"], queryFn: () => listFn() });
  const versions = useQuery({ queryKey: ["resume-versions"], queryFn: () => listVersionsFn({ data: {} }) });

  const [createOpen, setCreateOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [genProjectId, setGenProjectId] = useState<string>("");
  const [prefill, setPrefill] = useState<{ jd: string; title: string; company: string } | null>(null);

  useEffect(() => {
    if ((search.jd || search.title || search.company) && projects.data?.length && !genOpen) {
      setGenProjectId(projects.data.find((p) => p.is_default)?.id ?? projects.data[0].id);
      setPrefill({ jd: search.jd ?? "", title: search.title ?? "", company: search.company ?? "" });
      setGenOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.jd, search.title, search.company, projects.data]);

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["resume-projects"] }); toast.success("Master resume deleted"); },
    onError: (e) => toast.error("Delete failed", { description: (e as Error).message }),
  });

  const create = useMutation({
    mutationFn: async (payload: { name: string; description: string; mainFile: File; extra: File[] }) => {
      const mainText = await payload.mainFile.text();
      const extras = await Promise.all(
        payload.extra.map(async (f) => ({
          filename: f.name,
          mimeType: f.type || "application/octet-stream",
          base64: await fileToBase64(f),
          size: f.size,
        })),
      );
      return createFn({
        data: {
          name: payload.name,
          description: payload.description || null,
          mainTexFilename: payload.mainFile.name,
          mainTexContent: mainText,
          extraFiles: extras,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resume-projects"] });
      toast.success("Master resume uploaded");
      setCreateOpen(false);
    },
    onError: (e) => toast.error("Upload failed", { description: (e as Error).message }),
  });

  const generate = useMutation({
    mutationFn: (payload: { projectId: string; jd: string; jobTitle: string; company: string; instructions: string }) =>
      genFn({
        data: {
          projectId: payload.projectId,
          jobDescription: payload.jd,
          jobTitle: payload.jobTitle || null,
          company: payload.company || null,
          customInstructions: payload.instructions || null,
        },
      }),
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ["resume-versions"] });
      toast.success("Tailored resume generated");
      setGenOpen(false);
      nav({ to: "/resume-studio/$id", params: { id: v.id } });
    },
    onError: (e) => toast.error("AI failed", { description: (e as Error).message }),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Wand2 className="h-6 w-6 text-primary" /> AI Resume Studio
          </h1>
          <p className="text-sm text-muted-foreground">Tailor an ATS-optimised resume to any job description — without ever fabricating facts.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <Upload className="h-4 w-4 mr-2" /> Upload master resume
          </Button>
          <Button onClick={() => { if (!projects.data?.length) { toast.error("Upload a master resume first"); return; } setGenProjectId(projects.data[0].id); setGenOpen(true); }}>
            <Sparkles className="h-4 w-4 mr-2" /> Generate for a JD
          </Button>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Master resumes</h2>
        {projects.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        ) : projects.data?.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {projects.data.map((p) => (
              <Card key={p.id}>
                <CardContent className="py-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" /> {p.name}
                      {p.is_default && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                    </div>
                    {p.description && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</div>}
                    <div className="text-xs text-muted-foreground mt-1">Main file: <code className="text-[11px]">{p.main_tex_filename}</code></div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => { setGenProjectId(p.id); setGenOpen(true); }}>
                      <Sparkles className="h-3.5 w-3.5 mr-1" /> Tailor
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this master resume and all versions?")) del.mutate(p.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState icon={FileText} title="No master resume yet" desc="Upload your .tex file (and any .cls/.sty assets) to start tailoring." />
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Recent tailored versions</h2>
        {versions.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : versions.data?.length ? (
          <Card>
            <CardContent className="py-2">
              <ul className="divide-y divide-border">
                {versions.data.map((v) => (
                  <li key={v.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{v.job_title || "Untitled role"}{v.company ? ` · ${v.company}` : ""}</div>
                      <div className="text-xs text-muted-foreground">{relativeTime(v.created_at)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {typeof v.ats_score === "number" && (
                        <Badge variant={v.ats_score >= 75 ? "default" : v.ats_score >= 50 ? "secondary" : "outline"}>
                          ATS {v.ats_score}
                        </Badge>
                      )}
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/resume-studio/$id" params={{ id: v.id }}>
                          Open <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : (
          <EmptyState icon={Sparkles} title="No tailored versions yet" desc="Paste a JD and let AI adapt your resume." />
        )}
      </section>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        pending={create.isPending}
        onSubmit={(v) => create.mutate(v)}
      />

      <GenerateDialog
        open={genOpen}
        onOpenChange={setGenOpen}
        pending={generate.isPending}
        projects={projects.data ?? []}
        projectId={genProjectId}
        setProjectId={setGenProjectId}
        onSubmit={(v) => generate.mutate(v)}
        initial={prefill}
      />
    </div>
  );
}

function CreateProjectDialog({
  open, onOpenChange, pending, onSubmit,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; pending: boolean;
  onSubmit: (v: { name: string; description: string; mainFile: File; extra: File[] }) => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [extra, setExtra] = useState<File[]>([]);
  const mainRef = useRef<HTMLInputElement | null>(null);
  const extraRef = useRef<HTMLInputElement | null>(null);
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setName(""); setDesc(""); setMainFile(null); setExtra([]); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Upload master LaTeX resume</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My master CV" />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Main .tex file</Label>
            <input ref={mainRef} type="file" accept=".tex,text/x-tex,application/x-tex" hidden onChange={(e) => setMainFile(e.target.files?.[0] ?? null)} />
            <Button variant="outline" onClick={() => mainRef.current?.click()} className="w-full justify-start">
              <Upload className="h-4 w-4 mr-2" /> {mainFile ? mainFile.name : "Choose resume.tex"}
            </Button>
          </div>
          <div>
            <Label>Project assets (optional: .cls, .sty, images…)</Label>
            <input ref={extraRef} type="file" multiple hidden onChange={(e) => setExtra(Array.from(e.target.files ?? []))} />
            <Button variant="outline" onClick={() => extraRef.current?.click()} className="w-full justify-start">
              <Upload className="h-4 w-4 mr-2" /> {extra.length ? `${extra.length} file(s) selected` : "Add project files"}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={pending || !name.trim() || !mainFile}
            onClick={() => onSubmit({ name: name.trim(), description: desc.trim(), mainFile: mainFile!, extra })}
          >
            {pending ? "Uploading…" : "Save master resume"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GenerateDialog({
  open, onOpenChange, pending, projects, projectId, setProjectId, onSubmit, initial,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; pending: boolean;
  projects: Array<{ id: string; name: string }>;
  projectId: string; setProjectId: (v: string) => void;
  onSubmit: (v: { projectId: string; jd: string; jobTitle: string; company: string; instructions: string }) => void;
  initial?: { jd: string; title: string; company: string } | null;
}) {
  const [jd, setJd] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [instructions, setInstructions] = useState("");
  useEffect(() => {
    if (open && initial) {
      setJd(initial.jd || "");
      setJobTitle(initial.title || "");
      setCompany(initial.company || "");
    }
  }, [open, initial]);
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setJd(""); setJobTitle(""); setCompany(""); setInstructions(""); } }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Generate a tailored resume</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Master resume</Label>
            <select
              className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Job title (optional)</Label>
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Senior Backend Engineer" />
            </div>
            <div>
              <Label>Company (optional)</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Corp" />
            </div>
          </div>
          <div>
            <Label>Job description</Label>
            <Textarea rows={8} value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the full JD here…" />
          </div>
          <div>
            <Label>Custom instructions (optional)</Label>
            <Textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Emphasise cloud infra experience, keep it to one page, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={pending || !projectId || jd.trim().length < 20}
            onClick={() => onSubmit({ projectId, jd: jd.trim(), jobTitle: jobTitle.trim(), company: company.trim(), instructions: instructions.trim() })}
          >
            {pending ? "Generating…" : <><Sparkles className="h-4 w-4 mr-2" /> Generate</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
