import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTemplates, upsertTemplate, deleteTemplate, duplicateTemplate, setDefaultTemplate, setTemplatePublic, listPublicTemplates, saveMarketplaceTemplate } from "@/lib/templates.functions";
import { updateTemplateByJD } from "@/lib/ai-template.functions";
import { listResumes } from "@/lib/resumes.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Copy, LayoutTemplate, Star, Globe, Sparkles, Search, Download, Eye } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "./dashboard";
import { extractVariables } from "@/lib/templating";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({ meta: [{ title: "My Templates — Smart Email Sender" }] }),
  component: TemplatesPage,
});

type Tpl = { id: string; name: string; subject: string; body: string; preferred_resume_id?: string | null; is_default?: boolean; is_public?: boolean; category?: string | null };

function TemplatesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTemplates);
  const upsertFn = useServerFn(upsertTemplate);
  const delFn = useServerFn(deleteTemplate);
  const dupFn = useServerFn(duplicateTemplate);
  const resumesFn = useServerFn(listResumes);
  const defFn = useServerFn(setDefaultTemplate);
  const pubFn = useServerFn(setTemplatePublic);
  const pubListFn = useServerFn(listPublicTemplates);
  const saveFn = useServerFn(saveMarketplaceTemplate);
  const jdFn = useServerFn(updateTemplateByJD);

  const { data, isLoading } = useQuery({ queryKey: ["templates"], queryFn: () => listFn() });
  const { data: resumes } = useQuery({ queryKey: ["resumes"], queryFn: () => resumesFn() });

  const [editing, setEditing] = useState<Partial<Tpl> | null>(null);
  const [tab, setTab] = useState<"mine" | "gallery">("mine");
  const [gallerySearch, setGallerySearch] = useState("");
  const [jdOpen, setJdOpen] = useState(false);
  const [jdText, setJdText] = useState("");
  const [previewTpl, setPreviewTpl] = useState<{ name: string; subject: string; body: string } | null>(null);

  const gallery = useQuery({
    queryKey: ["gallery", gallerySearch],
    queryFn: () => pubListFn({ data: { search: gallerySearch } }),
    enabled: tab === "gallery",
  });

  const save = useMutation({
    mutationFn: (input: Partial<Tpl>) => upsertFn({ data: {
      id: input.id ?? null,
      name: input.name ?? "",
      subject: input.subject ?? "",
      body: input.body ?? "",
      preferredResumeId: input.preferred_resume_id ?? null,
    } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); toast.success("Template saved"); setEditing(null); },
    onError: (e) => toast.error("Save failed", { description: (e as Error).message }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); toast.success("Deleted"); },
  });
  const dup = useMutation({
    mutationFn: (id: string) => dupFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); toast.success("Duplicated"); },
  });
  const markDefault = useMutation({
    mutationFn: (id: string) => defFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); toast.success("Set as default"); },
  });
  const publish = useMutation({
    mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean }) => pubFn({ data: { id, isPublic } }),
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ["templates"] }); toast.success(v.isPublic ? "Published to gallery" : "Unpublished"); },
  });
  const saveFromGallery = useMutation({
    mutationFn: (id: string) => saveFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); qc.invalidateQueries({ queryKey: ["gallery"] }); toast.success("Saved to My Templates"); },
    onError: (e) => toast.error("Save failed", { description: (e as Error).message }),
  });
  const jdUpdate = useMutation({
    mutationFn: () => jdFn({ data: { subject: editing?.subject ?? "", body: editing?.body ?? "", jobDescription: jdText } }),
    onSuccess: (r) => {
      setEditing((cur) => cur ? { ...cur, subject: r.subject, body: r.body } : cur);
      setJdOpen(false); setJdText("");
      toast.success("Template updated to match the JD");
    },
    onError: (e) => toast.error("AI update failed", { description: (e as Error).message }),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground">Use <code className="text-xs bg-muted px-1 py-0.5 rounded">{`{{placeholder}}`}</code> syntax to insert dynamic fields.</p>
        </div>
        <Button onClick={() => setEditing({ name: "", subject: "", body: "" })}><Plus className="h-4 w-4 mr-2" />New template</Button>
      </div>

      <div className="flex gap-1 border-b border-border">
        <button className={`px-3 py-2 text-sm ${tab === "mine" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`} onClick={() => setTab("mine")}>My Templates</button>
        <button className={`px-3 py-2 text-sm ${tab === "gallery" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`} onClick={() => setTab("gallery")}>Gallery</button>
      </div>

      {tab === "mine" ? (
      isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
      ) : data?.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((t) => {
            const vars = extractVariables(`${t.subject}\n${t.body}`);
            return (
              <Card key={t.id}>
                <CardContent className="py-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate flex items-center gap-1.5">
                        {t.name}
                        {t.is_default && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                        {t.is_public && <Badge variant="outline" className="text-[10px] gap-1"><Globe className="h-2.5 w-2.5" />Public</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{t.subject || "No subject"}</div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" title={t.is_default ? "Default" : "Set as default"} onClick={() => markDefault.mutate(t.id)}><Star className={`h-4 w-4 ${t.is_default ? "fill-current text-amber-500" : ""}`} /></Button>
                      <Button size="icon" variant="ghost" title={t.is_public ? "Unpublish" : "Publish to gallery"} onClick={() => publish.mutate({ id: t.id, isPublic: !t.is_public })}><Globe className={`h-4 w-4 ${t.is_public ? "text-primary" : ""}`} /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditing(t)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => dup.mutate(t.id)}><Copy className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Delete "${t.name}"?`)) remove.mutate(t.id); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  {vars.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {vars.map((v) => <span key={v} className="text-xs bg-accent text-accent-foreground rounded-full px-2 py-0.5">{`{{${v}}}`}</span>)}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card><CardContent><EmptyState icon={LayoutTemplate} title="No templates yet" desc="Create your first template to get going." action={<Button onClick={() => setEditing({ name: "", subject: "", body: "" })}><Plus className="h-4 w-4 mr-2" />New template</Button>} /></CardContent></Card>
      )
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={gallerySearch} onChange={(e) => setGallerySearch(e.target.value)} placeholder="Search public templates…" className="pl-9" />
          </div>
          {gallery.isLoading ? (
            <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}</div>
          ) : gallery.data?.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {gallery.data.map((g) => (
                <Card key={g.id}>
                  <CardContent className="py-5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{g.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{g.subject || "No subject"}</div>
                      </div>
                      <Badge variant="secondary" className="gap-1 text-[10px]"><Download className="h-2.5 w-2.5" />{g.saves_count ?? 0}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      by {g.author?.full_name ?? g.author?.email ?? "Anonymous"}
                      {g.category ? ` · ${g.category}` : ""}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => setPreviewTpl({ name: g.name, subject: g.subject, body: g.body })}>
                        <Eye className="h-3.5 w-3.5 mr-1" /> Preview
                      </Button>
                      <Button size="sm" disabled={g.isSaved || g.isMine || saveFromGallery.isPending} onClick={() => saveFromGallery.mutate(g.id)}>
                        <Download className="h-3.5 w-3.5 mr-1" /> {g.isMine ? "Yours" : g.isSaved ? "Saved" : "Save to My Templates"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card><CardContent><EmptyState icon={LayoutTemplate} title="Gallery is empty" desc="Publish one of your own to seed the marketplace." /></CardContent></Card>
          )}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit template" : "New template"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Job application" /></div>
              <div><Label>Subject</Label><Input value={editing.subject ?? ""} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} placeholder="Application for {{position}}" /></div>
              <div>
                <div className="flex items-center justify-between">
                  <Label>Body</Label>
                  {editing?.id && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setJdOpen(true)}>
                      <Sparkles className="h-3.5 w-3.5 mr-1" /> Update via JD
                    </Button>
                  )}
                </div>
                <Textarea rows={10} value={editing.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} placeholder={"Hello {{name}},\n\nI'm interested in the {{position}} role at {{company}}.\n\nThanks,\n{{sender_name}}"} />
              </div>
              <div>
                <Label>Preferred resume (optional)</Label>
                <Select
                  value={editing.preferred_resume_id ?? "none"}
                  onValueChange={(v) => setEditing({ ...editing, preferred_resume_id: v === "none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {resumes?.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}{r.is_default ? " · Default" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Auto-attaches on the Send page when this template is selected.</p>
              </div>
              <p className="text-xs text-muted-foreground">Detected variables: {extractVariables(`${editing.subject ?? ""}\n${editing.body ?? ""}`).map((v) => `{{${v}}}`).join(", ") || "none"}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => editing && save.mutate(editing)} disabled={save.isPending || !editing?.name?.trim()}>{save.isPending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={jdOpen} onOpenChange={(o) => { setJdOpen(o); if (!o) setJdText(""); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Update template via Job Description</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Paste a JD — the AI will tweak the subject and body (~10%) to align with it. Your placeholders and structure stay intact.</p>
          <Textarea rows={10} value={jdText} onChange={(e) => setJdText(e.target.value)} placeholder="Paste the job description here…" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setJdOpen(false)}>Cancel</Button>
            <Button onClick={() => jdUpdate.mutate()} disabled={jdUpdate.isPending || jdText.trim().length < 10}>
              <Sparkles className="h-4 w-4 mr-2" /> {jdUpdate.isPending ? "Rewriting…" : "Update template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewTpl} onOpenChange={(o) => !o && setPreviewTpl(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{previewTpl?.name}</DialogTitle></DialogHeader>
          {previewTpl && (
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Subject:</span> {previewTpl.subject}</div>
              <div className="whitespace-pre-wrap border-t border-border pt-2">{previewTpl.body}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}