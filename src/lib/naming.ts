/** Derive a clean file base name like "Ganesh_Shinde_Resume_Microsoft". */
function sanitize(part: string): string {
  return part
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export function resumeFileBaseName(opts: {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  company?: string | null;
}): string {
  let first = (opts.firstName ?? "").trim();
  let last = (opts.lastName ?? "").trim();

  if (!first && !last) {
    const nameSource =
      (opts.fullName && opts.fullName.trim()) ||
      (opts.email ? opts.email.split("@")[0].replace(/[._-]+/g, " ") : "");
    const parts = nameSource.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      first = parts[0]!;
      last = parts.slice(1).join(" ");
    } else if (parts.length === 1) {
      first = parts[0]!;
      last = "";
    }
  }

  const firstS = sanitize(first);
  const lastS = sanitize(last);
  const company = sanitize(opts.company ?? "") || "Company";

  // firstName_lastName_Resume_companyName
  const stem = [firstS, lastS, "Resume", company].filter(Boolean).join("_");
  return stem || `Resume_${company}`;
}

export function resumePdfName(opts: Parameters<typeof resumeFileBaseName>[0]): string {
  return `${resumeFileBaseName(opts)}.pdf`;
}

export function resumeTexName(opts: Parameters<typeof resumeFileBaseName>[0]): string {
  return `${resumeFileBaseName(opts)}.tex`;
}
