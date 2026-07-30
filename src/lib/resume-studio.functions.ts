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

    const projectId = crypto.randomUUID();
    const prefix = `${userId}/${projectId}/`;

    // Upload main.tex + assets.
    const mainPath = `${prefix}${data.mainTexFilename}`;
    const mainUp = await context.supabase.storage
      .from("resume-latex")
      .upload(mainPath, new Blob([data.mainTexContent], { type: "application/x-tex" }), {
        contentType: "application/x-tex",
        upsert: true,
      });
    if (mainUp.error) throw new Error(mainUp.error.message);

    for (const f of data.extraFiles ?? []) {
      const buf = Buffer.from(f.base64, "base64");
      const up = await context.supabase.storage
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
      const { data: list } = await context.supabase.storage.from("resume-latex").list(proj.storage_prefix, { limit: 1000 });
      if (list && list.length) {
        await context.supabase.storage
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
    const { data: blob, error: dErr } = await context.supabase.storage
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

    const { data: blob, error: dErr } = await context.supabase.storage
      .from("resume-latex")
      .download(`${proj.storage_prefix}${proj.main_tex_filename}`);
    if (dErr || !blob) throw new Error(dErr?.message ?? "Could not read main.tex");
    const originalTex = await blob.text();

    const sys = [
      "You are a senior technical recruiter AND an expert LaTeX resume editor.",
      "GOAL: rewrite the resume so it feels hand-crafted for THIS role, while remaining 100% truthful.",
      "",
      "STEP 1 — Analyse the JD. Extract: role focus, required skills, technologies, responsibilities, preferred experience, ATS keywords, soft skills, tools.",
      "STEP 2 — Analyse the ORIGINAL resume. Identify which existing experience/projects/skills actually map to the JD.",
      "STEP 3 — Optimise. Rewrite ONLY textual content (bullets, summary, project descriptions, skill ordering) so that the most relevant existing experience is emphasised first, using JD vocabulary the candidate can honestly claim.",
      "",
      "TRUTHFULNESS RULES (hard constraints):",
      "- NEVER fabricate: no invented companies, internships, projects, certifications, technologies, tools, dates, metrics, or achievements.",
      "- If the JD mentions a technology the candidate does NOT already have in the resume, DO NOT add it to the resume. Put it in `missing_keywords` instead.",
      "- You MAY reframe an existing project to highlight adjacent relevance (e.g. \"scalable backend with AI-assisted search where applicable\") ONLY when the original scope genuinely supports it. When unsure, keep the original wording.",
      "- You MAY reorder projects, bullets and skills, and promote already-present keywords.",
      "- Preserve any measurable outcome the resume already contains; do not invent new numbers.",
      "",
      "WRITING STYLE:",
      "- Simple, recruiter-friendly, ATS-optimised English. Short sentences. Strong action verbs. Concise (avoid long paragraphs).",
      "- Prefer: \"Designed and shipped X using Y, improving Z by N%\" (only when N is already supported).",
      "- Avoid AI clichés and vague filler (\"leveraged synergies\", \"passionate about cutting-edge\", etc.).",
      "",
      "FORMATTING RULES (hard constraints):",
      "- Return the FULL .tex file back. Preserve every \\usepackage, \\newcommand, \\begin/\\end, packages, fonts, colors, margins, spacing, tables, icons byte-for-byte.",
      "- Only edit the *textual* content inside sections. Do NOT restructure LaTeX, do NOT add or remove packages, do NOT change document class.",
      "",
      "Return STRICT JSON only, no markdown, no prose:",
      `  {"tex":"<full updated .tex file>","ats_score":<0-100>,"matched_keywords":[...],"missing_keywords":[...],"strengths":[...],"suggestions":[...]}`,
    ].join("\n");
    const user = [
      `JOB DESCRIPTION:\n${data.jobDescription}`,
      data.jobTitle ? `\n\nTARGET ROLE: ${data.jobTitle}` : "",
      data.company ? `\nTARGET COMPANY: ${data.company}` : "",
      data.customInstructions ? `\n\nCUSTOM INSTRUCTIONS (respect while still following the truthfulness rules):\n${data.customInstructions}` : "",
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
      const { data: signed } = await context.supabase.storage
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
    const path = `${context.userId}/${v.project_id}/versions/${v.id}.pdf`;
    const buf = Buffer.from(data.pdfBase64, "base64");
    const up = await context.supabase.storage
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
      await context.supabase.storage.from("resume-latex").remove([v.pdf_storage_path]);
    }
    return { ok: true };
  });

