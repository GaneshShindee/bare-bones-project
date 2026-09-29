import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiChatJson } from "@/lib/ai-gateway";
import { parseAiJson } from "@/lib/parse-ai-json";

const schema = z.object({
  instructions: z.string().min(10).max(20_000),
  data: z.string().min(1).max(500_000),
});

export type GeneratedEmail = { email: string };
export type SkippedRecord = { name: string; reason: string };
export type GenerateResult = { emails: string[]; skipped: SkippedRecord[] };

const SYSTEM = `You are an email-address extraction assistant. The user provides:
1) INSTRUCTIONS describing the email format and the rules for which names to keep or skip.
2) DATA containing messy unstructured text (LinkedIn dumps, spreadsheets, lists, PDFs).

Your job:
- Extract real human names from DATA. Ignore UI/job-title noise like "Connect", "Follow", "Hiring", "Open to Work", "2nd", "Mutual Connection", "People you may know", descriptions, companies, badges.
- Remove honorifics/prefixes (Mr, Mrs, Ms, Md, Mohd, Dr, Prof, Er) before generating emails.
- Apply the INSTRUCTIONS rules exactly to build email addresses.
- Skip records that violate rules (one-word names, initials only, names ending with ..., last name too short, incomplete names, duplicates).
- Deduplicate emails.
- Lowercase emails. Strip diacritics/accents. Remove spaces and special chars from name parts.

Return STRICT JSON only, matching:
{ "emails": ["a@x.com", ...], "skipped": [{ "name": "...", "reason": "..." }, ...] }
No prose, no markdown, no commentary.`;

export const generateEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }): Promise<GenerateResult> => {
    const content = await aiChatJson({
      supabase: context.supabase,
      userId: context.userId,
      system: SYSTEM,
      user: `INSTRUCTIONS:\n${data.instructions}\n\nDATA:\n${data.data}`,
    });
    const parsed = parseAiJson(content);

    const out = parsed as { emails?: unknown; skipped?: unknown };
    const emailsRaw = Array.isArray(out.emails) ? out.emails : [];
    const skippedRaw = Array.isArray(out.skipped) ? out.skipped : [];

    const seen = new Set<string>();
    const emails: string[] = [];
    for (const e of emailsRaw) {
      if (typeof e !== "string") continue;
      const v = e.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) continue;
      if (seen.has(v)) continue;
      seen.add(v);
      emails.push(v);
    }
    const skipped: SkippedRecord[] = skippedRaw
      .map((s) => {
        const o = s as { name?: unknown; reason?: unknown };
        return {
          name: typeof o.name === "string" ? o.name : "",
          reason: typeof o.reason === "string" ? o.reason : "Skipped",
        };
      })
      .filter((s) => s.name);

    return { emails, skipped };
  });