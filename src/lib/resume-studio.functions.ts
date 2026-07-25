import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ResumeProject = {
  id: string;
  name: string;
  description: string | null;
  storage_prefix: string;
  main_tex_filename: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type ResumeVersion = {
  id: string;
  project_id: string;
  job_title: string | null;
  company: string | null;
  job_description: string;
  custom_instructions: string | null;
  tex_content: string;
  pdf_storage_path: string | null;
  ats_score: number | null;
  matched_keywords: string[];
  missing_keywords: string[];
  strengths: string[];
  suggestions: string[];
  created_at: string;
  updated_at: string;
};

export const listResumeProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ResumeProject[]> => {
    const { data, error } = await context.supabase
      .from("resume_projects")
      .select("id, name, description, storage_prefix, main_tex_filename, is_default, created_at, updated_at")
      .eq("user_id", context.userId)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ResumeProject[];
  });

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional().nullable(),
  mainTexFilename: z.string().min(1).max(255).default("resume.tex"),
  mainTexContent: z.string().min(1).max(500_000),
  extraFiles: z.array(z.object({
    filename: z.string().min(1).max(255),
    mimeType: z.string().max(128).optional(),
    base64: z.string().min(1),
    size: z.number().int().positive().max(5 * 1024 * 1024),
  })).max(30).optional(),
  makeDefault: z.boolean().optional(),
});

export const createResumeProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createProjectSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const projectId = crypto.randomUUID();
    const prefix = `${userId}/${projectId}/`;

    // Upload main.tex + assets.
    const mainPath = `${prefix}${data.mainTexFilename}`;
    const mainUp = await supabaseAdmin.storage
      .from("resume-latex")
      .upload(mainPath, new Blob([data.mainTexContent], { type: "application/x-tex" }), {
        contentType: "application/x-tex",
        upsert: true,
      });
    if (mainUp.error) throw new Error(mainUp.error.message);

    for (const f of data.extraFiles ?? []) {
      const buf = Buffer.from(f.base64, "base64");
      const up = await supabaseAdmin.storage
        .from("resume-latex")
        .upload(`${prefix}${f.filename}`, buf, {
          contentType: f.mimeType || "application/octet-stream",
          upsert: true,
        });
      if (up.error) throw new Error(`${f.filename}: ${up.error.message}`);
    }

    // Make default if no others yet.
    const { count } = await supabase
      .from("resume_projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    const shouldDefault = data.makeDefault || !count;
    if (shouldDefault) {
      await supabase
        .from("resume_projects")
        .update({ is_default: false })
        .eq("user_id", userId)
        .eq("is_default", true);
    }

    const { data: row, error } = await supabase
      .from("resume_projects")
      .insert({
        id: projectId,
        user_id: userId,
        name: data.name,
        description: data.description ?? null,
        storage_prefix: prefix,
        main_tex_filename: data.mainTexFilename,
        is_default: shouldDefault,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as ResumeProject;
  });

export const deleteResumeProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: proj } = await context.supabase
      .from("resume_projects")
      .select("storage_prefix")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    const { error } = await context.supabase
      .from("resume_projects")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    if (proj?.storage_prefix) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: list } = await supabaseAdmin.storage.from("resume-latex").list(proj.storage_prefix, { limit: 1000 });
      if (list && list.length) {
        await supabaseAdmin.storage
          .from("resume-latex")
          .remove(list.map((f) => `${proj.storage_prefix}${f.name}`));
      }
    }
    return { ok: true };
  });

export const getResumeProjectMainTex = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: proj, error } = await context.supabase
      .from("resume_projects")
      .select("storage_prefix, main_tex_filename, name")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (error || !proj) throw new Error(error?.message ?? "Project not found");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: blob, error: dErr } = await supabaseAdmin.storage
      .from("resume-latex")
      .download(`${proj.storage_prefix}${proj.main_tex_filename}`);
    if (dErr || !blob) throw new Error(dErr?.message ?? "Could not read main.tex");
    return { tex: await blob.text(), name: proj.name, mainTexFilename: proj.main_tex_filename };
  });

export const listResumeVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("resume_versions")
      .select("id, project_id, job_title, company, job_description, ats_score, created_at, updated_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.projectId) q = q.eq("project_id", data.projectId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const generateSchema = z.object({
  projectId: z.string().uuid(),
  jobDescription: z.string().min(20).max(50_000),
  jobTitle: z.string().max(200).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  customInstructions: z.string().max(4000).optional().nullable(),
});

