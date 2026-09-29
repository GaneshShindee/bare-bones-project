import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Upload, Star, Trash2, Pencil, Download, Eye, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  listResumes,
  createResume,
  renameResume,
  replaceResume,
  deleteResume,
  setDefaultResume,
  getResumeSignedUrl,
  type Resume,
} from "@/lib/resumes.functions";
import { isAllowedResumeFile, uploadResumeFile, formatBytes } from "@/lib/resumes";
import { EmptyState } from "./dashboard";

export const Route = createFileRoute("/_authenticated/resumes")({
  head: () => ({ meta: [{ title: "Resume Library — Smart Email Sender" }] }),
  component: ResumesPage,
});

function ResumesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listResumes);
  const createFn = useServerFn(createResume);
  const renameFn = useServerFn(renameResume);
  const replaceFn = useServerFn(replaceResume);
  const deleteFn = useServerFn(deleteResume);
  const setDefFn = useServerFn(setDefaultResume);
  const signFn = useServerFn(getResumeSignedUrl);

  const { data, isLoading } = useQuery({ queryKey: ["resumes"], queryFn: () => listFn() });

  const inputRef = useRef<HTMLInputElement | null>(null);
  const replaceRef = useRef<HTMLInputElement | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [renaming, setRenaming] = useState<Resume | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["resumes"] });

  const onPickUpload = async (file: File) => {
    const check = isAllowedResumeFile(file);
    if (!check.ok) { toast.error(check.reason); return; }
    setUploading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not signed in");
      const { path } = await uploadResumeFile(user.user.id, file);
      await createFn({
        data: {
          name: file.name.replace(/\.(pdf|docx?|DOCX?|PDF)$/, ""),
          originalFilename: file.name,
          storagePath: path,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        },
      });
      toast.success("Resume uploaded");
      invalidate();
    } catch (e) {
      toast.error("Upload failed", { description: (e as Error).message });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onReplace = async (id: string, file: File) => {
    const check = isAllowedResumeFile(file);
    if (!check.ok) { toast.error(check.reason); return; }
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not signed in");
      const { path } = await uploadResumeFile(user.user.id, file);
      await replaceFn({
        data: {
          id,
          originalFilename: file.name,
          storagePath: path,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        },
      });
      toast.success("Resume replaced");
      invalidate();
    } catch (e) {
      toast.error("Replace failed", { description: (e as Error).message });
    } finally {
      setReplacingId(null);
      if (replaceRef.current) replaceRef.current.value = "";
    }
  };

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Deleted"); },
    onError: (e) => toast.error((e as Error).message),
  });
  const setDefault = useMutation({
    mutationFn: (id: string) => setDefFn({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Default updated"); },
  });
  const save = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameFn({ data: { id, name } }),
    onSuccess: () => { invalidate(); toast.success("Renamed"); setRenaming(null); },
  });

  const open = async (id: string, download: boolean) => {
    try {
      const { url, filename } = await signFn({ data: { id, download } });
      if (download) {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      toast.error("Could not open file", { description: (e as Error).message });
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Resume Library</h1>
          <p className="text-sm text-muted-foreground">Upload up to 25 MB per file. PDF, DOC, DOCX.</p>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickUpload(f); }}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {uploading ? "Uploading…" : "Upload resume"}
          </Button>
        </div>
      </div>

      <input
        ref={replaceRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f && replacingId) onReplace(replacingId, f); }}
      />

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
      ) : data && data.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((r) => (
            <Card key={r.id}>
              <CardContent className="py-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-3">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary"><FileText className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-medium truncate">{r.name}</div>
                        {r.is_default && <Badge variant="secondary" className="gap-1"><Star className="h-3 w-3" /> Default</Badge>}
                        <Badge variant="outline" className="text-[10px]">v{r.version}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate" title={r.original_filename}>{r.original_filename}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(r.size_bytes)} · Uploaded {new Date(r.created_at).toLocaleDateString()} · Updated {new Date(r.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="ghost" onClick={() => open(r.id, false)}><Eye className="h-3.5 w-3.5 mr-1" /> Preview</Button>
                  <Button size="sm" variant="ghost" onClick={() => open(r.id, true)}><Download className="h-3.5 w-3.5 mr-1" /> Download</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setRenaming(r); setRenameValue(r.name); }}><Pencil className="h-3.5 w-3.5 mr-1" /> Rename</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setReplacingId(r.id); replaceRef.current?.click(); }}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Replace</Button>
                  {!r.is_default && <Button size="sm" variant="ghost" onClick={() => setDefault.mutate(r.id)}><Star className="h-3.5 w-3.5 mr-1" /> Set default</Button>}
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { if (confirm(`Delete "${r.name}"?`)) remove.mutate(r.id); }}><Trash2 className="h-3.5 w-3.5 mr-1" /> Delete</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent>
            <EmptyState
              icon={FileText}
              title="No resumes yet"
              desc="Upload PDFs, DOCs, or DOCXs you frequently attach to emails."
              action={<Button onClick={() => inputRef.current?.click()}><Upload className="h-4 w-4 mr-2" /> Upload resume</Button>}
            />
          </CardContent>
        </Card>
      )}

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename resume</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Display name</Label>
            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button onClick={() => renaming && save.mutate({ id: renaming.id, name: renameValue.trim() })} disabled={save.isPending || !renameValue.trim()}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}