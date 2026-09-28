import { toEmailDomain } from "@/lib/linkedin";
import type { EmailPattern } from "@/lib/instruction-templates";

export type EmailFinderProviderId =
  | "hunter"
  | "apollo"
  | "prospeo"
  | "snov"
  | "datagma"
  | "persana"
  | "lusha"
  | "kaspr"
  | "surfe"
  | "cleanlist"
  | "getprospect"
  | "clearout"
  | "skrapp"
  | "findymail"
  | "experte";

export type EmailFinderProviderMeta = {
  id: EmailFinderProviderId;
  name: string;
  freeNote: string;
  hasApi: boolean;
  envKeys: string[];
  /** find = domain/email search · verify = validate an address */
  kind?: "find" | "verify";
  /** Public try / discover URL for a domain (browser fallback). */
  webSearchUrl: (domain: string) => string;
};

export const EMAIL_FINDER_PROVIDERS: EmailFinderProviderMeta[] = [
  {
    id: "hunter",
    name: "Hunter",
    freeNote: "50 credits/mo · domain → emails",
    hasApi: true,
    envKeys: ["HUNTER_API_KEY"],
    webSearchUrl: (d) => `https://hunter.io/try/search/${encodeURIComponent(d)}?locale=en`,
  },
  {
    id: "apollo",
    name: "Apollo",
    freeNote: "Free tier · large B2B DB",
    hasApi: true,
    envKeys: ["APOLLO_API_KEY"],
    webSearchUrl: (d) => `https://app.apollo.io/#/companies?qOrganizationKeywordTags[]=${encodeURIComponent(d)}`,
  },
  {
    id: "prospeo",
    name: "Prospeo",
    freeNote: "100 credits/mo · best API",
    hasApi: true,
    envKeys: ["PROSPEO_API_KEY"],
    webSearchUrl: (d) => `https://prospeo.io/`,
  },
  {
    id: "snov",
    name: "Snov.io",
    freeNote: "50 free searches/mo · by name & domain",
    hasApi: true,
    envKeys: ["SNOV_CLIENT_ID", "SNOV_CLIENT_SECRET"],
    webSearchUrl: () => `https://snov.io/email-finder`,
  },
  {
    id: "getprospect",
    name: "GetProspect",
    freeNote: "Domain email search · 50 free/mo",
    hasApi: false,
    envKeys: [],
    webSearchUrl: (d) =>
      `https://getprospect.com/email-finder/email-finder-by-domain${d ? `?domain=${encodeURIComponent(d)}` : ""}`,
  },
  {
    id: "clearout",
    name: "Clearout",
    freeNote: "B2B finder · pre-verified emails",
    hasApi: false,
    envKeys: [],
    webSearchUrl: () => `https://clearout.io/email-finder/`,
  },
  {
    id: "skrapp",
    name: "Skrapp",
    freeNote: "Find by name & company",
    hasApi: false,
    envKeys: [],
    webSearchUrl: () => `https://skrapp.io/email-finder`,
  },
  {
    id: "findymail",
    name: "Findymail",
    freeNote: "Verified B2B emails",
    hasApi: false,
    envKeys: [],
    webSearchUrl: () => `https://www.findymail.com/`,
  },
  {
    id: "datagma",
    name: "Datagma",
    freeNote: "~90 email credits · enrichment",
    hasApi: true,
    envKeys: ["DATAGMA_API_KEY"],
    webSearchUrl: (d) => `https://datagma.com/`,
  },
  {
    id: "persana",
    name: "Persana",
    freeNote: "~50 email · AI prospecting",
    hasApi: true,
    envKeys: ["PERSANA_API_KEY"],
    webSearchUrl: (d) => `https://persana.ai/`,
  },
  {
    id: "lusha",
    name: "Lusha",
    freeNote: "~40 email / 4 phone",
    hasApi: true,
    envKeys: ["LUSHA_API_KEY"],
    webSearchUrl: (d) => `https://www.lusha.com/`,
  },
  {
    id: "kaspr",
    name: "Kaspr",
    freeNote: "LinkedIn contacts · no public API",
    hasApi: false,
    envKeys: [],
    webSearchUrl: () => `https://www.kaspr.io/`,
  },
  {
    id: "surfe",
    name: "Surfe",
    freeNote: "LinkedIn → CRM · no public API",
    hasApi: false,
    envKeys: [],
    webSearchUrl: () => `https://www.surfe.com/`,
  },
  {
    id: "cleanlist",
    name: "Cleanlist",
    freeNote: "Lead enrichment · limited API",
    hasApi: false,
    envKeys: [],
    webSearchUrl: () => `https://cleanlist.ai/`,
  },
  {
    id: "experte",
    name: "EXPERTE",
    freeNote: "Free verify · name + domain permutations",
    hasApi: false,
    envKeys: [],
    kind: "verify",
    webSearchUrl: () => `https://www.experte.com/email-finder`,
  },
];

