import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Lightly rewrite an outreach template to align with a pasted Job Description.
 *  Preserves 90-95% of the original wording; only tweaks keywords/skills/tone. */
export const updateTemplateByJD = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      subject: z.string().min(1).max(998),
      body: z.string().min(1).max(100_000),
      jobDescription: z.string().min(10).max(50_000),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI gateway not configured");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are updating an outreach email template to better align with a Job Description. Preserve 90-95% of the original wording, structure, and tone. ONLY change small details: mention 1-2 specific technologies, skills or keywords from the JD, and adjust the role/subject wording if needed. Keep ALL existing {{placeholder}} tokens intact. Return STRICT JSON only: {\"subject\":\"...\",\"body\":\"...\"}",
          },
          {
            role: "user",
            content: `TEMPLATE SUBJECT:\n${data.subject}\n\nTEMPLATE BODY:\n${data.body}\n\nJOB DESCRIPTION:\n${data.jobDescription}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    if (!res.ok) throw new Error(`AI error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = j.choices?.[0]?.message?.content ?? "";
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI returned invalid JSON");
    const parsed = JSON.parse(m[0]) as { subject?: string; body?: string };
    return {
      subject: (parsed.subject ?? data.subject).toString(),
      body: (parsed.body ?? data.body).toString(),
    };
  });