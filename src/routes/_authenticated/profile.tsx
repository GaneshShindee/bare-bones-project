import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getFullProfile,
  saveProfileDetails,
  upsertProfileEntry,
  deleteProfileEntry,
  reorderProfileEntries,
  parseResumeToProfileDraft,
  saveImportedProfile,
} from "@/lib/user-profile.functions";
import { listResumeProjects } from "@/lib/resume-studio.functions";
import {
  PROFILE_SECTIONS,
  SECTION_META,
  EMPTY_DETAILS,
  emptyEntry,
  entrySummary,
  type ProfileDetails,
  type ProfileEntry,
  type ProfileSection,
} from "@/lib/user-profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDown, ArrowUp, Pencil, Plus, Save, Sparkles, Trash2, UserRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your Profile — Smart Email Sender" },
      { name: "description", content: "Manage the master profile that powers every AI-generated resume, cover letter and email." },
      { property: "og:title", content: "Your Profile — Smart Email Sender" },
      { property: "og:description", content: "Your experience, skills and projects in one place — the single source of truth for AI generation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getFullProfile);
  const q = useQuery({ queryKey: ["full-profile"], queryFn: () => getFn() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["full-profile"] });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <UserRound className="h-6 w-6 text-primary" /> Your Profile
        </h1>
        <p className="text-sm text-muted-foreground">
          The single source of truth for every AI-generated resume, cover letter and email. AI never invents anything that is not here.
        </p>
      </div>

      {q.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <Tabs defaultValue="personal">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="personal">Personal</TabsTrigger>
            {PROFILE_SECTIONS.map((s) => (
              <TabsTrigger key={s} value={s}>{SECTION_META[s].label}</TabsTrigger>
            ))}
            <TabsTrigger value="import">Import</TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="mt-4">
            <PersonalTab details={q.data?.details ?? EMPTY_DETAILS} onSaved={invalidate} />
          </TabsContent>

          {PROFILE_SECTIONS.map((s) => (
            <TabsContent key={s} value={s} className="mt-4">
              <SectionTab
                section={s}
                entries={(q.data?.entries ?? []).filter((e) => e.section === s)}
                onChanged={invalidate}
              />
            </TabsContent>
          ))}

          <TabsContent value="import" className="mt-4">
            <ImportTab onImported={invalidate} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PersonalTab({ details, onSaved }: { details: ProfileDetails; onSaved: () => void }) {
  const saveFn = useServerFn(saveProfileDetails);
  const [form, setForm] = useState<ProfileDetails>(details);
  useEffect(() => setForm(details), [details]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: form }),
    onSuccess: () => { toast.success("Profile saved"); onSaved(); },
    onError: (e) => toast.error("Save failed", { description: (e as Error).message }),
  });

  const field = (key: keyof ProfileDetails, label: string, placeholder?: string) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={form[key]} placeholder={placeholder} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Personal information</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          {field("first_name", "First name")}
          {field("last_name", "Last name")}
          {field("email", "Email")}
          {field("phone", "Phone")}
          {field("location", "Location")}
          {field("linkedin", "LinkedIn")}
          {field("github", "GitHub")}
          {field("portfolio", "Portfolio")}
        </div>
        <div>
          <Label className="text-xs">Summary</Label>
          <Textarea rows={5} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="h-4 w-4 mr-1" /> {save.isPending ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function SectionTab({
  section,
  entries,
  onChanged,
}: {
  section: ProfileSection;
  entries: ProfileEntry[];
  onChanged: () => void;
}) {
  const meta = SECTION_META[section];
  const upsertFn = useServerFn(upsertProfileEntry);
  const delFn = useServerFn(deleteProfileEntry);
  const reorderFn = useServerFn(reorderProfileEntries);
  const [editing, setEditing] = useState<ProfileEntry | null>(null);

  const sorted = useMemo(() => [...entries].sort((a, b) => a.sort_order - b.sort_order), [entries]);

  const save = useMutation({
    mutationFn: (e: ProfileEntry) =>
      upsertFn({
        data: {
          id: e.id || null,
          section,
          title: e.title,
          subtitle: e.subtitle,
          location: e.location,
          start_date: e.start_date,
          end_date: e.end_date,
          is_current: e.is_current,
          description: e.description,
          bullets: e.bullets,
          tags: e.tags,
          url: e.url,
          sort_order: e.sort_order || sorted.length,
        },
      }),
    onSuccess: () => { toast.success("Saved"); setEditing(null); onChanged(); },
    onError: (e) => toast.error("Save failed", { description: (e as Error).message }),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); onChanged(); },
    onError: (e) => toast.error("Delete failed", { description: (e as Error).message }),
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderFn({ data: { ids } }),
    onSuccess: onChanged,
    onError: (e) => toast.error("Reorder failed", { description: (e as Error).message }),
  });

  const move = (index: number, dir: -1 | 1) => {
    const next = [...sorted];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next.map((e) => e.id));
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base">{meta.label}</CardTitle>
        <Button size="sm" onClick={() => setEditing(emptyEntry(section))}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add {meta.singular}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No {meta.label.toLowerCase()} yet.</p>
        ) : (
          sorted.map((e, i) => (
            <div key={e.id} className="rounded-lg border border-border p-3 flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="font-medium truncate">{e.title || "(untitled)"}</div>
                {entrySummary(e) && <div className="text-xs text-muted-foreground truncate">{entrySummary(e)}</div>}
                {e.description && <div className="text-xs text-muted-foreground line-clamp-2">{e.description}</div>}
                {e.bullets.length > 0 && (
                  <ul className="text-xs text-muted-foreground list-disc pl-4">
                    {e.bullets.slice(0, 3).map((b, k) => <li key={k} className="truncate">{b}</li>)}
                  </ul>
                )}
                {e.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {e.tags.slice(0, 12).map((t, k) => <Badge key={k} variant="outline" className="text-[10px]">{t}</Badge>)}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === sorted.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(e)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (confirm("Delete this entry?")) del.mutate(e.id); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
              </div>
            </div>
          ))
        )}
      </CardContent>

      <EntryDialog
        section={section}
        entry={editing}
        onClose={() => setEditing(null)}
        onSave={(e) => save.mutate(e)}
        saving={save.isPending}
      />
    </Card>
  );
}