export const EMAIL_FIND_PROVIDERS = EMAIL_FINDER_PROVIDERS.filter((p) => (p.kind ?? "find") === "find");
export const EMAIL_VERIFY_PROVIDERS = EMAIL_FINDER_PROVIDERS.filter((p) => p.kind === "verify");

export type FoundEmail = {
  email: string;
  provider: EmailFinderProviderId;
  confidence?: number | null;
  name?: string | null;
};

export type ProviderSearchResult = {
  provider: EmailFinderProviderId;
  status: "ok" | "skipped" | "error";
  message?: string;
  emails: FoundEmail[];
  pattern?: string | null;
  webUrl: string;
};

export function resolveSearchDomain(companyOrDomain: string): string {
  return toEmailDomain(companyOrDomain).toLowerCase();
}

/** Map Hunter-style pattern strings to our EmailPattern. */
export function mapHunterPattern(pattern: string | null | undefined): EmailPattern | null {
  if (!pattern) return null;
  const p = pattern.toLowerCase().replace(/\s+/g, "");
  if (p.includes("{first}.{last}") || p === "{f}.{last}") return p.includes("{f}.") ? "flast" : "first.last";
  if (p === "{first}{last}") return "firstlast";
  if (p === "{f}{last}" || p === "{firstinitial}{last}") return "flast";
  if (p === "{first}{l}" || p === "{first}{lastinitial}") return "firstl";
  if (p === "{last}.{first}") return "last.first";
  if (p.includes("{first}") && p.includes("{last}") && p.includes(".")) return "first.last";
  if (p.includes("{first}") && p.includes("{last}")) return "firstlast";
  return "custom";
}

function env(...keys: string[]): string | null {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return null;
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function searchHunter(domain: string): Promise<ProviderSearchResult> {
  const meta = EMAIL_FINDER_PROVIDERS.find((p) => p.id === "hunter")!;
  const webUrl = meta.webSearchUrl(domain);
  const key = env("HUNTER_API_KEY");
  if (!key) {
    return { provider: "hunter", status: "skipped", message: "HUNTER_API_KEY not set", emails: [], webUrl };
  }
  try {
    const url = new URL("https://api.hunter.io/v2/domain-search");
    url.searchParams.set("domain", domain);
    url.searchParams.set("limit", "10");
    url.searchParams.set("api_key", key);
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { provider: "hunter", status: "error", message: `Hunter ${res.status}: ${t.slice(0, 120)}`, emails: [], webUrl };
    }
    const j = (await res.json()) as {
      data?: {
        pattern?: string | null;
        emails?: Array<{ value?: string; confidence?: number; first_name?: string; last_name?: string }>;
      };
    };
    const emails: FoundEmail[] = [];
    for (const e of j.data?.emails ?? []) {
      const value = (e.value ?? "").toLowerCase().trim();
      if (!isEmail(value)) continue;
      const name = [e.first_name, e.last_name].filter(Boolean).join(" ") || null;
      emails.push({ email: value, provider: "hunter", confidence: e.confidence ?? null, name });
    }
    return {
      provider: "hunter",
      status: "ok",
      emails,
      pattern: j.data?.pattern ?? null,
      webUrl,
      message: emails.length ? undefined : "No emails found",
    };
  } catch (e) {
    return { provider: "hunter", status: "error", message: (e as Error).message, emails: [], webUrl };
  }
}

