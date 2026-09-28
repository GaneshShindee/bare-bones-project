import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { listResumeProjects, generateResumeVersion } from "@/lib/resume-studio.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { saveSendResumeHandoff } from "@/lib/send-resume-handoff";
import { getLinkedResumeVersionId, setLinkedResumeVersionId } from "@/lib/job-resume-link";

type PreserveEmail = {
  subject: string;
  body: string;
  recipientText?: string;
  vars?: Record<string, string>;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialCompany?: string;
  initialRole?: string;
  /** Full community-job dump (skills, location, salary, etc.). */
  initialJobContext?: string;
  initialInstructions?: string;
  /** Community Jobs board id — used to reopen the same tailored resume. */
  jobId?: string | null;
  /** Prefer this version if already known (e.g. URL after attach). */
  existingResumeVersionId?: string | null;
  /** Current Send Email draft — restored when attaching resume (no new email body). */
  preserveEmail?: PreserveEmail;
};

function goToExistingResume(opts: {
  navigate: ReturnType<typeof useNavigate>;
  versionId: string;
  company: string;
  role: string;
  jobContext: string;
  instructions: string;
  preserveEmail?: PreserveEmail;
  jobId?: string | null;
}) {
  saveSendResumeHandoff({
    attachOnly: true,
    subject: opts.preserveEmail?.subject ?? "",
    body: opts.preserveEmail?.body ?? "",
    recipientText: opts.preserveEmail?.recipientText,
    vars: opts.preserveEmail?.vars,
    company: opts.company,
    role: opts.role,
    jobDescription: opts.jobContext,
    jobContext: opts.jobContext,
    instructions: opts.instructions,
    resumeVersionId: opts.versionId,
    jobId: opts.jobId ?? undefined,
  });
  setLinkedResumeVersionId(
    { jobId: opts.jobId, company: opts.company, role: opts.role },
    opts.versionId,
  );
  void opts.navigate({
    to: "/resume-studio/$id",
    params: { id: opts.versionId },
    search: { returnToSend: true } as never,
  });
}

/** Standalone “Generate Resume” from Send Email — uses full job community context. */
export function GenerateResumeDialog({
  open,
  onOpenChange,
  initialCompany = "",
  initialRole = "",
  initialJobContext = "",
  initialInstructions = "",
  jobId = null,
  existingResumeVersionId = null,
  preserveEmail,
}: Props) {
  const navigate = useNavigate();
  const [company, setCompany] = useState(initialCompany);
  const [role, setRole] = useState(initialRole);
  const [jobContext, setJobContext] = useState(initialJobContext);
  const [instructions, setInstructions] = useState(initialInstructions);
  const [masterId, setMasterId] = useState("");

  const projectsFn = useServerFn(listResumeProjects);
  const genFn = useServerFn(generateResumeVersion);

  const projects = useQuery({
    queryKey: ["resume-projects"],
    queryFn: () => projectsFn(),
    enabled: open,
  });

  const linkedId = useMemo(() => {
    if (!open) return null;
    return (
      existingResumeVersionId ||
      getLinkedResumeVersionId({ jobId, company: initialCompany, role: initialRole })
    );
  }, [open, existingResumeVersionId, jobId, initialCompany, initialRole]);

  useEffect(() => {
    if (!open) return;
    setCompany(initialCompany);
    setRole(initialRole);
    setJobContext(initialJobContext);
    setInstructions(initialInstructions);
  }, [open, initialCompany, initialRole, initialJobContext, initialInstructions]);

  useEffect(() => {
    if (!open || !projects.data?.length) return;
    const preferred = projects.data.find((p) => p.is_default)?.id ?? projects.data[0]?.id ?? "";
    setMasterId((cur) => cur || preferred);
  }, [open, projects.data]);

  // If we already have a resume for this job/email, skip the form and reopen it.
  useEffect(() => {
    if (!open || !linkedId) return;
    goToExistingResume({
      navigate,
      versionId: linkedId,
      company: (initialCompany || company).trim(),
      role: (initialRole || role).trim(),
      jobContext: (initialJobContext || jobContext).trim(),
      instructions: (initialInstructions || instructions).trim(),
      preserveEmail,
      jobId,
    });
    onOpenChange(false);
    toast.message("Opening your existing resume", {
      description: "Same tailored version for this job — not generating from scratch.",
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, linkedId]);

  const gen = useMutation({
    mutationFn: () => {
      if (!masterId) throw new Error("Pick a master resume first");
      const blob = jobContext.trim();
      if (!blob && !role.trim()) throw new Error("Add job details or a role first");
      return genFn({
        data: {
          projectId: masterId,
          jobDescription: blob || `Role: ${role.trim()}${company.trim() ? `\nCompany: ${company.trim()}` : ""}`,
          jobContext: blob || null,
          jobTitle: role.trim() || null,
          company: company.trim() || null,
          customInstructions: instructions.trim() || null,
        },
      });
    },
    onSuccess: (row) => {
      setLinkedResumeVersionId(
        { jobId, company: company.trim(), role: role.trim() },
        row.id,
      );
      saveSendResumeHandoff({
        attachOnly: true,
        subject: preserveEmail?.subject ?? "",
        body: preserveEmail?.body ?? "",
        recipientText: preserveEmail?.recipientText,
        vars: preserveEmail?.vars,
        company: company.trim(),
        role: role.trim(),
        jobDescription: jobContext.trim(),
        jobContext: jobContext.trim(),
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

  // While redirecting to an existing resume, don't flash the create form.
  if (linkedId) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !gen.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl max-h-[min(92dvh,900px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> Generate resume for this job
          </DialogTitle>
          <DialogDescription>
            All Jobs Community fields (skills, location, salary, responsibilities, etc.) are included so the resume can match the posting closely.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Company</Label>
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
              rows={10}
              value={jobContext}
              onChange={(e) => setJobContext(e.target.value)}
              placeholder="Paste or load from Jobs Community…"
              className="text-xs font-mono"
            />
          </div>
          <div>
            <Label>Extra instructions (optional)</Label>
            <Textarea
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Keep to one page, emphasise React"
            />
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
            <div>
              <Label>Master resume</Label>
              <Select value={masterId} onValueChange={setMasterId}>
                <SelectTrigger className="w-full mt-1.5">
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
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gen.isPending}>
            Cancel
          </Button>
          <Button
            disabled={gen.isPending || !masterId || (!jobContext.trim() && !role.trim())}
            onClick={() => gen.mutate()}
          >
            {gen.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
            {gen.isPending ? "Generating…" : "Generate & edit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Call from Send when a linked resume already exists — skip the dialog. */
export function openLinkedOrGenerateResume(opts: {
  navigate: ReturnType<typeof useNavigate>;
  jobId?: string | null;
  company: string;
  role: string;
  jobContext: string;
  instructions: string;
  existingResumeVersionId?: string | null;
  preserveEmail: PreserveEmail;
  openDialog: () => void;
}): boolean {
  const id =
    opts.existingResumeVersionId ||
    getLinkedResumeVersionId({ jobId: opts.jobId, company: opts.company, role: opts.role });
  if (!id) {
    opts.openDialog();
    return false;
  }
  goToExistingResume({
    navigate: opts.navigate,
    versionId: id,
    company: opts.company.trim(),
    role: opts.role.trim(),
    jobContext: opts.jobContext.trim(),
    instructions: opts.instructions.trim(),
    preserveEmail: opts.preserveEmail,
    jobId: opts.jobId,
  });
  toast.message("Opening your existing resume", {
    description: "Same tailored version for this job — not generating from scratch.",
  });
  return true;
}
