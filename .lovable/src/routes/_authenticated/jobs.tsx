import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listJobs,
  upsertJob,
  deleteJob,
  toggleJobBookmark,
  parseJobText,
  type Job,
} from "@/lib/jobs.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Bookmark, BookmarkCheck, Briefcase, Building2, MapPin, Plus, Search, Send, Share2, Sparkles, Trash2, Wand2, ExternalLink, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/jobs")({
  head: () => ({ meta: [{ title: "Jobs Board — Smart Email Sender" }] }),
  component: JobsPage,
});

type EditForm = {
  id?: string | null;
  title: string;
  company: string;
  location: string;
  work_mode: string;
  employment_type: string;
  experience: string;
  salary: string;
  description: string;
  responsibilities: string;
  skills: string;
  technologies: string;
  tags: string;
  recruiter_email: string;
  apply_url: string;
  company_website: string;
  source_url: string;
  is_public: boolean;
};

const blankForm = (): EditForm => ({
  id: null, title: "", company: "", location: "", work_mode: "", employment_type: "",
  experience: "", salary: "", description: "", responsibilities: "", skills: "",
  technologies: "", tags: "", recruiter_email: "", apply_url: "", company_website: "",
  source_url: "", is_public: true,
});

function toArr(s: string): string[] {
  return s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
}

function JobsPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const listFn = useServerFn(listJobs);
  const upsertFn = useServerFn(upsertJob);
  const delFn = useServerFn(deleteJob);
  const bookmarkFn = useServerFn(toggleJobBookmark);
  const parseFn = useServerFn(parseJobText);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "mine" | "bookmarked" | "remote" | "hybrid" | "onsite">("all");
  const [editOpen, setEditOpen] = useState(false);
  const [parseOpen, setParseOpen] = useState(false);
  const [parseText, setParseText] = useState("");
  const [form, setForm] = useState<EditForm>(blankForm());

  const jobsQ = useQuery({
    queryKey: ["jobs", filter, search],
    queryFn: () => listFn({
      data: {
        search: search || undefined,
        onlyMine: filter === "mine" || undefined,
        bookmarkedOnly: filter === "bookmarked" || undefined,
        workMode: (filter === "remote" || filter === "hybrid" || filter === "onsite") ? filter : undefined,
      },
    }),
  });

  const save = useMutation({
    mutationFn: (f: EditForm) => upsertFn({
      data: {
        id: f.id ?? undefined,
        title: f.title, company: f.company, location: f.location,
        work_mode: f.work_mode, employment_type: f.employment_type,
        experience: f.experience, salary: f.salary, description: f.description,
        responsibilities: toArr(f.responsibilities), skills: toArr(f.skills),
        technologies: toArr(f.technologies), tags: toArr(f.tags),
        recruiter_email: f.recruiter_email, apply_url: f.apply_url,
        company_website: f.company_website, source_url: f.source_url,
        is_public: f.is_public,
      },
    }),
    onSuccess: () => { toast.success("Job saved"); setEditOpen(false); qc.invalidateQueries({ queryKey: ["jobs"] }); },
    onError: (e) => toast.error("Save failed", { description: (e as Error).message }),
  });

  const parse = useMutation({
    mutationFn: (text: string) => parseFn({ data: { text } }),
    onSuccess: (p) => {
      setForm({
        id: null,
        title: p.title, company: p.company, location: p.location,
        work_mode: p.work_mode, employment_type: p.employment_type,
        experience: p.experience, salary: p.salary, description: p.description,
        responsibilities: p.responsibilities.join("\n"),
        skills: p.skills.join(", "),
        technologies: p.technologies.join(", "),
        tags: p.tags.join(", "),
        recruiter_email: p.recruiter_email, apply_url: p.apply_url,
        company_website: p.company_website, source_url: "",
        is_public: true,
      });
      setParseOpen(false); setParseText(""); setEditOpen(true);
      toast.success("Parsed — review and publish");
    },
    onError: (e) => toast.error("AI parse failed", { description: (e as Error).message }),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["jobs"] }); toast.success("Job removed"); },
  });

  const bookmark = useMutation({
    mutationFn: ({ jobId, bookmark }: { jobId: string; bookmark: boolean }) =>
      bookmarkFn({ data: { jobId, bookmark } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });

  const share = async (job: Job) => {
    const url = job.apply_url || job.source_url || window.location.href;
    const text = `${job.title} @ ${job.company}${job.location ? " · " + job.location : ""}`;
    try {
      if (navigator.share) await navigator.share({ title: text, text, url });
      else { await navigator.clipboard.writeText(`${text}\n${url}`); toast.success("Copied to clipboard"); }
    } catch { /* user canceled */ }
  };

  const openEdit = (j: Job) => {
    setForm({
      id: j.id, title: j.title, company: j.company, location: j.location,
      work_mode: j.work_mode, employment_type: j.employment_type,
      experience: j.experience, salary: j.salary, description: j.description,
      responsibilities: j.responsibilities.join("\n"),
      skills: j.skills.join(", "),
      technologies: j.technologies.join(", "),
      tags: j.tags.join(", "),
      recruiter_email: j.recruiter_email, apply_url: j.apply_url,
      company_website: j.company_website, source_url: j.source_url,
      is_public: j.is_public,
    });
    setEditOpen(true);
  };

  const generateResume = (j: Job) => {
    const params = new URLSearchParams({
      jobId: j.id,
      title: j.title,
      company: j.company,
      jd: j.description || [j.title, j.company, j.location, j.description, j.responsibilities.join("\n"), "Skills: " + j.skills.join(", ")].filter(Boolean).join("\n"),
    });
    nav({ to: "/resume-studio", search: Object.fromEntries(params) as never });
  };

  const generateEmail = (j: Job) => {
    nav({
      to: "/send",
      search: {
        to: j.recruiter_email || undefined,
        name: "",
        company: j.company,
      } as never,
    });
  };

  const filters: { key: typeof filter; label: string }[] = [
    { key: "all", label: "All" }, { key: "mine", label: "Mine" }, { key: "bookmarked", label: "Bookmarked" },
    { key: "remote", label: "Remote" }, { key: "hybrid", label: "Hybrid" }, { key: "onsite", label: "On-site" },
  ];

  const jobs = jobsQ.data ?? [];
  const shown = useMemo(() => jobs, [jobs]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Briefcase className="h-6 w-6" /> Community Jobs Board</h1>
          <p className="text-sm text-muted-foreground">Discover opportunities shared by other users. Generate tailored resumes in one click.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={parseOpen} onOpenChange={setParseOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Sparkles className="h-4 w-4 mr-1" /> AI Parse</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader><DialogTitle>Paste job info</DialogTitle></DialogHeader>
              <Textarea
                rows={12}
                placeholder="Paste a LinkedIn / Greenhouse / Lever / email / raw JD…"
                value={parseText}
                onChange={(e) => setParseText(e.target.value)}
              />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setParseOpen(false)}>Cancel</Button>
                <Button onClick={() => parse.mutate(parseText)} disabled={parse.isPending || parseText.trim().length < 20}>
                  <Wand2 className="h-4 w-4 mr-1" /> {parse.isPending ? "Parsing…" : "Extract fields"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button onClick={() => { setForm(blankForm()); setEditOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Publish job
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="py-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search by title, company, location…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1">
            {filters.map((f) => (
              <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>
                {f.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {jobsQ.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : shown.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">No jobs yet. Publish one or use AI Parse.</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((j) => {
            const bookmarked = (j as Job & { bookmarked: boolean }).bookmarked;
            const isMine = (j as Job & { isMine: boolean }).isMine;
            return (
              <Card key={j.id} className="hover:shadow-sm transition">
                <CardContent className="py-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{j.title}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                        <Building2 className="h-3.5 w-3.5" /> {j.company}
                        {j.location && <><span className="mx-1">·</span><MapPin className="h-3.5 w-3.5" /> {j.location}</>}
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => bookmark.mutate({ jobId: j.id, bookmark: !bookmarked })} title={bookmarked ? "Remove bookmark" : "Bookmark"}>
                      {bookmarked ? <BookmarkCheck className="h-4 w-4 text-primary" /> : <Bookmark className="h-4 w-4" />}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {j.work_mode && <Badge variant="secondary">{j.work_mode}</Badge>}
                    {j.employment_type && <Badge variant="outline">{j.employment_type}</Badge>}
                    {j.experience && <Badge variant="outline">{j.experience}</Badge>}
                    {j.salary && <Badge variant="outline">{j.salary}</Badge>}
                    {j.technologies.slice(0, 6).map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                  </div>
                  {j.description && (
                    <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-line">{j.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {j.apply_url && (
                      <Button size="sm" asChild variant="outline">
                        <a href={j.apply_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Apply</a>
                      </Button>
                    )}
                    <Button size="sm" onClick={() => generateResume(j)}><Wand2 className="h-3.5 w-3.5 mr-1" /> Generate Resume</Button>
                    <Button size="sm" variant="outline" onClick={() => generateEmail(j)}><Send className="h-3.5 w-3.5 mr-1" /> Generate Email</Button>
                    <Button size="sm" variant="ghost" onClick={() => share(j)}><Share2 className="h-3.5 w-3.5" /></Button>
                    {isMine && <>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(j)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this job?")) del.mutate(j.id); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "Edit job" : "Publish new job"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Title *"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Company *"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
            <Field label="Location"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
            <Field label="Work mode"><Input placeholder="remote / hybrid / onsite" value={form.work_mode} onChange={(e) => setForm({ ...form, work_mode: e.target.value })} /></Field>
            <Field label="Employment type"><Input placeholder="full-time / intern / contract" value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })} /></Field>
            <Field label="Experience"><Input value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} /></Field>
            <Field label="Salary"><Input value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></Field>
            <Field label="Recruiter email"><Input value={form.recruiter_email} onChange={(e) => setForm({ ...form, recruiter_email: e.target.value })} /></Field>
            <Field label="Apply URL"><Input value={form.apply_url} onChange={(e) => setForm({ ...form, apply_url: e.target.value })} /></Field>
            <Field label="Company website"><Input value={form.company_website} onChange={(e) => setForm({ ...form, company_website: e.target.value })} /></Field>
            <div className="md:col-span-2"><Field label="Description"><Textarea rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field></div>
            <div className="md:col-span-2"><Field label="Responsibilities (one per line)"><Textarea rows={4} value={form.responsibilities} onChange={(e) => setForm({ ...form, responsibilities: e.target.value })} /></Field></div>
            <Field label="Skills (comma-separated)"><Textarea rows={2} value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} /></Field>
            <Field label="Technologies (comma-separated)"><Textarea rows={2} value={form.technologies} onChange={(e) => setForm({ ...form, technologies: e.target.value })} /></Field>
            <div className="md:col-span-2"><Field label="Tags (comma-separated)"><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></Field></div>
            <label className="md:col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_public} onChange={(e) => setForm({ ...form, is_public: e.target.checked })} />
              Share publicly with the community
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate(form)} disabled={save.isPending || !form.title.trim() || !form.company.trim()}>
              {save.isPending ? "Saving…" : form.id ? "Save changes" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}