async function searchApollo(domain: string): Promise<ProviderSearchResult> {
  const meta = EMAIL_FINDER_PROVIDERS.find((p) => p.id === "apollo")!;
  const webUrl = meta.webSearchUrl(domain);
  const key = env("APOLLO_API_KEY");
  if (!key) {
    return { provider: "apollo", status: "skipped", message: "APOLLO_API_KEY not set", emails: [], webUrl };
  }
  try {
    const res = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": key,
      },
      body: JSON.stringify({
        q_organization_domains: domain,
        page: 1,
        per_page: 10,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { provider: "apollo", status: "error", message: `Apollo ${res.status}: ${t.slice(0, 120)}`, emails: [], webUrl };
    }
    const j = (await res.json()) as {
      people?: Array<{ email?: string; first_name?: string; last_name?: string }>;
    };
    const emails: FoundEmail[] = [];
    for (const p of j.people ?? []) {
      const value = (p.email ?? "").toLowerCase().trim();
      if (!isEmail(value) || value.includes("email_not_unlocked") || value.includes("domain.com")) continue;
      emails.push({
        email: value,
        provider: "apollo",
        name: [p.first_name, p.last_name].filter(Boolean).join(" ") || null,
      });
    }
    return { provider: "apollo", status: "ok", emails, webUrl, message: emails.length ? undefined : "No emails found" };
  } catch (e) {
    return { provider: "apollo", status: "error", message: (e as Error).message, emails: [], webUrl };
  }
}

async function searchProspeo(domain: string): Promise<ProviderSearchResult> {
  const meta = EMAIL_FINDER_PROVIDERS.find((p) => p.id === "prospeo")!;
  const webUrl = meta.webSearchUrl(domain);
  const key = env("PROSPEO_API_KEY");
  if (!key) {
    return { provider: "prospeo", status: "skipped", message: "PROSPEO_API_KEY not set", emails: [], webUrl };
  }
  try {
    const res = await fetch("https://api.prospeo.io/domain-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-KEY": key,
      },
      body: JSON.stringify({ company: domain, limit: 10 }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { provider: "prospeo", status: "error", message: `Prospeo ${res.status}: ${t.slice(0, 120)}`, emails: [], webUrl };
    }
    const j = (await res.json()) as {
      response?: { email?: string; first_name?: string; last_name?: string }[];
      results?: { email?: string; first_name?: string; last_name?: string }[];
    };
    const rows = j.response ?? j.results ?? [];
    const emails: FoundEmail[] = [];
    for (const r of rows) {
      const value = (r.email ?? "").toLowerCase().trim();
      if (!isEmail(value)) continue;
      emails.push({
        email: value,
        provider: "prospeo",
        name: [r.first_name, r.last_name].filter(Boolean).join(" ") || null,
      });
    }
    return { provider: "prospeo", status: "ok", emails, webUrl, message: emails.length ? undefined : "No emails found" };
  } catch (e) {
    return { provider: "prospeo", status: "error", message: (e as Error).message, emails: [], webUrl };
  }
}

async function searchSnov(domain: string): Promise<ProviderSearchResult> {
  const meta = EMAIL_FINDER_PROVIDERS.find((p) => p.id === "snov")!;
  const webUrl = meta.webSearchUrl(domain);
  const clientId = env("SNOV_CLIENT_ID");
  const clientSecret = env("SNOV_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return { provider: "snov", status: "skipped", message: "SNOV_CLIENT_ID/SECRET not set", emails: [], webUrl };
  }
  try {
    const tokenRes = await fetch("https://api.snov.io/v1/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!tokenRes.ok) {
      return { provider: "snov", status: "error", message: `Snov auth ${tokenRes.status}`, emails: [], webUrl };
    }
    const tokenJ = (await tokenRes.json()) as { access_token?: string };
    const token = tokenJ.access_token;
    if (!token) {
      return { provider: "snov", status: "error", message: "Snov auth missing token", emails: [], webUrl };
    }
    const res = await fetch(
      `https://api.snov.io/v1/get-domain-emails-with-info?domain=${encodeURIComponent(domain)}&type=all&limit=10&lastId=0`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { provider: "snov", status: "error", message: `Snov ${res.status}: ${t.slice(0, 120)}`, emails: [], webUrl };
    }
    const j = (await res.json()) as {
      emails?: Array<{ email?: string; firstName?: string; lastName?: string }>;
      data?: { emails?: Array<{ email?: string }> };
    };
    const rows = j.emails ?? j.data?.emails ?? [];
    const emails: FoundEmail[] = [];
    for (const r of rows) {
      const value = (r.email ?? "").toLowerCase().trim();
      if (!isEmail(value)) continue;
      emails.push({
        email: value,
        provider: "snov",
        name: [("firstName" in r ? r.firstName : null), ("lastName" in r ? (r as { lastName?: string }).lastName : null)]
          .filter(Boolean)
          .join(" ") || null,
      });
    }
    return { provider: "snov", status: "ok", emails, webUrl, message: emails.length ? undefined : "No emails found" };
  } catch (e) {
    return { provider: "snov", status: "error", message: (e as Error).message, emails: [], webUrl };
  }
}

