import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PROFILE_SECTIONS, type ProfileDetails, type ProfileEntry } from "@/lib/user-profile";

const sectionEnum = z.enum(PROFILE_SECTIONS);

const detailsSchema = z.object({
  first_name: z.string().max(120).default(""),
  last_name: z.string().max(120).default(""),
  email: z.string().max(200).default(""),
  phone: z.string().max(60).default(""),
  location: z.string().max(200).default(""),
  linkedin: z.string().max(400).default(""),
  github: z.string().max(400).default(""),
  portfolio: z.string().max(400).default(""),
  summary: z.string().max(5000).default(""),
});

const entrySchema = z.object({
  id: z.string().uuid().optional().nullable(),
  section: sectionEnum,
  title: z.string().max(300).default(""),
  subtitle: z.string().max(300).default(""),
  location: z.string().max(200).default(""),
  start_date: z.string().max(60).default(""),
  end_date: z.string().max(60).default(""),
  is_current: z.boolean().default(false),
  description: z.string().max(5000).default(""),
  bullets: z.array(z.string().max(1000)).max(40).default([]),
  tags: z.array(z.string().max(120)).max(80).default([]),
  url: z.string().max(400).default(""),
  sort_order: z.number().int().min(0).max(10_000).default(0),
});

export type FullProfileResult = {
  details: ProfileDetails;
  entries: ProfileEntry[];
};

export const getFullProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FullProfileResult> => {
    const { loadFullProfile } = await import("./user-profile.server");
    const { details, entries } = await loadFullProfile(context.supabase, context.userId);
    return {
      details: (details ?? {
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        location: "",
        linkedin: "",
        github: "",
        portfolio: "",
        summary: "",
      }) as ProfileDetails,
      entries: entries as ProfileEntry[],
    };
  });

export const saveProfileDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => detailsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { untyped } = await import("./user-profile.server.helpers");
    const { error } = await untyped(context.supabase)
      .from("profile_details")
      .upsert({ ...data, user_id: context.userId }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertProfileEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => entrySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { untyped } = await import("./user-profile.server.helpers");
    const db = untyped(context.supabase);
    const payload = { ...data, id: undefined, user_id: context.userId };
    delete (payload as { id?: unknown }).id;
    if (data.id) {
      const { error } = await db
        .from("profile_entries")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await db
      .from("profile_entries")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as { id: string }).id };
  });

export const deleteProfileEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { untyped } = await import("./user-profile.server.helpers");
    const { error } = await untyped(context.supabase)
      .from("profile_entries")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderProfileEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { untyped } = await import("./user-profile.server.helpers");
    const db = untyped(context.supabase);
    for (let i = 0; i < data.ids.length; i++) {
      await db
        .from("profile_entries")
        .update({ sort_order: i })
        .eq("id", data.ids[i])
        .eq("user_id", context.userId);
    }
    return { ok: true };
  });

/** Replace a whole section with reviewed entries (used by the import flow). */
export const saveImportedProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        details: detailsSchema.partial().optional(),
        entries: z.array(entrySchema.omit({ id: true })).max(200).default([]),
        replaceSections: z.array(sectionEnum).max(10).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { untyped } = await import("./user-profile.server.helpers");
    const db = untyped(context.supabase);
    if (data.details && Object.keys(data.details).length) {
      const { error } = await db
        .from("profile_details")
        .upsert({ ...data.details, user_id: context.userId }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
    }
    for (const s of data.replaceSections) {
      await db.from("profile_entries").delete().eq("user_id", context.userId).eq("section", s);
    }
    if (data.entries.length) {
      const rows = data.entries.map((e, i) => ({ ...e, sort_order: e.sort_order || i, user_id: context.userId }));
      const { error } = await db.from("profile_entries").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true, inserted: data.entries.length };
  });

const parseSchema = z.object({
  text: z.string().max(200_000).optional().nullable(),
  resumeProjectId: z.string().uuid().optional().nullable(),
  resumeId: z.string().uuid().optional().nullable(),
});

/**
 * Extract a DRAFT profile from an existing resume. Nothing is persisted —
 * the user reviews and confirms in the UI before saving.
 */
export const parseResumeToProfileDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI gateway not configured");

    let source = (data.text ?? "").trim();
    if (!source && data.resumeProjectId) {
      const { data: proj } = await context.supabase
        .from("resume_projects")
        .select("storage_prefix, main_tex_filename")
        .eq("id", data.resumeProjectId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (proj) {
        const { data: blob } = await context.supabase.storage
          .from("resume-latex")
          .download(`${proj.storage_prefix}${proj.main_tex_filename}`);
        if (blob) source = await blob.text();
      }
    }
    if (!source) throw new Error("Nothing to import — paste your resume text or pick a master resume.");

    const sys = [
      "You extract structured profile data from a resume (plain text, LaTeX, or pasted content).",
      "HARD RULES:",
      "- Extract ONLY what the source actually contains. Never invent or embellish anything.",
      "- Leave fields empty when the source does not state them.",
      "- Strip LaTeX commands from the extracted text.",
      "Return STRICT JSON only with this shape:",
      '{"details":{"first_name":"","last_name":"","email":"","phone":"","location":"","linkedin":"","github":"","portfolio":"","summary":""},',
      '"entries":[{"section":"education|experience|project|skill|certification|achievement|language","title":"","subtitle":"","location":"","start_date":"","end_date":"","is_current":false,"description":"","bullets":[],"tags":[],"url":""}]}',
      "For 'skill' entries: title = category name, tags = the individual skills.",
    ].join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: source.slice(0, 60_000) },
        ],
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
    const parsed = JSON.parse(m[0]) as {
      details?: Partial<ProfileDetails>;
      entries?: Array<Partial<ProfileEntry> & { section?: string }>;
    };

    const entries = (parsed.entries ?? [])
      .filter((e) => e.section && (PROFILE_SECTIONS as readonly string[]).includes(e.section))
      .map((e, i) => ({
        section: e.section as ProfileEntry["section"],
        title: (e.title ?? "").slice(0, 300),
        subtitle: (e.subtitle ?? "").slice(0, 300),
        location: (e.location ?? "").slice(0, 200),
        start_date: (e.start_date ?? "").slice(0, 60),
        end_date: (e.end_date ?? "").slice(0, 60),
        is_current: !!e.is_current,
        description: (e.description ?? "").slice(0, 5000),
        bullets: (Array.isArray(e.bullets) ? e.bullets : []).slice(0, 40),
        tags: (Array.isArray(e.tags) ? e.tags : []).slice(0, 80),
        url: (e.url ?? "").slice(0, 400),
        sort_order: i,
      }));

    return {
      details: {
        first_name: parsed.details?.first_name ?? "",
        last_name: parsed.details?.last_name ?? "",
        email: parsed.details?.email ?? "",
        phone: parsed.details?.phone ?? "",
        location: parsed.details?.location ?? "",
        linkedin: parsed.details?.linkedin ?? "",
        github: parsed.details?.github ?? "",
        portfolio: parsed.details?.portfolio ?? "",
        summary: parsed.details?.summary ?? "",
      } as ProfileDetails,
      entries,
    };
  });
