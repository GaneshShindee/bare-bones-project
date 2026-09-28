import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { generateAiEmail } from "@/lib/ai-email.functions";
import { listResumeProjects, generateResumeVersion } from "@/lib/resume-studio.functions";
import { linkedInCompanySearchUrl } from "@/lib/linkedin";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, ExternalLink, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { saveSendResumeHandoff } from "@/lib/send-resume-handoff";
import { getLinkedResumeVersionId, setLinkedResumeVersionId } from "@/lib/job-resume-link";

/**
 * "Generate Body Using AI" — customises the SELECTED template (~10% changed,
 * ~90% preserved) using the role, company, full job posting and the user's
 * resume facts. Also offers LinkedIn company search + JD-tailored resume gen.
 */
export function AiBodyDialog({
  open,
  onOpenChange,
  templateId,
  resumeVersionId,
  initialCompany = "",
  initialRole = "",
  initialJobDescription = "",
  initialJobContext = "",
  jobId = null,
  /** Current Send Email draft — preserved when opening Resume Studio so body is not regenerated. */
  preserveEmail,
  onUse,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  templateId: string | null;
  resumeVersionId: string | null;
  initialCompany?: string;
  initialRole?: string;
  initialJobDescription?: string;
  /** Full community-job dump; falls back to initialJobDescription. */
  initialJobContext?: string;
  jobId?: string | null;
  preserveEmail?: {
    subject: string;
    body: string;
    recipientText?: string;
    vars?: Record<string, string>;
  };
  onUse: (r: {
    subject: string;
    body: string;
    company: string;
    role: string;
    jobDescription: string;
    jobContext: string;
    instructions: string;
  }) => void;
}) {
  const navigate = useNavigate();
  const [company, setCompany] = useState(initialCompany);
  const [role, setRole] = useState(initialRole);
  const [jd, setJd] = useState(initialJobContext || initialJobDescription);
  const [instructions, setInstructions] = useState("");
  const [result, setResult] = useState<{ subject: string; body: string } | null>(null);
  const [masterId, setMasterId] = useState<string>("");
  const fn = useServerFn(generateAiEmail);
  const projectsFn = useServerFn(listResumeProjects);
  const genResumeFn = useServerFn(generateResumeVersion);

  const projects = useQuery({
    queryKey: ["resume-projects"],
    queryFn: () => projectsFn(),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setCompany(initialCompany);
    setRole(initialRole);
    setJd(initialJobContext || initialJobDescription);
    setInstructions("");
    setResult(null);
  }, [open, initialCompany, initialRole, initialJobDescription, initialJobContext]);

  useEffect(() => {
    if (!open || !projects.data?.length) return;
    const preferred =
      projects.data.find((p) => p.is_default)?.id ?? projects.data[0]?.id ?? "";
    setMasterId((cur) => cur || preferred);
  }, [open, projects.data]);

  const run = useMutation({
    mutationFn: () =>
      fn({
        data: {
          templateId: templateId || null,
          resumeVersionId: resumeVersionId || null,
          company: company.trim() || null,
          jobTitle: role.trim() || null,
          jobDescription: jd.trim() || null,
          jobContext: jd.trim() || null,
          instructions: instructions.trim() || null,
        },
      }),
    onSuccess: (r) => setResult(r),
    onError: (e) => toast.error("AI failed", { description: (e as Error).message }),
  });

  const genResume = useMutation({
    mutationFn: () => {
      if (!masterId) throw new Error("Pick a master resume first");
      if (!jd.trim() && !role.trim()) throw new Error("Add a role or job posting first");
      return genResumeFn({
        data: {
          projectId: masterId,
          jobDescription: jd.trim() || `Role: ${role.trim()}${company.trim() ? `\nCompany: ${company.trim()}` : ""}`,
          jobContext: jd.trim() || null,
          jobTitle: role.trim() || null,
          company: company.trim() || null,
          customInstructions: instructions.trim() || null,
        },
      });
    },
    onSuccess: (row) => {
      // Keep existing email — do not regenerate when returning from Resume Studio.
      const subject = result?.subject || preserveEmail?.subject || "";
      const body = result?.body || preserveEmail?.body || "";
      setLinkedResumeVersionId(
        { jobId, company: company.trim(), role: role.trim() },
        row.id,
      );
      saveSendResumeHandoff({
        attachOnly: true,
        subject,
        body,
        recipientText: preserveEmail?.recipientText,
        vars: preserveEmail?.vars,
        company: company.trim(),
        role: role.trim(),
        jobDescription: jd.trim(),
        jobContext: jd.trim(),
        instructions: instructions.trim(),
        resumeVersionId: row.id,
        jobId: jobId ?? undefined,
      });
      toast.success("Resume generated — compile PDF, then Attach to email", {
        description: "Your email subject & body stay as they are.",
      });
      onOpenChange(false);
      void navigate({
        to: "/resume-studio/$id",
        params: { id: row.id },
        search: { returnToSend: true } as never,
      });
    },
    onError: (e) => toast.error("Resume generation failed", { description: (e as Error).message }),
  });

  const openLinkedIn = () => {
    const name = company.trim();
    if (!name) {
      toast.message("Enter a company name first");
      return;
    }
    window.open(linkedInCompanySearchUrl(name), "_blank", "noopener,noreferrer");
  };

  const busy = run.isPending || genResume.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl max-h-[min(92dvh,900px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Generate subject & body with AI</DialogTitle>
          <DialogDescription>
            {templateId
              ? "Your selected template keeps its structure, tone and variables — only about 10% is tailored to this role."
              : "Generate a subject and body from the role, company, and full job posting. You can edit before saving."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>Company</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={openLinkedIn}
                  disabled={!company.trim()}
                >
                  <ExternalLink className="h-3 w-3 mr-1" /> LinkedIn search
                </Button>
              </div>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Corp" />
            </div>
            <div>
              <Label>Role</Label>
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Backend Engineer" />
            </div>
          </div>
          <div>
            <Label>Full job posting</Label>
            <Textarea
              rows={6}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the full posting (skills, location, salary, responsibilities…)…"
              className="text-xs font-mono"
            />
          </div>
          <div>
            <Label>Extra instructions (optional)</Label>
            <Textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Mention my Kubernetes experience in one line" />
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <div className="text-sm font-medium flex items-center gap-1.5">
              <FileText className="h-4 w-4" /> Tailor resume for this JD
            </div>
            {(projects.data?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">
                No master resume yet.{" "}
                <Link to="/resume-studio" className="underline text-foreground" onClick={() => onOpenChange(false)}>
                  Upload one in Resume Studio
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <Select value={masterId} onValueChange={setMasterId}>
                  <SelectTrigger className="w-full sm:flex-1">
                    <SelectValue placeholder="Master resume…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}{p.is_default ? " · Default" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0"
                  disabled={busy || (!masterId && !getLinkedResumeVersionId({ jobId, company, role }) && !resumeVersionId) || (!jd.trim() && !role.trim() && !getLinkedResumeVersionId({ jobId, company, role }) && !resumeVersionId)}
                  onClick={() => {
                    const existing =
                      resumeVersionId ||
                      getLinkedResumeVersionId({ jobId, company: company.trim(), role: role.trim() });
                    if (existing) {
                      const subject = result?.subject || preserveEmail?.subject || "";
                      const body = result?.body || preserveEmail?.body || "";
                      saveSendResumeHandoff({
                        attachOnly: true,
                        subject,
                        body,
                        recipientText: preserveEmail?.recipientText,
                        vars: preserveEmail?.vars,
                        company: company.trim(),
                        role: role.trim(),
                        jobDescription: jd.trim(),
                        jobContext: jd.trim(),
                        instructions: instructions.trim(),
                        resumeVersionId: existing,
                        jobId: jobId ?? undefined,
                      });
                      onOpenChange(false);
                      toast.message("Opening your existing resume", {
                        description: "Same tailored version for this job — not generating from scratch.",
                      });
                      void navigate({
                        to: "/resume-studio/$id",
                        params: { id: existing },
                        search: { returnToSend: true } as never,
                      });
                      return;
                    }
                    genResume.mutate();
                  }}
                >
                  {genResume.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                  {genResume.isPending
                    ? "Generating…"
                    : resumeVersionId || getLinkedResumeVersionId({ jobId, company, role })
                      ? "Open existing resume"
                      : "Generate & edit resume"}
                </Button>
              </div>
            )}
          </div>

          {result && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-sm">
              <div><span className="text-muted-foreground text-xs">Subject:</span> {result.subject || "—"}</div>
              <div className="whitespace-pre-wrap max-h-56 overflow-auto border-t border-border pt-2">{result.body}</div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="outline" onClick={() => run.mutate()} disabled={busy}>
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            {run.isPending ? "Generating…" : result ? "Regenerate" : "Generate"}
          </Button>
          <Button
            disabled={!result || busy}
            onClick={() => {
              if (!result) return;
              const blob = jd.trim();
              onUse({
                ...result,
                company: company.trim(),
                role: role.trim(),
                jobDescription: blob,
                jobContext: blob,
                instructions: instructions.trim(),
              });
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