async function searchDatagma(domain: string): Promise<ProviderSearchResult> {
  const meta = EMAIL_FINDER_PROVIDERS.find((p) => p.id === "datagma")!;
  const webUrl = meta.webSearchUrl(domain);
  const key = env("DATAGMA_API_KEY");
  if (!key) {
    return { provider: "datagma", status: "skipped", message: "DATAGMA_API_KEY not set", emails: [], webUrl };
  }
  try {
    const url = new URL("https://gateway.datagma.net/api/ingress/v2/search");
    url.searchParams.set("apiId", key);
    url.searchParams.set("username", domain);
    const res = await fetch(url.toString());
    if (!res.ok) {
      return { provider: "datagma", status: "error", message: `Datagma ${res.status}`, emails: [], webUrl };
    }
    const j = (await res.json()) as { email?: string; emails?: string[] };
    const emails: FoundEmail[] = [];
    const list = [
      ...(j.email ? [j.email] : []),
      ...(Array.isArray(j.emails) ? j.emails : []),
    ];
    for (const raw of list) {
      const value = String(raw).toLowerCase().trim();
      if (isEmail(value)) emails.push({ email: value, provider: "datagma" });
    }
    return { provider: "datagma", status: "ok", emails, webUrl, message: emails.length ? undefined : "No emails found" };
  } catch (e) {
    return { provider: "datagma", status: "error", message: (e as Error).message, emails: [], webUrl };
  }
}

async function searchPersana(domain: string): Promise<ProviderSearchResult> {
  const meta = EMAIL_FINDER_PROVIDERS.find((p) => p.id === "persana")!;
  const webUrl = meta.webSearchUrl(domain);
  const key = env("PERSANA_API_KEY");
  if (!key) {
    return { provider: "persana", status: "skipped", message: "PERSANA_API_KEY not set", emails: [], webUrl };
  }
  try {
    const res = await fetch("https://api.persana.ai/v1/search/people", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ company_domain: domain, limit: 10 }),
    });
    if (!res.ok) {
      return { provider: "persana", status: "error", message: `Persana ${res.status}`, emails: [], webUrl };
    }
    const j = (await res.json()) as {
      data?: Array<{ email?: string; first_name?: string; last_name?: string }>;
      results?: Array<{ email?: string }>;
    };
    const rows = j.data ?? j.results ?? [];
    const emails: FoundEmail[] = [];
    for (const r of rows) {
      const value = (r.email ?? "").toLowerCase().trim();
      if (!isEmail(value)) continue;
      emails.push({
        email: value,
        provider: "persana",
        name: [("first_name" in r ? r.first_name : null), ("last_name" in r ? (r as { last_name?: string }).last_name : null)]
          .filter(Boolean)
          .join(" ") || null,
      });
    }
    return { provider: "persana", status: "ok", emails, webUrl, message: emails.length ? undefined : "No emails found" };
  } catch (e) {
    return { provider: "persana", status: "error", message: (e as Error).message, emails: [], webUrl };
  }
}

