import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listEmailDrafts, saveEmailDraft, getEmailDraft, deleteEmailDraft, type EmailDraft } from "@/lib/drafts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Save, FolderOpen, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export type DraftState = {
  name: string;
  gmailAccountId: string | null;
  templateId: string | null;
  resumeVersionId: string | null;
  recipients: string;
  subject: string;
  body: string;
  variables: Record<string, string>;
  resumeIds: string[];
  attachments: Array<{ filename: string; mimeType: string; size: number; base64?: string; storagePath?: string }>;
  company: string;
  role: string;
  jobDescription: string;
  instructions: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type LoadedDraft = { draft: EmailDraft; files: File[] };

export async function filesFromDraftAttachments(
  attachments: Array<{ filename: string; mimeType: string; size: number; storagePath: string; url: string | null }>,
): Promise<File[]> {
  const files: File[] = [];
  for (const a of attachments) {
    if (!a.url) continue;
    try {
      const buf = await (await fetch(a.url)).arrayBuffer();
      files.push(new File([buf], a.filename, { type: a.mimeType || "application/octet-stream" }));
    } catch {
      toast.error(`Could not restore ${a.filename}`);
    }
  }
  return files;
}

export function DraftManager({
  draftId,
  onDraftIdChange,
  getState,
  onLoad,
}: {
  draftId: string | null;
  onDraftIdChange: (id: string | null) => void;
  getState: () => Promise<DraftState>;
  onLoad: (loaded: LoadedDraft) => void;
}) {
  const qc = useQueryClient();
  const [openList, setOpenList] = useState(false);
  const [openSave, setOpenSave] = useState(false);
  const [name, setName] = useState("");

  const listFn = useServerFn(listEmailDrafts);
  const saveFn = useServerFn(saveEmailDraft);
  const getFn = useServerFn(getEmailDraft);
  const delFn = useServerFn(deleteEmailDraft);

  const drafts = useQuery({ queryKey: ["email-drafts"], queryFn: () => listFn(), enabled: openList });

  const save = useMutation({
    mutationFn: async () => {
      const state = await getState();
      return saveFn({
        data: {
          ...state,
          id: draftId ?? undefined,
          name: name.trim() || state.name || "Untitled draft",
          metadata: { ...(state.metadata ?? {}), autosave: false },
        },
      });
    },
    onSuccess: (r) => {
      onDraftIdChange(r.id);
      setOpenSave(false);
      qc.invalidateQueries({ queryKey: ["email-drafts"] });
      toast.success("Draft saved");
    },
    onError: (e) => toast.error("Could not save draft", { description: (e as Error).message }),
  });

  const load = useMutation({
    mutationFn: async (id: string) => {
      const r = await getFn({ data: { id } });
      const files = await filesFromDraftAttachments(r.attachments);
      return { draft: r.draft, files } as LoadedDraft;
    },
    onSuccess: (loaded) => {
      onLoad(loaded);
      onDraftIdChange(loaded.draft.id);
      setOpenList(false);
      toast.success(`Loaded “${loaded.draft.name}”`);
    },
    onError: (e) => toast.error("Could not load draft", { description: (e as Error).message }),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: (_r, id) => {
      if (draftId === id) onDraftIdChange(null);
      qc.invalidateQueries({ queryKey: ["email-drafts"] });
      toast.success("Draft deleted");
    },
    onError: (e) => toast.error("Could not delete draft", { description: (e as Error).message }),
  });

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-10 w-10"
          title={draftId ? "Update draft" : "Save draft"}
          onClick={() => setOpenSave(true)}
        >
          <Save className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-10 w-10"
          title="Drafts"
          onClick={() => setOpenList(true)}
        >
          <FolderOpen className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={openSave} onOpenChange={(o) => !save.isPending && setOpenSave(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save draft</DialogTitle>
            <DialogDescription>Recipients, subject, body, variables and attachments are stored so you can pick this up later.</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Draft name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Backend applications — Nov batch" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenSave(false)} disabled={save.isPending}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openList} onOpenChange={setOpenList}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Saved drafts</DialogTitle></DialogHeader>
          {drafts.isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (drafts.data?.length ?? 0) === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No drafts yet.</div>
          ) : (
            <div className="max-h-80 overflow-auto space-y-2">
              {drafts.data?.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{d.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {d.subject || "(no subject)"} · {new Date(d.updated_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => load.mutate(d.id)} disabled={load.isPending}>
                      {load.isPending ? "Loading…" : "Load"}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => del.mutate(d.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}