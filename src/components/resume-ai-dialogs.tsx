import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { updateResumeWithInstructions, rewriteResumeSelection } from "@/lib/resume-studio.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import type { EditorSelection } from "@/components/latex-editor";

const PRESETS = [
  "Tailor the whole resume to the target job description",
  "Make every bullet start with a strong action verb and add measurable impact where the facts allow",
  "Tighten the resume so it fits on a single page",
  "Increase ATS keyword coverage for the target role without inventing anything",
  "Rewrite the summary so it targets this specific role",
];

/** Full-document AI update driven by free-form instructions. */
export function UpdateResumeDialog({
  open,
  onOpenChange,
  versionId,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  versionId: string;
  onApplied: (tex: string, notes: string) => void;
}) {
  const [instructions, setInstructions] = useState("");
  const [jd, setJd] = useState("");
  const fn = useServerFn(updateResumeWithInstructions);

  const run = useMutation({
    mutationFn: () =>
      fn({ data: { id: versionId, instructions: instructions.trim(), jobDescription: jd.trim() || null } }),
    onSuccess: (r) => {
      onApplied(r.tex, r.notes ?? "");
      onOpenChange(false);
      setInstructions("");
      toast.success("Resume updated", { description: r.notes || undefined });
    },
    onError: (e) => toast.error("AI update failed", { description: (e as Error).message }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !run.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="h-4 w-4" /> Update resume with AI</DialogTitle>
          <DialogDescription>
            The AI rewrites content only — layout, packages and macros stay untouched, and nothing is invented beyond your profile.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>What should change?</Label>
            <Textarea
              rows={4}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Emphasise backend and cloud work, drop the older internships…"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setInstructions((cur) => (cur.trim() ? `${cur.trim()}\n${p}` : p))}
                  className="text-[11px] rounded-full border border-border bg-background px-2.5 py-1 hover:bg-accent transition-colors text-left"
                >
                  + {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Job description (optional — the saved one is used when empty)</Label>
            <Textarea rows={4} value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the job description…" className="text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={run.isPending}>Cancel</Button>
          <Button onClick={() => run.mutate()} disabled={run.isPending || instructions.trim().length < 3}>
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            {run.isPending ? "Updating…" : "Update resume"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Cursor-style inline "Ask AI": a floating button anchored to the current
 * Monaco selection that rewrites just that fragment.
 */
export function InlineAskAi({
  selection,
  versionId,
  document,
  onReplace,
}: {
  selection: EditorSelection | null;
  versionId: string;
  document: string;
  onReplace: (start: number, end: number, text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [frozen, setFrozen] = useState<EditorSelection | null>(null);
  const fn = useServerFn(rewriteResumeSelection);

  useEffect(() => {
    if (!open) setFrozen(null);
  }, [open]);

  const target = frozen ?? selection;

  const run = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("Nothing selected");
      return fn({
        data: {
          id: versionId,
          selection: target.text,
          instructions: instructions.trim(),
          context: document.slice(Math.max(0, target.start - 1500), target.end + 1500),
        },
      });
    },
    onSuccess: (r) => {
      if (target) onReplace(target.start, target.end, r.replacement);
      setOpen(false);
      setInstructions("");
      toast.success("Selection rewritten");
    },
    onError: (e) => toast.error("AI failed", { description: (e as Error).message }),
  });

  return (
    <>
      {selection && !open && (
        <div
          className="absolute z-20"
          style={{ top: Math.max(2, selection.top - 34), left: Math.max(8, selection.left - 20) }}
        >
          <Button
            size="sm"
            className="h-7 shadow-lg"
            onClick={() => { setFrozen(selection); setOpen(true); }}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Ask AI
          </Button>
        </div>
      )}
      <Dialog open={open} onOpenChange={(o) => !run.isPending && setOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Rewrite selection</DialogTitle>
            <DialogDescription>Only the highlighted LaTeX is replaced — the rest of the file is untouched.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <pre className="max-h-32 overflow-auto rounded-md border border-border bg-muted/40 p-2 text-[11px] whitespace-pre-wrap">
              {target?.text ?? ""}
            </pre>
            <div>
              <Label>Instruction</Label>
              <Textarea
                rows={3}
                autoFocus
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Make this bullet quantified and ATS-friendly"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && instructions.trim().length > 1) run.mutate();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={run.isPending}>Cancel</Button>
            <Button onClick={() => run.mutate()} disabled={run.isPending || instructions.trim().length < 2}>
              {run.isPending ? "Rewriting…" : "Rewrite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}