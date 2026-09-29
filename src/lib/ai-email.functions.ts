import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiChatJson } from "@/lib/ai-gateway";
import { parseAiJson } from "@/lib/parse-ai-json";

/**
 * AI email generator that preserves the SELECTED template's structure.
 * Only ~10% of the content is customised — the remaining ~90% (formatting,
 * paragraph order, sign-off, tone) must remain intact. Personalisation of the
 * greeting stays a runtime send-time concern; this function returns a template
 * that still contains {{name}} / {{company}} variables when appropriate.
 */
const schema = z.object({
  templateId: z.string().uuid().optional().nullable(),
  jobDescription: z.string().max(50_000).optional().nullable(),
  /** Full community-job dump (skills, location, salary, etc.). */
  jobContext: z.string().max(50_000).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  jobTitle: z.string().max(200).optional().nullable(),
  resumeVersionId: z.string().uuid().optional().nullable(),
  instructions: z.string().max(4000).optional().nullable(),
});

export type AiEmailResult = { subject: string; body: string };

export const generateAiEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }): Promise<AiEmailResult> => {
    let templateSubject = "";
    let templateBody = "";
    let templateName = "";
    if (data.templateId) {
      const { data: t } = await context.supabase
        .from("templates")
        .select("name, subject, body")
        .eq("id", data.templateId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (t) {
        templateName = t.name;
        templateSubject = t.subject ?? "";
        templateBody = t.body ?? "";
      }
    }

    let resumeTex = "";
    if (data.resumeVersionId) {
      const { data: v } = await context.supabase
        .from("resume_versions")
        .select("tex_content, job_title, company, job_description")
        .eq("id", data.resumeVersionId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (v) {
        resumeTex = v.tex_content ?? "";
        if (!data.jobDescription) data.jobDescription = v.job_description ?? null;
        if (!data.company) data.company = v.company ?? null;
        if (!data.jobTitle) data.jobTitle = v.job_title ?? null;
      }
    }

    const sys = [
      "You customise an EXISTING job-application email template.",
      "STRICT RULES:",
      "- Preserve approximately 90% of the template exactly: overall structure, paragraphs, tone, sign-off, formatting, and any {{variables}} such as {{name}} or {{company}}.",
      "- Only modify approximately 10% of the content to make it relevant to the specific role and company.",
      "- Do NOT rewrite the entire template. Do NOT change the greeting line (it is handled at send time).",
      "- Do NOT invent experience, projects, tools, employers, or achievements. Only reference facts already present in the RESUME.",
      "- Keep the email concise (roughly 100–150 words unless the user explicitly asks for more).",
      "- Prefer simple, professional, recruiter-friendly language. Avoid AI clichés (\"I am thrilled\", \"in today's fast-paced world\", etc.).",
      "- Preserve any template placeholders (e.g. {{name}}, {{company}}, {{role}}). Do not replace them with literal values.",
      "- If the template already has a subject line, keep its style; only refresh the role/company reference where needed.",
      "- Return STRICT JSON only, no markdown, no prose: {\"subject\":\"...\",\"body\":\"...\"}",
    ].join("\n");

    const parts: string[] = [];
    if (templateBody || templateSubject) {
      parts.push(`SELECTED TEMPLATE (name: ${templateName || "(untitled)"}):\nSUBJECT: ${templateSubject}\n---\nBODY:\n${templateBody}`);
    } else {
      parts.push("NO TEMPLATE was supplied. Write a short professional application email (100–150 words) with a matching subject line. Use {{name}} for the greeting placeholder.");
    }
    if (data.jobTitle) parts.push(`ROLE: ${data.jobTitle}`);
    if (data.company) parts.push(`COMPANY: ${data.company}`);
    const jobBlob = (data.jobContext || data.jobDescription || "").trim();
    if (jobBlob) parts.push(`FULL JOB POSTING (use all of this context):\n${jobBlob.slice(0, 12_000)}`);
    if (resumeTex) parts.push(`RESUME (LaTeX source, factual reference only — do not quote LaTeX):\n${resumeTex.slice(0, 8000)}`);
    if (data.instructions) parts.push(`USER'S ADDITIONAL INSTRUCTIONS (highest priority, still respect the 90/10 rule):\n${data.instructions}`);

    const content = await aiChatJson({
      supabase: context.supabase,
      userId: context.userId,
      system: sys,
      user: parts.join("\n\n"),
    });
    const parsed = parseAiJson<{ subject?: string; body?: string }>(content);
    const subject = (parsed.subject ?? templateSubject ?? "").trim();
    const body = (parsed.body ?? templateBody ?? "").trim();
    if (!body) throw new Error("AI returned empty body");
    return { subject, body };
  });
