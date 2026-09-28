import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiChatJson } from "@/lib/ai-gateway";
import { parseAiJson } from "@/lib/parse-ai-json";

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
  name: z.string().trim().max(120).default(""),
  description: z.string().max(1000).optional().nullable(),
  mainTexFilename: z.string().max(255).default("resume.tex"),
  mainTexContent: z.string().max(500_000).default(""),
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

    const mainFilename = (data.mainTexFilename || "resume.tex").replace(/\.tex$/i, "") + ".tex";
    const projectName = data.name.trim() || mainFilename.replace(/\.tex$/i, "") || "Master resume";

    // Upload main.tex + assets.
    const mainPath = `${prefix}${mainFilename}`;
    const mainUp = await context.supabase.storage
      .from("resume-latex")
      .upload(mainPath, new Blob([data.mainTexContent ?? ""], { type: "application/x-tex" }), {
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
        name: projectName,
        description: data.description ?? null,
        storage_prefix: prefix,
        main_tex_filename: mainFilename,
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

export const setDefaultResumeProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("resume_projects")
      .update({ is_default: false })
      .eq("user_id", context.userId)
      .eq("is_default", true);
    const { error } = await context.supabase
      .from("resume_projects")
      .update({ is_default: true })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
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

/**
 * Duplicate a master resume's .tex as a new editable version — no AI call.
 * Lets the user start from an exact copy, then edit manually or with "Ask AI" in the workspace.
 */
export const duplicateResumeProjectAsVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: proj, error } = await context.supabase
      .from("resume_projects")
      .select("storage_prefix, main_tex_filename, name")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .single();
    if (error || !proj) throw new Error("Project not found");

    const { data: blob, error: dErr } = await context.supabase.storage
      .from("resume-latex")
      .download(`${proj.storage_prefix}${proj.main_tex_filename}`);
    if (dErr || !blob) throw new Error(dErr?.message ?? "Could not read main.tex");
    const tex = await blob.text();

    const { data: row, error: iErr } = await context.supabase
      .from("resume_versions")
      .insert({
        user_id: context.userId,
        project_id: data.projectId,
        job_title: `Copy of ${proj.name}`,
        company: null,
        job_description: "",
        custom_instructions: null,
        tex_content: tex,
        ats_score: null,
        matched_keywords: [],
        missing_keywords: [],
        strengths: [],
        suggestions: [],
      })
      .select()
      .single();
    if (iErr) throw new Error(iErr.message);
    return row as ResumeVersion;
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
  jobDescription: z.string().max(50_000).default(""),
  /** Optional richer dump from community jobs (skills, salary, etc.). Merged into JD. */
  jobContext: z.string().max(50_000).optional().nullable(),
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

    const ctx = (data.jobContext ?? "").trim();
    const jd = (data.jobDescription ?? "").trim();
    const fullJd = ctx && jd && ctx !== jd ? `${ctx}\n\n${jd}` : ctx || jd;

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
      `JOB POSTING (use ALL of this — title, company, location, mode, experience, salary, skills, technologies, responsibilities, description):\n${fullJd}`,
      data.jobTitle ? `\n\nTARGET ROLE: ${data.jobTitle}` : "",
      data.company ? `\nTARGET COMPANY: ${data.company}` : "",
      data.customInstructions ? `\n\nCUSTOM INSTRUCTIONS (respect while still following the truthfulness rules):\n${data.customInstructions}` : "",
      `\n\nORIGINAL resume.tex (do NOT change formatting, only content):\n\n${originalTex}`,
    ].join("");

    const content = await aiChatJson({ supabase: context.supabase, userId: context.userId, system: sys, user });
    const parsed = parseAiJson<{
      tex?: string;
      ats_score?: number;
      matched_keywords?: string[];
      missing_keywords?: string[];
      strengths?: string[];
      suggestions?: string[];
    }>(content);
    const tex = (parsed.tex ?? "").trim();
    if (!tex || !tex.includes("\\")) throw new Error("AI did not return a valid LaTeX file");

    const guess = guessTitleCompany(fullJd);
    const { data: row, error: iErr } = await context.supabase
      .from("resume_versions")
      .insert({
        user_id: context.userId,
        project_id: data.projectId,
        job_title: data.jobTitle ?? guess.title ?? null,
        company: data.company ?? guess.company ?? null,
        job_description: fullJd,
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

async function mirrorVersionPdfToLibrary(
  supabase: {
    storage: {
      from: (b: string) => {
        upload: (
          p: string,
          buf: Buffer,
          o: { contentType: string; upsert: boolean },
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    from: (t: string) => any;
  },
  userId: string,
  v: { id: string; job_title: string | null; company: string | null },
  buf: Buffer,
) {
  const { AI_JD_RESUME_FOLDER } = await import("./linkedin");
  const { resumePdfName, resumeFileBaseName } = await import("./naming");

  // Prefer profile first/last for firstName_lastName_Resume_Company.pdf
  let firstName: string | null = null;
  let lastName: string | null = null;
  let fullName: string | null = null;
  let email: string | null = null;
  try {
    const { data: details } = await supabase
      .from("profile_details")
      .select("first_name, last_name, email")
      .eq("user_id", userId)
      .maybeSingle();
    firstName = (details?.first_name as string | undefined)?.trim() || null;
    lastName = (details?.last_name as string | undefined)?.trim() || null;
    email = (details?.email as string | undefined)?.trim() || null;
  } catch {
    /* optional */
  }
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();
    fullName = (profile?.full_name as string | undefined)?.trim() || null;
    email = email || (profile?.email as string | undefined)?.trim() || null;
  } catch {
    /* optional */
  }

  const libraryPath = `${userId}/ai-jd/${v.id}.pdf`;
  const libUp = await supabase.storage
    .from("resumes")
    .upload(libraryPath, buf, { contentType: "application/pdf", upsert: true });
  if (libUp.error) throw new Error(libUp.error.message);

  const filename = resumePdfName({
    firstName,
    lastName,
    fullName,
    email,
    company: v.company,
  });
  const displayName = resumeFileBaseName({
    firstName,
    lastName,
    fullName,
    email,
    company: v.company,
  });
  const payload = {
    name: displayName.slice(0, 120),
    original_filename: filename.slice(0, 200),
    storage_path: libraryPath,
    mime_type: "application/pdf",
    size_bytes: buf.length,
    folder: AI_JD_RESUME_FOLDER,
  };

  const findExisting = async () => {
    const { data, error } = await supabase
      .from("resumes")
      .select("id, version")
      .eq("user_id", userId)
      .eq("source_resume_version_id", v.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as { id: string; version: number | null } | null;
  };

  const updateExisting = async (existing: { id: string; version: number | null }) => {
    const { error } = await supabase
      .from("resumes")
      .update({
        ...payload,
        version: (existing.version ?? 1) + 1,
      })
      .eq("id", existing.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { resumeId: existing.id, folder: AI_JD_RESUME_FOLDER, updated: true as const };
  };

  const existing = await findExisting();
  if (existing) return updateExisting(existing);

  const { data: inserted, error } = await supabase
    .from("resumes")
    .insert({
      user_id: userId,
      is_default: false,
      source_resume_version_id: v.id,
      ...payload,
    })
    .select("id")
    .single();

  // Compile auto-save + "Save to Resumes" (or double-click) can race the unique index.
  if (error) {
    const isDup =
      error.code === "23505" ||
      /resumes_user_source_version_uidx|duplicate key/i.test(error.message ?? "");
    if (isDup) {
      const again = await findExisting();
      if (again) return updateExisting(again);
    }
    throw new Error(error.message);
  }

  return { resumeId: inserted.id as string, folder: AI_JD_RESUME_FOLDER, updated: false as const };
}

export const uploadResumeVersionPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), pdfBase64: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: v } = await context.supabase
      .from("resume_versions")
      .select("id, project_id, job_title, company")
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

    // Also mirror into Resume Library under the AI-from-JD folder.
    try {
      await mirrorVersionPdfToLibrary(context.supabase as never, context.userId, v, buf);
    } catch {
      /* library mirror is best-effort on compile; user can Save to Resumes explicitly */
    }

    return { ok: true, path };
  });

/** Explicitly save a compiled Resume Studio PDF into the Resumes library. */
export const saveResumeVersionToLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: v } = await context.supabase
      .from("resume_versions")
      .select("id, project_id, job_title, company, pdf_storage_path")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (!v) throw new Error("Version not found");
    if (!v.pdf_storage_path) {
      throw new Error("Compile the resume first so a PDF exists, then save to Resumes.");
    }
    const { data: file, error: dlErr } = await context.supabase.storage
      .from("resume-latex")
      .download(v.pdf_storage_path);
    if (dlErr || !file) throw new Error(dlErr?.message ?? "Could not download compiled PDF");
    const buf = Buffer.from(await file.arrayBuffer());
    return mirrorVersionPdfToLibrary(context.supabase as never, context.userId, v, buf);
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

/** Copy an existing tailored version into a brand-new version — same project, fresh id, no PDF/AI re-run. */
export const duplicateResumeVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: v, error } = await context.supabase
      .from("resume_versions")
      .select("project_id, job_title, company, job_description, custom_instructions, tex_content, ats_score, matched_keywords, missing_keywords, strengths, suggestions")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (error || !v) throw new Error(error?.message ?? "Version not found");

    const { data: row, error: iErr } = await context.supabase
      .from("resume_versions")
      .insert({
        user_id: context.userId,
        project_id: v.project_id,
        job_title: v.job_title ? `Copy of ${v.job_title}` : "Copy",
        company: v.company,
        job_description: v.job_description,
        custom_instructions: v.custom_instructions,
        tex_content: v.tex_content,
        ats_score: v.ats_score,
        matched_keywords: v.matched_keywords,
        missing_keywords: v.missing_keywords,
        strengths: v.strengths,
        suggestions: v.suggestions,
      })
      .select()
      .single();
    if (iErr) throw new Error(iErr.message);
    return row as ResumeVersion;
  });

