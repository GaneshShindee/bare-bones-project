/** Remember which tailored resume belongs to a job / company+role so "Generate Resume" reopens it. */

const STORAGE_KEY = "job-resume-version-links";

export type JobResumeLinkKey = {
  jobId?: string | null;
  company?: string | null;
  role?: string | null;
};

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Stable key: prefer community job id, else company|role. */
export function jobResumeLinkKey(parts: JobResumeLinkKey): string | null {
  const jobId = (parts.jobId ?? "").trim();
  if (jobId) return `job:${jobId}`;
  const company = norm(parts.company);
  const role = norm(parts.role);
  if (!company && !role) return null;
  return `co:${company}|role:${role}`;
}

function readMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private mode */
  }
}

export function getLinkedResumeVersionId(parts: JobResumeLinkKey): string | null {
  const key = jobResumeLinkKey(parts);
  if (!key) return null;
  const id = readMap()[key];
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function setLinkedResumeVersionId(parts: JobResumeLinkKey, resumeVersionId: string): void {
  const key = jobResumeLinkKey(parts);
  if (!key || !resumeVersionId) return;
  const map = readMap();
  map[key] = resumeVersionId;
  // Also index by company|role when we have a jobId so Send without jobId still finds it.
  const company = norm(parts.company);
  const role = norm(parts.role);
  if (company || role) {
    map[`co:${company}|role:${role}`] = resumeVersionId;
  }
  writeMap(map);
}

export function clearLinkedResumeVersionId(parts: JobResumeLinkKey): void {
  const key = jobResumeLinkKey(parts);
  if (!key) return;
  const map = readMap();
  delete map[key];
  writeMap(map);
}
