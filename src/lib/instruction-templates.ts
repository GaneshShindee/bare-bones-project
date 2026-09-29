export type EmailPattern =
  | "first.last"
  | "firstlast"
  | "flast"
  | "firstl"
  | "last.first"
  | "custom";

export const EMAIL_PATTERN_OPTIONS: { value: EmailPattern; label: string; sample: string }[] = [
  { value: "first.last", label: "FirstName.LastName", sample: "{first}.{last}" },
  { value: "firstlast", label: "FirstNameLastName", sample: "{first}{last}" },
  { value: "flast", label: "FirstInitialLastName", sample: "{f}{last}" },
  { value: "firstl", label: "FirstNameLastInitial", sample: "{first}{l}" },
  { value: "last.first", label: "LastName.FirstName", sample: "{last}.{first}" },
  { value: "custom", label: "Custom Pattern", sample: "{first}.{last}" },
];

export type RuleKey =
  | "useFirstLast"
  | "ignoreLinkedinMeta"
  | "ignoreJobTitles"
  | "ignoreCompanyNames"
  | "removePrefixes"
  | "skipIncomplete"
  | "skipEllipsis"
  | "skipDuplicateNames"
  | "skipDuplicateEmails"
  | "skipInitialsOnly"
  | "skipOneWord"
  | "lowercase"
  | "removeAccents"
  | "removeSpecialChars"
  | "trimSpaces"
  | "returnSkipped"
  | "splitBatches";

export const RULE_LIBRARY: { key: RuleKey; label: string; text: string }[] = [
  { key: "useFirstLast", label: "Use first and last name only", text: "Use only first and last name; ignore middle names unless required by the pattern." },
  { key: "ignoreLinkedinMeta", label: "Ignore LinkedIn metadata", text: "Ignore LinkedIn UI noise like Connect, Follow, Hiring, Open to Work, degree badges (1st/2nd/3rd), mutual connections." },
  { key: "ignoreJobTitles", label: "Ignore job titles", text: "Ignore job titles and seniority words (Engineer, Manager, Director, VP, CEO, Intern, Consultant, etc.)." },
  { key: "ignoreCompanyNames", label: "Ignore company names", text: "Ignore company names, departments, and locations." },
  { key: "removePrefixes", label: "Remove prefixes", text: "Strip honorific prefixes before building the email." },
  { key: "skipIncomplete", label: "Skip incomplete names", text: "Skip records where a full first and last name cannot be confidently identified." },
  { key: "skipEllipsis", label: "Skip names containing \"...\"", text: "Skip any name that contains an ellipsis or truncation marker (...)." },
  { key: "skipDuplicateNames", label: "Skip duplicate names", text: "Skip records whose name has already been processed." },
  { key: "skipDuplicateEmails", label: "Skip duplicate emails", text: "Deduplicate the final email list." },
  { key: "skipInitialsOnly", label: "Skip initials-only names", text: "Skip records that are only initials (e.g. J. D., A B)." },
  { key: "skipOneWord", label: "Skip one-word names", text: "Skip single-word names with no last name." },
  { key: "lowercase", label: "Lowercase email", text: "Lowercase the final email address." },
  { key: "removeAccents", label: "Remove accents", text: "Strip diacritics and accents from name parts before building the email." },
  { key: "removeSpecialChars", label: "Remove special characters", text: "Remove apostrophes, hyphens, punctuation, and other special characters from name parts." },
  { key: "trimSpaces", label: "Trim spaces", text: "Trim whitespace from name parts and the final email." },
  { key: "returnSkipped", label: "Return skipped records", text: "Return any skipped names with a short reason." },
  { key: "splitBatches", label: "Split into batches", text: "Allow the UI to split the final list into batches for sending." },
];

export const DEFAULT_RULES: Record<RuleKey, boolean> = Object.fromEntries(
  RULE_LIBRARY.map((r) => [r.key, true]),
) as Record<RuleKey, boolean>;

export const DEFAULT_PREFIXES = ["Mr", "Mrs", "Ms", "Dr", "Prof", "Md", "Mohd", "Er"];

