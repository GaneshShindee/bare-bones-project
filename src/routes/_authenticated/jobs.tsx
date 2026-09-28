import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listJobs,
  listJobFilterOptions,
  upsertJob,
  deleteJob,
  toggleJobBookmark,
  parseJobText,
  parseJobFromUrl,
  type Job,
} from "@/lib/jobs.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Bookmark, BookmarkCheck, Briefcase, Building2, MapPin, Plus, Search, Send, Share2, Sparkles, Trash2, Wand2, ExternalLink, Pencil, CalendarDays, Link2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { relativeTime } from "@/lib/user-agent";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JobSourcesDialog } from "@/components/job-sources-dialog";
import { getLinkedResumeVersionId } from "@/lib/job-resume-link";

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

const JOBS_PAGE_SIZE = 30;

function JobsPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const listFn = useServerFn(listJobs);
  const filterOptionsFn = useServerFn(listJobFilterOptions);
  const upsertFn = useServerFn(upsertJob);
  const delFn = useServerFn(deleteJob);
  const bookmarkFn = useServerFn(toggleJobBookmark);
  const parseFn = useServerFn(parseJobText);
  const parseUrlFn = useServerFn(parseJobFromUrl);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "mine" | "bookmarked" | "remote" | "hybrid" | "onsite">("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [experienceFilter, setExperienceFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [editOpen, setEditOpen] = useState(false);
  const [parseOpen, setParseOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [parseText, setParseText] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [form, setForm] = useState<EditForm>(blankForm());

  // Every filter/search setter resets back to page 1, since the current page may no longer exist.
  const setSearchAndReset = (v: string) => { setSearch(v); setPage(1); };
  const setFilterAndReset = (v: typeof filter) => { setFilter(v); setPage(1); };
  const setDateFilterAndReset = (v: typeof dateFilter) => { setDateFilter(v); setPage(1); };
  const setRoleFilterAndReset = (v: string) => { setRoleFilter(v); setPage(1); };
  const setExperienceFilterAndReset = (v: string) => { setExperienceFilter(v); setPage(1); };
  const clearAdvancedFilters = () => {
    setDateFilter("all");
    setRoleFilter("all");
    setExperienceFilter("all");
    setPage(1);
  };

  const onlyMine = filter === "mine" || undefined;
  const bookmarkedOnly = filter === "bookmarked" || undefined;
  const workMode = (filter === "remote" || filter === "hybrid" || filter === "onsite") ? filter : undefined;

  const jobsQ = useQuery({
    queryKey: ["jobs", filter, search, dateFilter, roleFilter, experienceFilter, page],
    queryFn: () => listFn({
      data: {
        search: search || undefined,
        onlyMine,
        bookmarkedOnly,
        workMode,
        dateFilter,
        role: roleFilter !== "all" ? roleFilter : undefined,
        experience: experienceFilter !== "all" ? experienceFilter : undefined,
        page,
        pageSize: JOBS_PAGE_SIZE,
      },
    }),
  });

  // Role/experience dropdown options: contextual to search/mine/bookmarked/date, but independent
  // of pagination (and of role/experience themselves) so a 30-row page doesn't starve the list.
  const filterOptionsQ = useQuery({
    queryKey: ["job-filter-options", filter, search, dateFilter],
    queryFn: () => filterOptionsFn({ data: { search: search || undefined, onlyMine, bookmarkedOnly, workMode, dateFilter } }),
  });

  const save = useMutation({
    mutationFn: (f: EditForm) => upsertFn({
      data: {
        id: f.id ?? undefined,
        title: f.title || "Untitled role",
        company: f.company || "Unknown company",
        location: f.location, work_mode: f.work_mode, employment_type: f.employment_type,
        experience: f.experience, salary: f.salary, description: f.description,
        responsibilities: toArr(f.responsibilities), skills: toArr(f.skills),
        technologies: toArr(f.technologies), tags: toArr(f.tags),
        recruiter_email: f.recruiter_email, apply_url: f.apply_url,
        company_website: f.company_website, source_url: f.source_url,
        is_public: f.is_public,
      },
    }),
    onSuccess: () => {
      toast.success("Job saved");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["job-filter-options"] });
    },
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

  const parseUrl = useMutation({
    mutationFn: (url: string) => parseUrlFn({ data: { url } }),
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
        recruiter_email: p.recruiter_email,
        apply_url: p.apply_url,
        company_website: p.company_website,
        source_url: p.source_url,
        is_public: true,
      });
      setUrlOpen(false);
      setImportUrl("");
      setEditOpen(true);
      toast.success("Imported from URL — review and publish");
    },
    onError: (e) => toast.error("URL import failed", { description: (e as Error).message }),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["job-filter-options"] });
      toast.success("Job removed");
    },
  });

  const bookmark = useMutation({
    mutationFn: ({ jobId, bookmark }: { jobId: string; bookmark: boolean }) =>
      bookmarkFn({ data: { jobId, bookmark } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["job-filter-options"] });
    },
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
    const linked = getLinkedResumeVersionId({ jobId: j.id, company: j.company, role: j.title });
    if (linked) {
      nav({
        to: "/resume-studio/$id",
        params: { id: linked },
      });
      return;
    }
    nav({
      to: "/resume-studio",
      search: {
        jobId: j.id,
        title: j.title,
        company: j.company,
      } as never,
    });
  };

  const generateEmail = (j: Job) => {
    nav({
      to: "/send",
      search: {
        to: j.recruiter_email || undefined,
        company: j.company,
        jobId: j.id,
      } as never,
    });
  };

  const filters: { key: typeof filter; label: string }[] = [
    { key: "all", label: "All" }, { key: "mine", label: "Mine" }, { key: "bookmarked", label: "Bookmarked" },
    { key: "remote", label: "Remote" }, { key: "hybrid", label: "Hybrid" }, { key: "onsite", label: "On-site" },
  ];

  const shown = jobsQ.data?.rows ?? [];
  const total = jobsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / JOBS_PAGE_SIZE));
  const roleOptions = filterOptionsQ.data?.roles ?? [];
  const experienceOptions = filterOptionsQ.data?.experiences ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title flex items-center gap-2"><Briefcase className="h-4 w-4 shrink-0" /> Community Jobs Board</h1>
        </div>
        <div className="flex gap-1.5 sm:gap-2 w-full sm:w-auto flex-nowrap sm:flex-wrap">
          <Button variant="outline" className="flex-1 sm:flex-none px-2 sm:px-4" onClick={() => setSourcesOpen(true)}>
            <RefreshCw className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Sync sources</span>
          </Button>
          <Dialog open={urlOpen} onOpenChange={setUrlOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex-1 sm:flex-none px-2 sm:px-4">
                <Link2 className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Import URL</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>Import job from URL</DialogTitle></DialogHeader>
              <p className="text-xs text-muted-foreground">
                Paste a Greenhouse, Lever, LinkedIn, or company careers link. We fetch the page, extract fields with AI, then you review before publishing.
              </p>
              <Input
                placeholder="https://boards.greenhouse.io/…/jobs/…"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && importUrl.trim()) parseUrl.mutate(importUrl.trim());
                }}
              />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setUrlOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => parseUrl.mutate(importUrl.trim())}
                  disabled={parseUrl.isPending || !importUrl.trim()}
                >
                  <Wand2 className="h-4 w-4 mr-1" /> {parseUrl.isPending ? "Fetching…" : "Fetch & extract"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={parseOpen} onOpenChange={setParseOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex-1 sm:flex-none px-2 sm:px-4">
                <Sparkles className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">AI Parse</span>
              </Button>
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
                <Button onClick={() => parse.mutate(parseText)} disabled={parse.isPending || !parseText.trim()}>
                  <Wand2 className="h-4 w-4 mr-1" /> {parse.isPending ? "Parsing…" : "Extract fields"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button className="flex-1 sm:flex-none px-2 sm:px-4" onClick={() => { setForm(blankForm()); setEditOpen(true); }}>
            <Plus className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Publish job</span>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="py-3 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
              <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search by title, company, location…" value={search} onChange={(e) => setSearchAndReset(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1">
              {filters.map((f) => (
                <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilterAndReset(f.key)}>
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
              <Select value={dateFilter} onValueChange={(v) => setDateFilterAndReset(v as typeof dateFilter)}>
                <SelectTrigger className="w-full sm:w-[150px] h-9 px-2 sm:px-3.5">
                  <CalendarDays className="h-3.5 w-3.5 mr-1 sm:mr-1.5 shrink-0 opacity-60" />
                  <SelectValue placeholder="Added" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any date</SelectItem>
                  <SelectItem value="today">Added today</SelectItem>
                  <SelectItem value="week">Last 7 days</SelectItem>
                  <SelectItem value="month">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={setRoleFilterAndReset}>
                <SelectTrigger className="w-full sm:w-[200px] h-9 px-2 sm:px-3.5">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  {roleOptions.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={experienceFilter} onValueChange={setExperienceFilterAndReset}>
                <SelectTrigger className="w-full sm:w-[180px] h-9 px-2 sm:px-3.5">
                  <SelectValue placeholder="Experience" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All experience</SelectItem>
                  {experienceOptions.map((e) => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(dateFilter !== "all" || roleFilter !== "all" || experienceFilter !== "all") && (
              <Button
                size="sm"
                variant="ghost"
                className="w-full sm:w-auto"
                onClick={clearAdvancedFilters}
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {jobsQ.isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : shown.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">No jobs yet. Publish one or use AI Parse.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" /> Added {relativeTime(j.created_at)}
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

      {total > 0 && (
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {total} job{total === 1 ? "" : "s"}
          </p>
          <Pagination className="mx-0 w-auto">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  aria-disabled={page <= 1}
                  className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
                  onClick={(e) => { e.preventDefault(); setPage((p) => Math.max(1, p - 1)); }}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  aria-disabled={page >= totalPages}
                  className={page >= totalPages ? "pointer-events-none opacity-50" : undefined}
                  onClick={(e) => { e.preventDefault(); setPage((p) => Math.min(totalPages, p + 1)); }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b"><DialogTitle>{form.id ? "Edit job" : "Publish new job"}</DialogTitle></DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Company"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
            <Field label="Location"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
            <Field label="Work mode"><Input placeholder="remote / hybrid / onsite" value={form.work_mode} onChange={(e) => setForm({ ...form, work_mode: e.target.value })} /></Field>
            <Field label="Employment type"><Input placeholder="full-time / intern / contract" value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })} /></Field>
            <Field label="Experience"><Input value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} /></Field>
            <Field label="Salary"><Input value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></Field>
            <Field label="Recruiter email"><Input value={form.recruiter_email} onChange={(e) => setForm({ ...form, recruiter_email: e.target.value })} /></Field>
            <Field label="Apply URL"><Input value={form.apply_url} onChange={(e) => setForm({ ...form, apply_url: e.target.value })} /></Field>
            <Field label="Company website"><Input value={form.company_website} onChange={(e) => setForm({ ...form, company_website: e.target.value })} /></Field>
            <div className="md:col-span-2"><Field label="Source URL"><Input value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} placeholder="Original posting link" /></Field></div>
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
          <DialogFooter className="px-6 py-3 border-t">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
              {save.isPending ? "Saving…" : form.id ? "Save changes" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <JobSourcesDialog open={sourcesOpen} onOpenChange={setSourcesOpen} />
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