/** Extract likely job title / company from a JD when the user didn't supply them. */
function guessTitleCompany(jd: string): { title?: string; company?: string } {
  const first = jd.split(/\n/).find((l) => l.trim().length > 0)?.trim() ?? "";
  const titleMatch = first.match(/(?:role|position|title)\s*[:\-]\s*(.+)/i);
  const compMatch = jd.match(/(?:company|employer|organization)\s*[:\-]\s*(.+)/i);
  return {
    title: titleMatch?.[1]?.slice(0, 120) ?? (first && first.length < 120 ? first : undefined),
    company: compMatch?.[1]?.slice(0, 120),
  };
}

export const generateResumeVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => generateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI gateway not configured");
    const { data: proj, error } = await context.supabase
      .from("resume_projects")
      .select("storage_prefix, main_tex_filename")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .single();
    if (error || !proj) throw new Error("Project not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: blob, error: dErr } = await supabaseAdmin.storage
      .from("resume-latex")
      .download(`${proj.storage_prefix}${proj.main_tex_filename}`);
    if (dErr || !blob) throw new Error(dErr?.message ?? "Could not read main.tex");
    const originalTex = await blob.text();

    const sys = [
      "You are an expert resume editor working on a LaTeX source file.",
      "STRICT RULES:",
      "- NEVER fabricate experience, companies, projects, internships, skills, certifications, or achievements.",
      "- Preserve the LaTeX layout, packages, fonts, colors, margins, spacing, tables, icons, and every command exactly.",
      "- Only rewrite textual content inside sections (bullet points, summaries, wording).",
      "- You MAY reorder existing projects/skills/bullets, and emphasize technologies already present in the source.",
      "- If the JD mentions a technology the user doesn't already have in the resume, do NOT add it. Include it in `missing_keywords` instead.",
      "- Keep every \\usepackage, \\newcommand, \\begin/\\end block, and preamble byte-for-byte unless the change is unavoidable.",
      "- Return STRICT JSON only, no markdown, no prose:",
      `  {"tex":"<full updated .tex file>","ats_score":<0-100>,"matched_keywords":[...],"missing_keywords":[...],"strengths":[...],"suggestions":[...]}`,
    ].join("\n");
    const user = [
      `JOB DESCRIPTION:\n${data.jobDescription}`,
      data.customInstructions ? `\n\nCUSTOM INSTRUCTIONS:\n${data.customInstructions}` : "",
      `\n\nORIGINAL resume.tex (do NOT change formatting, only content):\n\n${originalTex}`,
    ].join("");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
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
    const parsed = JSON.parse(m[0]) as {
      tex?: string;
      ats_score?: number;
      matched_keywords?: string[];
      missing_keywords?: string[];
      strengths?: string[];
      suggestions?: string[];
    };
    const tex = (parsed.tex ?? "").trim();
    if (!tex || !tex.includes("\\")) throw new Error("AI did not return a valid LaTeX file");

    const guess = guessTitleCompany(data.jobDescription);
    const { data: row, error: iErr } = await context.supabase
      .from("resume_versions")
      .insert({
        user_id: context.userId,
        project_id: data.projectId,
        job_title: data.jobTitle ?? guess.title ?? null,
        company: data.company ?? guess.company ?? null,
        job_description: data.jobDescription,
        custom_instructions: data.customInstructions ?? null,
        tex_content: tex,
        ats_score: typeof parsed.ats_score === "number" ? Math.max(0, Math.min(100, Math.round(parsed.ats_score))) : null,
        matched_keywords: parsed.matched_keywords ?? [],
        missing_keywords: parsed.missing_keywords ?? [],
        strengths: parsed.strengths ?? [],
        suggestions: parsed.suggestions ?? [],
      })
      .select()
      .single();
    if (iErr) throw new Error(iErr.message);
    return row as ResumeVersion;
  });

export const getResumeVersion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: v, error } = await context.supabase
      .from("resume_versions")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (error || !v) throw new Error(error?.message ?? "Version not found");
    const { data: proj } = await context.supabase
      .from("resume_projects")
      .select("id, name, main_tex_filename")
      .eq("id", v.project_id)
      .maybeSingle();
    let pdfUrl: string | null = null;
    if (v.pdf_storage_path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed } = await supabaseAdmin.storage
        .from("resume-latex")
        .createSignedUrl(v.pdf_storage_path, 60 * 30);
      pdfUrl = signed?.signedUrl ?? null;
    }
    return { version: v as ResumeVersion, project: proj, pdfUrl };
  });

