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
  email?: string | null;
  company?: string | null;
}): string {
  const nameSource =
    (opts.fullName && opts.fullName.trim()) ||
    (opts.email ? opts.email.split("@")[0].replace(/[._-]+/g, " ") : "Resume");
  const parts = nameSource.trim().split(/\s+/);
  const first = sanitize(parts[0] ?? "Resume") || "Resume";
  const last = sanitize(parts.slice(1).join(" ")) || "";
  const company = sanitize(opts.company ?? "") || "Company";
  const stem = [first, last, "Resume", company].filter(Boolean).join("_");
  return stem;
}

export function resumePdfName(opts: Parameters<typeof resumeFileBaseName>[0]): string {
  return `${resumeFileBaseName(opts)}.pdf`;
}

export function resumeTexName(opts: Parameters<typeof resumeFileBaseName>[0]): string {
  return `${resumeFileBaseName(opts)}.tex`;
}