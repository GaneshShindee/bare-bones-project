import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { aiChatJson } from "@/lib/ai-gateway";
import { parseAiJson } from "@/lib/parse-ai-json";
/** AI job field extraction (shared by paste, URL, RSS, ATS, Telegram). */

export async function aiExtractJobFields(
  text: string,
  ai: { supabase: SupabaseClient<Database>; userId: string },
) {
  const sys =
    "You extract job information from arbitrary text (LinkedIn, Greenhouse, Lever, careers pages, emails, PDFs, Telegram posts). Return STRICT JSON with keys: title, company, location, work_mode (remote|hybrid|onsite|''), employment_type (full-time|intern|contract|part-time|''), experience, salary, description, responsibilities (string[]), skills (string[]), technologies (string[]), tags (string[]), recruiter_email, apply_url, company_website. If a field is unknown, use an empty string or empty array. Do not invent facts. No markdown, no prose.";
  const content = await aiChatJson({
    supabase: ai.supabase,
    userId: ai.userId,
    system: sys,
    user: text.slice(0, 45_000),
  });
  const parsed = parseAiJson<Record<string, unknown>>(content);
  const asStr = (k: string) => (typeof parsed[k] === "string" ? (parsed[k] as string) : "");
  const asArr = (k: string) =>
    Array.isArray(parsed[k]) ? ((parsed[k] as unknown[]).filter((x) => typeof x === "string") as string[]) : [];
  return {
    title: asStr("title"),
    company: asStr("company"),
    location: asStr("location"),
    work_mode: asStr("work_mode"),
    employment_type: asStr("employment_type"),
    experience: asStr("experience"),
    salary: asStr("salary"),
    description: asStr("description"),
    responsibilities: asArr("responsibilities"),
    skills: asArr("skills"),
    technologies: asArr("technologies"),
    tags: asArr("tags"),
    recruiter_email: asStr("recruiter_email"),
    apply_url: asStr("apply_url"),
    company_website: asStr("company_website"),
  };
}

export type ParsedJobFields = Awaited<ReturnType<typeof aiExtractJobFields>>;

export function normalizeHttpUrl(raw: string): string {
  const t = raw.trim();
  if (!t) throw new Error("URL is required");
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}