function EntryDialog({
  section,
  entry,
  onClose,
  onSave,
  saving,
}: {
  section: ProfileSection;
  entry: ProfileEntry | null;
  onClose: () => void;
  onSave: (e: ProfileEntry) => void;
  saving: boolean;
}) {
  const meta = SECTION_META[section];
  const [form, setForm] = useState<ProfileEntry>(entry ?? emptyEntry(section));
  useEffect(() => { if (entry) setForm(entry); }, [entry]);
  const has = (k: string) => meta.fields.includes(k as never);

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{form.id ? `Edit ${meta.singular}` : `Add ${meta.singular}`}</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          {has("title") && (
            <div className="md:col-span-2">
              <Label className="text-xs">{meta.titleLabel}</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
          )}
          {has("subtitle") && (
            <div>
              <Label className="text-xs">{meta.subtitleLabel ?? "Subtitle"}</Label>
              <Input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
            </div>
          )}
          {has("location") && (
            <div>
              <Label className="text-xs">Location</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
          )}
          {has("url") && (
            <div>
              <Label className="text-xs">Link</Label>
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </div>
          )}
          {has("start_date") && (
            <div>
              <Label className="text-xs">Start</Label>
              <Input placeholder="Jan 2023" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
          )}
          {has("end_date") && (
            <div>
              <Label className="text-xs">End</Label>
              <Input placeholder="Dec 2024" value={form.end_date} disabled={form.is_current} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
          )}
          {has("is_current") && (
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={form.is_current} onCheckedChange={(v) => setForm({ ...form, is_current: v })} />
              <Label className="text-xs">Currently here</Label>
            </div>
          )}
          {has("description") && (
            <div className="md:col-span-2">
              <Label className="text-xs">Description</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          )}
          {has("bullets") && (
            <div className="md:col-span-2">
              <Label className="text-xs">{meta.bulletsLabel ?? "Bullets (one per line)"}</Label>
              <Textarea
                rows={5}
                value={form.bullets.join("\n")}
                onChange={(e) => setForm({ ...form, bullets: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })}
              />
            </div>
          )}
          {has("tags") && (
            <div className="md:col-span-2">
              <Label className="text-xs">{meta.tagsLabel ?? "Tags (comma-separated)"}</Label>
              <Textarea
                rows={2}
                value={form.tags.join(", ")}
                onChange={(e) => setForm({ ...form, tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={saving || !form.title.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

function ImportTab({ onImported }: { onImported: () => void }) {
  const parseFn = useServerFn(parseResumeToProfileDraft);
  const saveFn = useServerFn(saveImportedProfile);
  const projectsFn = useServerFn(listResumeProjects);
  const projects = useQuery({ queryKey: ["resume-projects"], queryFn: () => projectsFn() });

  const [text, setText] = useState("");
  const [projectId, setProjectId] = useState("");
  const [draft, setDraft] = useState<{ details: ProfileDetails; entries: Omit<ProfileEntry, "id">[] } | null>(null);
  const [replace, setReplace] = useState(true);

  const parse = useMutation({
    mutationFn: () => parseFn({ data: { text: text || null, resumeProjectId: projectId || null } }),
    onSuccess: (d) => { setDraft(d as never); toast.success("Extracted — review before saving"); },
    onError: (e) => toast.error("Import failed", { description: (e as Error).message }),
  });

  const commit = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          details: draft?.details,
          entries: (draft?.entries ?? []).map((e) => ({ ...e })),
          replaceSections: replace
            ? Array.from(new Set((draft?.entries ?? []).map((e) => e.section)))
            : [],
        },
      }),
    onSuccess: () => { toast.success("Profile updated"); setDraft(null); onImported(); },
    onError: (e) => toast.error("Save failed", { description: (e as Error).message }),
  });

  const onFile = async (f: File | null) => {
    if (!f) return;
    try {
      setText(await f.text());
      toast.success(`${f.name} loaded — click Extract`);
    } catch {
      toast.error("Could not read that file — paste the text instead");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Import from an existing resume</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {projects.data && projects.data.length > 0 && (
            <div>
              <Label className="text-xs">Use a master resume from Resume Studio</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Select a master resume (optional)" /></SelectTrigger>
                <SelectContent>
                  {projects.data.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">…or paste your resume text / upload a .tex or .txt file</Label>
            <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your resume here…" />
            <input
              type="file"
              accept=".tex,.txt,.md"
              className="mt-2 text-xs"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button onClick={() => parse.mutate()} disabled={parse.isPending || (!text.trim() && !projectId)}>
            <Sparkles className="h-4 w-4 mr-1" /> {parse.isPending ? "Extracting…" : "Extract profile"}
          </Button>
          <p className="text-xs text-muted-foreground">Nothing is saved until you review and confirm below.</p>
        </CardContent>
      </Card>

      {draft && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Review extracted profile</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              <span className="font-medium">
                {[draft.details.first_name, draft.details.last_name].filter(Boolean).join(" ") || "(no name found)"}
              </span>
              <div className="text-xs text-muted-foreground">
                {[draft.details.email, draft.details.phone, draft.details.location].filter(Boolean).join(" · ")}
              </div>
            </div>
            {draft.details.summary && <p className="text-xs text-muted-foreground">{draft.details.summary}</p>}
            <div className="space-y-2 max-h-72 overflow-auto">
              {draft.entries.map((e, i) => (
                <div key={i} className="rounded-md border border-border p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{SECTION_META[e.section].label}</Badge>
                    <span className="font-medium truncate">{e.title}</span>
                  </div>
                  {e.subtitle && <div className="text-muted-foreground">{e.subtitle}</div>}
                  {e.tags.length > 0 && <div className="text-muted-foreground">{e.tags.join(", ")}</div>}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 mt-1 px-2 text-[11px]"
                    onClick={() => setDraft({ ...draft, entries: draft.entries.filter((_, k) => k !== i) })}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={replace} onCheckedChange={setReplace} />
              <Label className="text-xs">Replace existing entries in the imported sections</Label>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => commit.mutate()} disabled={commit.isPending}>
                {commit.isPending ? "Saving…" : "Save to profile"}
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>Discard</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