const emailFromResumeSchema = z.object({
  versionId: z.string().uuid(),
  senderName: z.string().max(120).optional().nullable(),
  extraInstructions: z.string().max(2000).optional().nullable(),
  templateId: z.string().uuid().optional().nullable(),
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

    // Load the selected (or default) template, if any, so we can preserve ~90% of its structure.
    let templateSubject = "";
    let templateBody = "";
    let templateName = "";
    const tplQuery = context.supabase
      .from("templates")
      .select("name, subject, body, is_default")
      .eq("user_id", context.userId);
    const { data: tpl } = data.templateId
      ? await tplQuery.eq("id", data.templateId).maybeSingle()
      : await tplQuery.eq("is_default", true).maybeSingle();
    if (tpl) { templateName = tpl.name; templateSubject = tpl.subject ?? ""; templateBody = tpl.body ?? ""; }

    const sys = [
      "You customise an EXISTING job-application email template for a specific role.",
      "STRICT RULES:",
      "- Preserve ~90% of the template exactly (structure, tone, paragraphs, sign-off, {{variables}} like {{name}}/{{company}}). Only modify ~10% to make it relevant.",
      "- Do NOT rewrite the greeting; personalisation happens at send-time.",
      "- Never invent facts. Only reference experience already present in the RESUME.",
      "- Concise (100–150 words unless the user asks for more). Simple, professional, recruiter-friendly. Avoid AI clichés.",
      "- If NO template is supplied, write a short professional email from scratch (100–150 words) using {{name}} for the greeting placeholder.",
      "- Return STRICT JSON only: {\"subject\":\"...\",\"body\":\"...\"}",
    ].join("\n");
    const user = [
      templateBody || templateSubject
        ? `SELECTED TEMPLATE (name: ${templateName || "(untitled)"}):\nSUBJECT: ${templateSubject}\n---\nBODY:\n${templateBody}`
        : "NO TEMPLATE — write from scratch.",
      `Sender: ${data.senderName ?? "The applicant"}`,
      `Role: ${v.job_title ?? ""}`,
      `Company: ${v.company ?? ""}`,
      `JD (context only):\n${(v.job_description ?? "").slice(0, 4000)}`,
      data.extraInstructions ? `USER'S ADDITIONAL INSTRUCTIONS (highest priority, still respect the 90/10 rule):\n${data.extraInstructions}` : "",
      `RESUME (LaTeX, factual reference only — do not quote LaTeX):\n${v.tex_content.slice(0, 6000)}`,
    ].filter(Boolean).join("\n\n");
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
      subject: (parsed.subject ?? templateSubject ?? `Application: ${v.job_title ?? "Role"}${v.company ? ` at ${v.company}` : ""}`).trim(),
      body: (parsed.body ?? templateBody ?? "").trim(),
    };
  });


const sectionSchema = z.object({
  id: z.string().uuid(),
  section: z.enum(["summary", "experience", "projects", "skills", "ats"]),
  instructions: z.string().max(4000).optional().nullable(),
  jobDescription: z.string().max(50_000).optional().nullable(),
});
export const improveResumeSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sectionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI gateway not configured");
    const { data: v } = await context.supabase
      .from("resume_versions")
      .select("tex_content, job_description, job_title, company, custom_instructions")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (!v) throw new Error("Version not found");
    const focus =
      data.section === "summary" ? "the professional summary / objective section" :
      data.section === "experience" ? "the work experience bullets (rewrite bullets for clarity, impact, and ATS keyword coverage — reorder by relevance to the JD)" :
      data.section === "projects" ? "the projects section (rewrite descriptions for JD alignment, add measurable impact ONLY if already grounded, reorder bullets by relevance, keep it concise, highlight most relevant technologies)" :
      data.section === "skills" ? "the skills section — reorder and re-group so the JD-relevant, honestly-held skills appear first; do not add skills the resume does not already list" :
      "keyword coverage across the WHOLE document for ATS — surface honestly-held keywords already present, do not add anything the resume cannot support";
    const sys = [
      "You improve ONE section of a LaTeX resume with the mindset of a senior technical recruiter.",
      "HARD RULES:",
      "- Return the FULL updated .tex file. Preserve every LaTeX command, package, layout, spacing byte-for-byte outside the target section.",
      "- Never invent experience, companies, tools, metrics, projects, or certifications. Only reword or reorder content grounded in the CURRENT resume.",
      "- Optimise for the target role using JD vocabulary the candidate can honestly claim.",
      "- Simple, recruiter-friendly, ATS-optimised English. Short sentences. Strong action verbs. Avoid AI clichés.",
      "- Return STRICT JSON only: {\"tex\":\"<full updated file>\"}",
    ].join("\n");
    const user = [
      `SECTION TO IMPROVE: ${focus}`,
      v.job_title ? `TARGET ROLE: ${v.job_title}` : "",
      v.company ? `TARGET COMPANY: ${v.company}` : "",
      `JD CONTEXT:\n${(data.jobDescription || v.job_description || "").slice(0, 6000)}`,
      v.custom_instructions ? `EXISTING CUSTOM INSTRUCTIONS:\n${v.custom_instructions}` : "",
      data.instructions ? `USER'S ADDITIONAL INSTRUCTIONS (highest priority, still respect truthfulness):\n${data.instructions}` : "",
      `FULL CURRENT LaTeX (return the FULL file back):\n${v.tex_content}`,
    ].filter(Boolean).join("\n\n");
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