/** Promote a tailored version's .tex into a brand-new Master resume, copying over any project assets (.cls/.sty/images) so it still compiles. */
export const saveResumeVersionAsMaster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), name: z.string().max(120).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: v, error } = await supabase
      .from("resume_versions")
      .select("project_id, job_title, company, tex_content")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (error || !v) throw new Error(error?.message ?? "Version not found");

    const { data: srcProj } = await supabase
      .from("resume_projects")
      .select("storage_prefix, main_tex_filename")
      .eq("id", v.project_id)
      .maybeSingle();

    const mainFilename = srcProj?.main_tex_filename || "resume.tex";
    const projectId = crypto.randomUUID();
    const prefix = `${userId}/${projectId}/`;
    const projectName =
      data.name?.trim() || (v.job_title ? `${v.job_title}${v.company ? ` · ${v.company}` : ""}` : "Master resume");

    const mainUp = await supabase.storage
      .from("resume-latex")
      .upload(`${prefix}${mainFilename}`, new Blob([v.tex_content], { type: "application/x-tex" }), {
        contentType: "application/x-tex",
        upsert: true,
      });
    if (mainUp.error) throw new Error(mainUp.error.message);

    // Copy any extra project assets (.cls/.sty/images) from the source master so the new one still compiles.
    if (srcProj?.storage_prefix) {
      const { data: files } = await supabase.storage.from("resume-latex").list(srcProj.storage_prefix, { limit: 1000 });
      for (const f of files ?? []) {
        if (f.name === mainFilename) continue;
        const { data: blob } = await supabase.storage.from("resume-latex").download(`${srcProj.storage_prefix}${f.name}`);
        if (!blob) continue;
        await supabase.storage.from("resume-latex").upload(`${prefix}${f.name}`, blob, { upsert: true });
      }
    }

    const { data: row, error: iErr } = await supabase
      .from("resume_projects")
      .insert({
        id: projectId,
        user_id: userId,
        name: projectName,
        description: null,
        storage_prefix: prefix,
        main_tex_filename: mainFilename,
        is_default: false,
      })
      .select()
      .single();
    if (iErr) throw new Error(iErr.message);
    return row as ResumeProject;
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
    const c = await aiChatJson({ supabase: context.supabase, userId: context.userId, system: sys, user });
    const parsed = parseAiJson<{ subject?: string; body?: string }>(c);
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
    const c = await aiChatJson({ supabase: context.supabase, userId: context.userId, system: sys, user });
    const parsed = parseAiJson<{ tex?: string }>(c);
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

    const c = await aiChatJson({ supabase: context.supabase, userId: context.userId, system: sys, user });
    const parsed = parseAiJson<{ tex?: string; notes?: string }>(c);
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

    const c = await aiChatJson({ supabase: context.supabase, userId: context.userId, system: sys, user });
    const parsed = parseAiJson<{ replacement?: string }>(c);
    const replacement = (parsed.replacement ?? "").replace(/^```[a-z]*\n?|```$/g, "").trim();
    if (!replacement) throw new Error("AI returned an empty replacement");
    return { replacement };
  });
