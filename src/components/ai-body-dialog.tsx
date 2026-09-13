import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { generateAiEmail } from "@/lib/ai-email.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

/**
 * "Generate Body Using AI" — customises the SELECTED template (~10% changed,
 * ~90% preserved) using the role, company, job description and the user's
 * resume facts.
 */
export function AiBodyDialog({
  open,
  onOpenChange,
  templateId,
  resumeVersionId,
  initialCompany = "",
  initialRole = "",
  initialJobDescription = "",
  onUse,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  templateId: string | null;
  resumeVersionId: string | null;
  initialCompany?: string;
  initialRole?: string;
  initialJobDescription?: string;
  onUse: (r: { subject: string; body: string; company: string; role: string; jobDescription: string; instructions: string }) => void;
}) {
  const [company, setCompany] = useState(initialCompany);
  const [role, setRole] = useState(initialRole);
  const [jd, setJd] = useState(initialJobDescription);
  const [instructions, setInstructions] = useState("");
  const [result, setResult] = useState<{ subject: string; body: string } | null>(null);
  const fn = useServerFn(generateAiEmail);

  const run = useMutation({
    mutationFn: () =>
      fn({
        data: {
          templateId: templateId || null,
          resumeVersionId: resumeVersionId || null,
          company: company.trim() || null,
          jobTitle: role.trim() || null,
          jobDescription: jd.trim() || null,
          instructions: instructions.trim() || null,
        },
      }),
    onSuccess: (r) => setResult(r),
    onError: (e) => toast.error("AI failed", { description: (e as Error).message }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !run.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Generate subject & body with AI</DialogTitle>
          <DialogDescription>
            {templateId
              ? "Your selected template keeps its structure, tone and variables — only about 10% is tailored to this role."
              : "Generate a subject and body from the role, company, and job description. You can edit before saving."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Company</Label><Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Corp" /></div>
            <div><Label>Role</Label><Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Backend Engineer" /></div>
          </div>
          <div>
            <Label>Job description (optional)</Label>
            <Textarea rows={4} value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the job description…" className="text-xs" />
          </div>
          <div>
            <Label>Extra instructions (optional)</Label>
            <Textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Mention my Kubernetes experience in one line" />
          </div>
          {result && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-sm">
              <div><span className="text-muted-foreground text-xs">Subject:</span> {result.subject || "—"}</div>
              <div className="whitespace-pre-wrap max-h-56 overflow-auto border-t border-border pt-2">{result.body}</div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={run.isPending}>Cancel</Button>
          <Button variant="outline" onClick={() => run.mutate()} disabled={run.isPending}>
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            {run.isPending ? "Generating…" : result ? "Regenerate" : "Generate"}
          </Button>
          <Button
            disabled={!result}
            onClick={() => {
              if (!result) return;
              onUse({ ...result, company: company.trim(), role: role.trim(), jobDescription: jd.trim(), instructions: instructions.trim() });
              onOpenChange(false);
            }}
          >
            Use this email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}