const updateWithInstructionsSchema = z.object({
  id: z.string().uuid(),
  instructions: z.string().trim().min(3).max(6000),
  jobDescription: z.string().max(50_000).optional().nullable(),
});

/** Improve the WHOLE resume according to free-form user instructions. */
export const updateResumeWithInstructions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateWithInstructionsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI gateway not configured");
    const { data: v } = await context.supabase
      .from("resume_versions")
      .select("tex_content, job_description, job_title, company")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (!v) throw new Error("Version not found");

    const { buildProfileContext } = await import("./user-profile.server");
    const profile = await buildProfileContext(context.supabase, context.userId);

    const sys = [
      "You are an expert LaTeX resume editor and senior technical recruiter.",
      "HARD RULES:",
      "- Return the FULL updated .tex file. Preserve the document class, packages, macros, layout and spacing exactly; change textual content only.",
      "- NEVER fabricate experience, employers, dates, projects, tools, certifications, education or metrics.",
      "- You may only use facts already present in the CURRENT RESUME or in the CANDIDATE PROFILE. If something is missing, omit it.",
      "- Follow the USER INSTRUCTIONS as closely as truthfulness allows.",
      "- Simple, recruiter-friendly, ATS-optimised English. Avoid AI clichés.",
      "- Return STRICT JSON only: {\"tex\":\"<full updated file>\",\"notes\":\"<one short sentence>\"}",
    ].join("\n");
    const user = [
      `USER INSTRUCTIONS:\n${data.instructions}`,
      v.job_title ? `TARGET ROLE: ${v.job_title}` : "",
      v.company ? `TARGET COMPANY: ${v.company}` : "",
      (data.jobDescription || v.job_description)
        ? `JOB DESCRIPTION:\n${(data.jobDescription || v.job_description || "").slice(0, 6000)}`
        : "",
      profile ? `CANDIDATE PROFILE (source of truth — never go beyond it):\n${profile}` : "",
      `CURRENT LaTeX (return the FULL file back):\n${v.tex_content}`,
    ].filter(Boolean).join("\n\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    if (!res.ok) throw new Error(`AI error ${res.status}`);
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const c = j.choices?.[0]?.message?.content ?? "";
    const m = c.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI returned invalid JSON");
    const parsed = JSON.parse(m[0]) as { tex?: string; notes?: string };
    const tex = (parsed.tex ?? "").trim();
    if (!tex.includes("\\")) throw new Error("AI did not return valid LaTeX");
    await context.supabase.from("resume_versions").update({ tex_content: tex }).eq("id", data.id).eq("user_id", context.userId);
    return { tex, notes: parsed.notes ?? "" };
  });

const rewriteSelectionSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  selection: z.string().min(1).max(20_000),
  instructions: z.string().trim().min(2).max(4000),
  jobDescription: z.string().max(50_000).optional().nullable(),
  context: z.string().max(20_000).optional().nullable(),
});

/** Cursor-style inline edit: rewrite ONLY the selected LaTeX range. */
export const rewriteResumeSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rewriteSelectionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI gateway not configured");

    let jd = data.jobDescription ?? "";
    if (data.id) {
      const { data: v } = await context.supabase
        .from("resume_versions")
        .select("job_description, job_title, company")
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (v && !jd) jd = v.job_description ?? "";
    }
    const { buildProfileContext } = await import("./user-profile.server");
    const profile = await buildProfileContext(context.supabase, context.userId);

    const sys = [
      "You rewrite ONE selected fragment of a LaTeX resume.",
      "HARD RULES:",
      "- Return ONLY the replacement for the SELECTED FRAGMENT. Do not return the whole document, no markdown fences, no commentary.",
      "- Keep the same LaTeX structure/commands the fragment already uses so it still compiles inside the document.",
      "- NEVER fabricate facts. Only reword, tighten, reorder, or emphasise what the fragment / profile already supports.",
      "- Simple, recruiter-friendly, ATS-optimised English.",
      "- Return STRICT JSON only: {\"replacement\":\"<latex>\"}",
    ].join("\n");
    const user = [
      `USER INSTRUCTIONS:\n${data.instructions}`,
      jd ? `JOB DESCRIPTION:\n${jd.slice(0, 5000)}` : "",
      profile ? `CANDIDATE PROFILE (facts you may rely on):\n${profile}` : "",
      data.context ? `SURROUNDING DOCUMENT (context only, do not return):\n${data.context.slice(0, 6000)}` : "",
      `SELECTED FRAGMENT (rewrite exactly this):\n${data.selection}`,
    ].filter(Boolean).join("\n\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    if (!res.ok) throw new Error(`AI error ${res.status}`);
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const c = j.choices?.[0]?.message?.content ?? "";
    const m = c.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI returned invalid JSON");
    const parsed = JSON.parse(m[0]) as { replacement?: string };
    const replacement = (parsed.replacement ?? "").replace(/^```[a-z]*\n?|```$/g, "").trim();
    if (!replacement) throw new Error("AI returned an empty replacement");
    return { replacement };
  });
