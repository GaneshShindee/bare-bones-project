import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only helpers for the Profile module.
 *
 * The generated Supabase types may lag behind the profile migration, so we use
 * an untyped view of the client here. Every query is still scoped to the
 * authenticated user AND protected by RLS.
 */
type UntypedClient = SupabaseClient;

export type ProfileDetails = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  portfolio: string;
  summary: string;
};

export type ProfileEntry = {
  id: string;
  section: string;
  title: string;
  subtitle: string;
  location: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  description: string;
  bullets: string[];
  tags: string[];
  url: string;
  sort_order: number;
};

export type FullProfile = {
  details: ProfileDetails | null;
  entries: ProfileEntry[];
};

export async function loadFullProfile(
  supabase: unknown,
  userId: string,
): Promise<FullProfile> {
  const db = supabase as UntypedClient;
  const [detailsRes, entriesRes] = await Promise.all([
    db.from("profile_details").select("*").eq("user_id", userId).maybeSingle(),
    db
      .from("profile_entries")
      .select("*")
      .eq("user_id", userId)
      .order("section", { ascending: true })
      .order("sort_order", { ascending: true }),
  ]);
  const details = (detailsRes.data ?? null) as ProfileDetails | null;
  const entries = ((entriesRes.data ?? []) as ProfileEntry[]).map((e) => ({
    ...e,
    bullets: Array.isArray(e.bullets) ? e.bullets : [],
    tags: Array.isArray(e.tags) ? e.tags : [],
  }));
  return { details, entries };
}

const SECTION_LABEL: Record<string, string> = {
  education: "EDUCATION",
  experience: "EXPERIENCE",
  project: "PROJECTS",
  skill: "SKILLS",
  certification: "CERTIFICATIONS",
  achievement: "ACHIEVEMENTS",
  language: "LANGUAGES",
};

function entryLine(e: ProfileEntry): string {
  const head = [e.title, e.subtitle].filter(Boolean).join(" — ");
  const when = [e.start_date, e.is_current ? "Present" : e.end_date].filter(Boolean).join(" to ");
  const meta = [when, e.location, e.url].filter(Boolean).join(" | ");
  const lines = [`- ${head}${meta ? ` (${meta})` : ""}`];
  if (e.description) lines.push(`  ${e.description}`);
  for (const b of e.bullets) lines.push(`  * ${b}`);
  if (e.tags.length) lines.push(`  tags: ${e.tags.join(", ")}`);
  return lines.join("\n");
}

/**
 * Plain-text rendering of the profile used as the factual source of truth for
 * every AI generation. Returns "" when the user has no profile yet, so callers
 * can simply skip the section.
 */
export async function buildProfileContext(supabase: unknown, userId: string): Promise<string> {
  let profile: FullProfile;
  try {
    profile = await loadFullProfile(supabase, userId);
  } catch {
    return "";
  }
  const { details, entries } = profile;
  const out: string[] = [];
  if (details) {
    const personal = [
      [details.first_name, details.last_name].filter(Boolean).join(" "),
      details.email,
      details.phone,
      details.location,
      details.linkedin,
      details.github,
      details.portfolio,
    ].filter(Boolean);
    if (personal.length) out.push(`PERSONAL:\n${personal.join(" | ")}`);
    if (details.summary) out.push(`SUMMARY:\n${details.summary}`);
  }
  const bySection = new Map<string, ProfileEntry[]>();
  for (const e of entries) {
    const list = bySection.get(e.section) ?? [];
    list.push(e);
    bySection.set(e.section, list);
  }
  for (const [section, list] of bySection) {
    out.push(`${SECTION_LABEL[section] ?? section.toUpperCase()}:\n${list.map(entryLine).join("\n")}`);
  }
  return out.join("\n\n").slice(0, 12_000);
}
