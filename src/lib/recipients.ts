const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Slightly stricter: local part + domain with at least one dot and a 2+ char TLD.
const STRICT_EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

/** Domains that cannot receive real mail — reserved / example / invalid TLDs. */
const UNROUTABLE_DOMAINS = new Set([
  "example.com", "example.org", "example.net",
  "test.com", "localhost", "invalid",
]);
const UNROUTABLE_TLDS = new Set(["test", "example", "invalid", "localhost", "local"]);

export type SkipReason =
  | "invalid_syntax"
  | "duplicate"
  | "blank"
  | "unroutable_domain";

export type SkippedRecipient = { email: string; reason: SkipReason; note?: string };

export type ParsedRecipients = {
  valid: string[];
  invalid: string[];
  duplicates: number;
  total: number;
  meta: Array<{ email: string; name?: string }>;
  skipped: SkippedRecipient[];
};

/** Parse a free-form recipient string.
 * Supports plain emails, "Name <email>", "Name email", and separators (comma/semicolon/newline).
 */
export function parseRecipients(input: string): ParsedRecipients {
  // Split by comma/semicolon/newline first (keep spaces so we can parse "Name <email>").
  const chunks = input
    .split(/[,;\n\r]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  const meta: Array<{ email: string; name?: string }> = [];
  const skipped: SkippedRecipient[] = [];
  let duplicates = 0;

  for (const raw of chunks) {
    // Extract email + optional display name from a chunk.
    let email: string | null = null;
    let name: string | undefined;

    const angle = raw.match(/^\s*(.*?)\s*<\s*([^>\s]+)\s*>\s*$/);
    if (angle) {
      name = angle[1].replace(/^["']|["']$/g, "").trim() || undefined;
      email = angle[2];
    } else {
      // Look for the last email-like token in the chunk.
      const parts = raw.split(/\s+/).filter(Boolean);
      for (let i = parts.length - 1; i >= 0; i--) {
        if (EMAIL_RE.test(parts[i])) {
          email = parts[i];
          const before = parts.slice(0, i).join(" ").trim();
          if (before) name = before.replace(/^["']|["']$/g, "").trim();
          break;
        }
      }
    }
    if (!email) {
      invalid.push(raw);
      skipped.push({ email: raw, reason: "invalid_syntax" });
      continue;
    }
    const t = email.toLowerCase();
    if (!STRICT_EMAIL_RE.test(t)) {
      invalid.push(raw);
      skipped.push({ email: t, reason: "invalid_syntax" });
      continue;
    }
    const domain = t.split("@")[1] ?? "";
    const tld = domain.split(".").pop() ?? "";
    if (UNROUTABLE_DOMAINS.has(domain) || UNROUTABLE_TLDS.has(tld)) {
      skipped.push({ email: t, reason: "unroutable_domain", note: domain });
      continue;
    }
    if (seen.has(t)) {
      duplicates += 1;
      skipped.push({ email: t, reason: "duplicate" });
      continue;
    }
    seen.add(t);
    valid.push(t);
    meta.push({ email: t, name });
  }

  return { valid, invalid, duplicates, total: chunks.length, meta, skipped };
}

/** Server-side re-validation. Mirrors parseRecipients rules on a list of pre-cleaned emails. */
export function validateEmails(
  emails: string[],
  metaByEmail?: Map<string, { name?: string; company?: string }>,
): { valid: string[]; skipped: SkippedRecipient[] } {
  const seen = new Set<string>();
  const valid: string[] = [];
  const skipped: SkippedRecipient[] = [];
  for (const raw of emails) {
    const t = (raw ?? "").trim().toLowerCase();
    if (!t) { skipped.push({ email: raw, reason: "blank" }); continue; }
    if (!STRICT_EMAIL_RE.test(t)) { skipped.push({ email: t, reason: "invalid_syntax" }); continue; }
    const domain = t.split("@")[1] ?? "";
    const tld = domain.split(".").pop() ?? "";
    if (UNROUTABLE_DOMAINS.has(domain) || UNROUTABLE_TLDS.has(tld)) {
      skipped.push({ email: t, reason: "unroutable_domain", note: domain });
      continue;
    }
    if (seen.has(t)) { skipped.push({ email: t, reason: "duplicate" }); continue; }
    seen.add(t);
    valid.push(t);
  }
  // Keep metaByEmail param signature stable (unused here but callers may want it).
  void metaByEmail;
  return { valid, skipped };
}

/** Build a friendly greeting from a display name or the email local-part. */
export function greetingFor(email: string, displayName?: string | null): string {
  const { first_name, full_name } = deriveNames(email, displayName ?? undefined);
  const name = first_name || full_name || "";
  return name ? `Hello ${name},` : `Hello,`;
}

/** True when the body already personalizes the greeting (either via placeholders or a leading salutation). */
export function bodyHasGreeting(body: string): boolean {
  const s = body.trimStart();
  if (/^(hi|hello|hey|dear|greetings)\b/i.test(s)) return true;
  return /\{\{\s*(greeting|first_name|full_name|name)\s*\}\}/i.test(body);
}

/** Derive first/last/full name from a display name or (fallback) email local part. */
export function deriveNames(email: string, displayName?: string | null): {
  first_name: string;
  last_name: string;
  full_name: string;
} {
  const clean = (s: string) =>
    s
      .replace(/[._\-+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : "");

  let source = (displayName ?? "").trim();
  if (!source) {
    const local = email.split("@")[0] ?? "";
    // Strip trailing digits like "john.doe22".
    source = clean(local.replace(/\d+$/, ""));
  } else {
    source = clean(source);
  }
  const parts = source.split(" ").filter(Boolean).map(cap);
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const full = parts.join(" ") || first || "";
  return { first_name: first, last_name: last, full_name: full };
}