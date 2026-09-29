import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiChatJson } from "@/lib/ai-gateway";
import { parseAiJson } from "@/lib/parse-ai-json";

/** Lightly rewrite an outreach template to align with a pasted Job Description.
 *  Preserves 90-95% of the original wording; only tweaks keywords/skills/tone. */
export const updateTemplateByJD = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      subject: z.string().max(998).default(""),
      body: z.string().max(100_000).default(""),
      jobDescription: z.string().max(50_000).default(""),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const content = await aiChatJson({
      supabase: context.supabase,
      userId: context.userId,
      system:
        "You are updating an outreach email template to better align with a Job Description. Preserve 90-95% of the original wording, structure, and tone. ONLY change small details: mention 1-2 specific technologies, skills or keywords from the JD, and adjust the role/subject wording if needed. Keep ALL existing {{placeholder}} tokens intact. Return STRICT JSON only: {\"subject\":\"...\",\"body\":\"...\"}",
      user: `TEMPLATE SUBJECT:\n${data.subject}\n\nTEMPLATE BODY:\n${data.body}\n\nJOB DESCRIPTION:\n${data.jobDescription}`,
    });
    const parsed = parseAiJson<{ subject?: string; body?: string }>(content);
    return {
      subject: (parsed.subject ?? data.subject).toString(),
      body: (parsed.body ?? data.body).toString(),
    };
  });