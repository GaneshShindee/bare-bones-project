/** LinkedIn company search results for a company keyword. */
export function linkedInCompanySearchUrl(company: string): string {
  const keywords = company.trim();
  const q = new URLSearchParams({
    keywords: keywords || "company",
    origin: "GLOBAL_SEARCH_HEADER",
  });
  return `https://www.linkedin.com/search/results/companies/?${q.toString()}`;
}

/** Turn `nvidia.com` / `careers.nvidia.com` into a LinkedIn search keyword. */
export function companyKeywordFromDomain(domain: string): string {
  const host = domain.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] ?? "";
  if (!host) return "";
  const parts = host.split(".").filter(Boolean);
  if (parts.length === 0) return host;
  // drop common TLD / multi-part TLD pieces
  const tlds = new Set(["com", "org", "net", "io", "co", "ai", "dev", "app", "in", "uk", "us", "edu", "gov"]);
  while (parts.length > 1 && tlds.has(parts[parts.length - 1]!)) parts.pop();
  // drop www / careers / mail subdomains when a brand label remains
  const skip = new Set(["www", "careers", "jobs", "mail", "email", "hr"]);
  while (parts.length > 1 && skip.has(parts[0]!)) parts.shift();
  return parts[0] ?? host;
}

/**
 * Company name from the email form ("Nvidia") or a domain ("nvidia.com")
 * → domain used in generated addresses.
 */
export function toEmailDomain(input: string): string {
  const s = input.trim().replace(/^@+/, "");
  if (!s) return "";
  if (/\./.test(s)) return s.toLowerCase().replace(/\s+/g, "");
  const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return slug ? `${slug}.com` : "";
}

/** Prefer a human company name for LinkedIn search. */
export function linkedInCompanyKeyword(companyOrDomain: string): string {
  const s = companyOrDomain.trim();
  if (!s) return "";
  if (!/\./.test(s)) return s;
  return companyKeywordFromDomain(s) || s;
}

export const AI_JD_RESUME_FOLDER = "AI generated resume based on JD";