async function searchLusha(domain: string): Promise<ProviderSearchResult> {
  const meta = EMAIL_FINDER_PROVIDERS.find((p) => p.id === "lusha")!;
  const webUrl = meta.webSearchUrl(domain);
  const key = env("LUSHA_API_KEY");
  if (!key) {
    return { provider: "lusha", status: "skipped", message: "LUSHA_API_KEY not set", emails: [], webUrl };
  }
  try {
    const res = await fetch("https://api.lusha.com/v2/person", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_key: key,
      },
      body: JSON.stringify({
        filter: { companies: [{ domain }] },
        refreshJobInfo: false,
      }),
    });
    if (!res.ok) {
      return {
        provider: "lusha",
        status: "error",
        message: `Lusha ${res.status} (person API may need different plan)`,
        emails: [],
        webUrl,
      };
    }
    const j = (await res.json()) as { data?: { emailAddresses?: Array<{ email?: string }> } };
    const emails: FoundEmail[] = [];
    for (const e of j.data?.emailAddresses ?? []) {
      const value = (e.email ?? "").toLowerCase().trim();
      if (isEmail(value)) emails.push({ email: value, provider: "lusha" });
    }
    return { provider: "lusha", status: "ok", emails, webUrl, message: emails.length ? undefined : "No emails found" };
  } catch (e) {
    return { provider: "lusha", status: "error", message: (e as Error).message, emails: [], webUrl };
  }
}

function browserOnly(id: EmailFinderProviderId, domain: string): ProviderSearchResult {
  const meta = EMAIL_FINDER_PROVIDERS.find((p) => p.id === id)!;
  return {
    provider: id,
    status: "skipped",
    message: "No public API — open web tool",
    emails: [],
    webUrl: meta.webSearchUrl(domain),
  };
}

export async function searchEmailProviders(
  companyOrDomain: string,
  providerIds?: EmailFinderProviderId[],
): Promise<{
  domain: string;
  emails: FoundEmail[];
  pattern: string | null;
  mappedPattern: EmailPattern | null;
  providers: ProviderSearchResult[];
  sampleEmail: string | null;
}> {
  const domain = resolveSearchDomain(companyOrDomain);
  if (!domain || !domain.includes(".")) {
    throw new Error("Enter a company domain (e.g. allen.in or nvidia.com)");
  }

  const want = new Set(
    providerIds?.length
      ? providerIds
      : EMAIL_FINDER_PROVIDERS.filter((p) => p.hasApi).map((p) => p.id),
  );

  const tasks: Promise<ProviderSearchResult>[] = [];
  if (want.has("hunter")) tasks.push(searchHunter(domain));
  if (want.has("apollo")) tasks.push(searchApollo(domain));
  if (want.has("prospeo")) tasks.push(searchProspeo(domain));
  if (want.has("snov")) tasks.push(searchSnov(domain));
  if (want.has("datagma")) tasks.push(searchDatagma(domain));
  if (want.has("persana")) tasks.push(searchPersana(domain));
  if (want.has("lusha")) tasks.push(searchLusha(domain));
  if (want.has("kaspr")) tasks.push(Promise.resolve(browserOnly("kaspr", domain)));
  if (want.has("surfe")) tasks.push(Promise.resolve(browserOnly("surfe", domain)));
  if (want.has("cleanlist")) tasks.push(Promise.resolve(browserOnly("cleanlist", domain)));
  if (want.has("getprospect")) tasks.push(Promise.resolve(browserOnly("getprospect", domain)));
  if (want.has("clearout")) tasks.push(Promise.resolve(browserOnly("clearout", domain)));
  if (want.has("skrapp")) tasks.push(Promise.resolve(browserOnly("skrapp", domain)));
  if (want.has("findymail")) tasks.push(Promise.resolve(browserOnly("findymail", domain)));
  if (want.has("experte")) tasks.push(Promise.resolve(browserOnly("experte", domain)));

  const providers = await Promise.all(tasks);
  const seen = new Set<string>();
  const emails: FoundEmail[] = [];
  let pattern: string | null = null;
  for (const p of providers) {
    if (p.pattern && !pattern) pattern = p.pattern;
    for (const e of p.emails) {
      if (seen.has(e.email)) continue;
      seen.add(e.email);
      emails.push(e);
    }
  }

  // Prefer a generic-looking sample (not role accounts) when possible
  const sampleEmail =
    emails.find((e) => !/^(info|hr|careers|jobs|hello|contact|support|admin)@/i.test(e.email))?.email ??
    emails[0]?.email ??
    null;

  return {
    domain,
    emails,
    pattern,
    mappedPattern: mapHunterPattern(pattern),
    providers,
    sampleEmail,
  };
}

export function configuredProviderIds(): EmailFinderProviderId[] {
  return EMAIL_FINDER_PROVIDERS.filter((p) => {
    if (!p.hasApi) return false;
    return p.envKeys.every((k) => !!process.env[k]?.trim());
  }).map((p) => p.id);
}