export type InstructionTemplate = {
  id: string;
  name: string;
  email_pattern: EmailPattern;
  custom_pattern: string;
  company_domain: string;
  batch_size: number;
  rules: Record<string, boolean>;
  prefixes: string[];
  custom_rules: string[];
  surname_min_length: number;
  created_at?: string;
  updated_at?: string;
};

export function newBlankTemplate(name = "New Template"): Omit<InstructionTemplate, "id"> {
  return {
    name,
    email_pattern: "first.last",
    custom_pattern: "{first}.{last}",
    company_domain: "",
    batch_size: 100,
    rules: { ...DEFAULT_RULES },
    prefixes: [...DEFAULT_PREFIXES],
    custom_rules: [],
    surname_min_length: 2,
  };
}

export function patternSample(p: EmailPattern, customPattern: string): string {
  if (p === "custom") return customPattern || "{first}.{last}";
  return EMAIL_PATTERN_OPTIONS.find((o) => o.value === p)!.sample;
}

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Local preview only. The server will rebuild the real email. */
export function previewEmail(
  fullName: string,
  tpl: Pick<InstructionTemplate, "email_pattern" | "custom_pattern" | "company_domain" | "prefixes">,
): string {
  const cleaned = stripAccents(fullName).replace(/[^A-Za-z\s.'-]/g, " ").trim();
  if (!cleaned) return "";
  let parts = cleaned.split(/\s+/);
  const prefixes = new Set(tpl.prefixes.map((p) => p.toLowerCase().replace(/\.$/, "")));
  while (parts.length && prefixes.has(parts[0].toLowerCase().replace(/\.$/, ""))) parts.shift();
  if (parts.length < 2) return "";
  const first = parts[0].replace(/[^A-Za-z]/g, "").toLowerCase();
  const last = parts[parts.length - 1].replace(/[^A-Za-z]/g, "").toLowerCase();
  if (!first || !last) return "";
  const pat = patternSample(tpl.email_pattern, tpl.custom_pattern);
  const local = pat
    .replace(/\{first\}/gi, first)
    .replace(/\{last\}/gi, last)
    .replace(/\{f\}/gi, first[0] ?? "")
    .replace(/\{l\}/gi, last[0] ?? "");
  const domain = (tpl.company_domain || "company.com").trim().replace(/^@+/, "");
  return `${local}@${domain}`;
}

/** Build the AI prompt internally from a template. */
export function buildPrompt(tpl: InstructionTemplate): string {
  const pat = patternSample(tpl.email_pattern, tpl.custom_pattern);
  const domain = (tpl.company_domain || "").trim().replace(/^@+/, "") || "company.com";
  const enabled = RULE_LIBRARY.filter((r) => tpl.rules[r.key] !== false);
  const lines: string[] = [];
  lines.push(`Generate email addresses using this pattern:`);
  lines.push(``);
  lines.push(`  ${pat}@${domain}`);
  lines.push(``);
  lines.push(`Tokens: {first}=first name, {last}=last name, {f}=first initial, {l}=last initial. All lowercase.`);
  lines.push(``);
  lines.push(`Rules:`);
  for (const r of enabled) lines.push(`- ${r.text}`);
  if (tpl.rules.removePrefixes !== false && tpl.prefixes.length) {
    lines.push(`- Prefixes to strip: ${tpl.prefixes.join(", ")}.`);
  }
  if (tpl.surname_min_length > 0) {
    lines.push(`- Skip records where the last name is shorter than ${tpl.surname_min_length} characters.`);
  }
  if (tpl.custom_rules.length) {
    lines.push(``);
    lines.push(`Custom rules:`);
    for (const c of tpl.custom_rules) if (c.trim()) lines.push(`- ${c.trim()}`);
  }
  lines.push(``);
  lines.push(`Return STRICT JSON only: { "emails": ["..."], "skipped": [{ "name": "...", "reason": "..." }] }.`);
  return lines.join("\n");
}