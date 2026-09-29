import type { Job } from "@/lib/jobs.functions";

/** Subset of job fields used when generating email / resume. */
export type JobContextInput = {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  work_mode?: string | null;
  employment_type?: string | null;
  experience?: string | null;
  salary?: string | null;
  description?: string | null;
  responsibilities?: string[] | null;
  skills?: string[] | null;
  technologies?: string[] | null;
  tags?: string[] | null;
  recruiter_email?: string | null;
  apply_url?: string | null;
  company_website?: string | null;
  source_url?: string | null;
};

/** Flatten a community job into rich context for AI email / resume generation. */
export function formatJobContext(job: JobContextInput): string {
  const lines: string[] = [];
  const push = (label: string, value: string | null | undefined) => {
    const v = (value ?? "").trim();
    if (v) lines.push(`${label}: ${v}`);
  };
  const pushList = (label: string, items: string[] | null | undefined) => {
    const list = (items ?? []).map((x) => x.trim()).filter(Boolean);
    if (list.length) lines.push(`${label}:\n- ${list.join("\n- ")}`);
  };

  push("Role / Title", job.title);
  push("Company", job.company);
  push("Location", job.location);
  push("Work mode", job.work_mode);
  push("Employment type", job.employment_type);
  push("Experience", job.experience);
  push("Salary", job.salary);
  push("Recruiter email", job.recruiter_email);
  push("Apply URL", job.apply_url);
  push("Company website", job.company_website);
  push("Source URL", job.source_url);
  pushList("Tags", job.tags);
  pushList("Skills", job.skills);
  pushList("Technologies", job.technologies);
  pushList("Responsibilities", job.responsibilities);

  const desc = (job.description ?? "").trim();
  if (desc) {
    lines.push("");
    lines.push("Job description:");
    lines.push(desc);
  }

  return lines.join("\n").trim();
}

export function jobToContextFields(job: Job | JobContextInput) {
  const context = formatJobContext(job);
  return {
    company: (job.company ?? "").trim(),
    role: (job.title ?? "").trim(),
    location: (job.location ?? "").trim(),
    workMode: (job.work_mode ?? "").trim(),
    employmentType: (job.employment_type ?? "").trim(),
    experience: (job.experience ?? "").trim(),
    salary: (job.salary ?? "").trim(),
    jobDescription: context,
    jobContext: context,
  };
}

/** Template {{variables}} commonly filled from a community job. */
export function jobToTemplateVars(job: Job | JobContextInput): Record<string, string> {
  const f = jobToContextFields(job);
  const out: Record<string, string> = {};
  if (f.company) out.company = f.company;
  if (f.role) {
    out.role = f.role;
    out.title = f.role;
    out.job_title = f.role;
  }
  if (f.location) out.location = f.location;
  if (f.workMode) {
    out.work_mode = f.workMode;
    out.workMode = f.workMode;
  }
  if (f.employmentType) {
    out.employment_type = f.employmentType;
    out.employmentType = f.employmentType;
  }
  if (f.experience) out.experience = f.experience;
  if (f.salary) out.salary = f.salary;
  return out;
}