export const updateResumeVersionTex = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), tex: z.string().min(1).max(500_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("resume_versions")
      .update({ tex_content: data.tex })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const uploadResumeVersionPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), pdfBase64: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: v } = await context.supabase
      .from("resume_versions")
      .select("id, project_id")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (!v) throw new Error("Version not found");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${context.userId}/${v.project_id}/versions/${v.id}.pdf`;
    const buf = Buffer.from(data.pdfBase64, "base64");
    const up = await supabaseAdmin.storage
      .from("resume-latex")
      .upload(path, buf, { contentType: "application/pdf", upsert: true });
    if (up.error) throw new Error(up.error.message);
    await context.supabase
      .from("resume_versions")
      .update({ pdf_storage_path: path })
      .eq("id", v.id);
    return { ok: true, path };
  });

export const deleteResumeVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: v } = await context.supabase
      .from("resume_versions")
      .select("pdf_storage_path")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    const { error } = await context.supabase
      .from("resume_versions")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    if (v?.pdf_storage_path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("resume-latex").remove([v.pdf_storage_path]);
    }
    return { ok: true };
  });

const emailFromResumeSchema = z.object({
  versionId: z.string().uuid(),
  senderName: z.string().max(120).optional().nullable(),
  extraInstructions: z.string().max(2000).optional().nullable(),
});

export const generateApplicationEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => emailFromResumeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI gateway not configured");
    const { data: v, error } = await context.supabase
      .from("resume_versions")
      .select("job_title, company, job_description, tex_content")
      .eq("id", data.versionId)
      .eq("user_id", context.userId)
      .single();
    if (error || !v) throw new Error("Version not found");
    const sys = "You draft short, sincere job application emails. Return STRICT JSON: {\"subject\":\"...\",\"body\":\"...\"}. Under 180 words. Do not invent facts.";
    const user = `Sender: ${data.senderName ?? "The applicant"}\nJob title: ${v.job_title ?? ""}\nCompany: ${v.company ?? ""}\nJD:\n${v.job_description.slice(0, 3000)}${data.extraInstructions ? `\n\nExtra:\n${data.extraInstructions}` : ""}\n\nResume LaTeX excerpt (for facts only, do not quote LaTeX):\n${v.tex_content.slice(0, 6000)}`;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`AI error ${res.status}`);
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const c = j.choices?.[0]?.message?.content ?? "";
    const m = c.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI returned invalid JSON");
    const parsed = JSON.parse(m[0]) as { subject?: string; body?: string };
    return {
      subject: (parsed.subject ?? `Application: ${v.job_title ?? "Role"}${v.company ? ` at ${v.company}` : ""}`).trim(),
      body: (parsed.body ?? "").trim(),
    };
  });

const sectionSchema = z.object({
  id: z.string().uuid(),
  section: z.enum(["summary", "experience", "projects", "skills", "ats"]),
});
export const improveResumeSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sectionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI gateway not configured");
    const { data: v } = await context.supabase
      .from("resume_versions")
      .select("tex_content, job_description")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (!v) throw new Error("Version not found");
    const focus =
      data.section === "summary" ? "the professional summary / objective section" :
      data.section === "experience" ? "the work experience bullets" :
      data.section === "projects" ? "the projects section bullets" :
      data.section === "skills" ? "the skills section ordering / emphasis" :
      "keyword coverage across the whole document for ATS";
    const sys = "You improve ONE section of a LaTeX resume. Return STRICT JSON {\"tex\":\"<full updated file>\"}. Preserve every LaTeX command, package, layout. Never invent facts. Only rewrite words already grounded in the resume's existing content.";
    const user = `Improve ${focus}. JD context:\n${(v.job_description ?? "").slice(0, 3000)}\n\nCurrent LaTeX (return the FULL file back):\n${v.tex_content}`;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`AI error ${res.status}`);
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const c = j.choices?.[0]?.message?.content ?? "";
    const m = c.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI returned invalid JSON");
    const parsed = JSON.parse(m[0]) as { tex?: string };
    const tex = (parsed.tex ?? "").trim();
    if (!tex.includes("\\")) throw new Error("AI did not return valid LaTeX");
    await context.supabase.from("resume_versions").update({ tex_content: tex }).eq("id", data.id);
    return { tex };
  });
