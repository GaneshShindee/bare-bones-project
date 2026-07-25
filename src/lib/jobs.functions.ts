import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Job = {
  id: string;
  user_id: string;
  title: string;
  company: string;
  location: string;
  work_mode: string;
  employment_type: string;
  experience: string;
  salary: string;
  description: string;
  responsibilities: string[];
  skills: string[];
  technologies: string[];
  tags: string[];
  recruiter_email: string;
  apply_url: string;
  company_website: string;
  source_url: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

const jobShape = z.object({
  id: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(200),
  location: z.string().max(200).default(""),
  work_mode: z.string().max(40).default(""),
  employment_type: z.string().max(40).default(""),
  experience: z.string().max(60).default(""),
  salary: z.string().max(120).default(""),
  description: z.string().max(50_000).default(""),
  responsibilities: z.array(z.string().max(500)).max(60).default([]),
  skills: z.array(z.string().max(80)).max(80).default([]),
  technologies: z.array(z.string().max(80)).max(80).default([]),
  tags: z.array(z.string().max(60)).max(40).default([]),
  recruiter_email: z.string().max(200).default(""),
  apply_url: z.string().max(500).default(""),
  company_website: z.string().max(500).default(""),
  source_url: z.string().max(500).default(""),
  is_public: z.boolean().default(true),
});

export const listJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        search: z.string().max(200).optional(),
        onlyMine: z.boolean().optional(),
        bookmarkedOnly: z.boolean().optional(),
        workMode: z.string().max(40).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.onlyMine) q = q.eq("user_id", context.userId);
    if (data.workMode) q = q.eq("work_mode", data.workMode);
    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(`title.ilike.${s},company.ilike.${s},description.ilike.${s},location.ilike.${s}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const { data: bookmarks } = await context.supabase
      .from("job_bookmarks")
      .select("job_id")
      .eq("user_id", context.userId);
    const bset = new Set((bookmarks ?? []).map((b) => b.job_id));

    let list = (rows ?? []) as Job[];
    if (data.bookmarkedOnly) list = list.filter((j) => bset.has(j.id));
    return list.map((j) => ({ ...j, bookmarked: bset.has(j.id), isMine: j.user_id === context.userId }));
  });

export const getJob = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("jobs")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Job not found");
    return row as Job;
  });

export const upsertJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => jobShape.parse(d))
  .handler(async ({ data, context }) => {
    const { id: _omit, ...rest } = data;
    void _omit;
    const payload = { ...rest, user_id: context.userId };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("jobs")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row as Job;
    }
    const { data: row, error } = await context.supabase
      .from("jobs")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as Job;
  });

export const deleteJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("jobs")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleJobBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ jobId: z.string().uuid(), bookmark: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.bookmark) {
      await context.supabase
        .from("job_bookmarks")
        .upsert({ user_id: context.userId, job_id: data.jobId });
    } else {
      await context.supabase
        .from("job_bookmarks")
        .delete()
        .eq("user_id", context.userId)
        .eq("job_id", data.jobId);
    }
    return { ok: true };
  });

/** AI Job Parser — extract structured fields from raw text/URL content. */
export const parseJobText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ text: z.string().min(20).max(50_000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI gateway not configured");
    const sys =
      "You extract job information from arbitrary text (LinkedIn, Greenhouse, Lever, careers pages, emails, PDFs). Return STRICT JSON with keys: title, company, location, work_mode (remote|hybrid|onsite|''), employment_type (full-time|intern|contract|part-time|''), experience, salary, description, responsibilities (string[]), skills (string[]), technologies (string[]), tags (string[]), recruiter_email, apply_url, company_website. If a field is unknown, use an empty string or empty array. Do not invent facts. No markdown, no prose.";
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: data.text },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    if (!res.ok) throw new Error(`AI error ${res.status}`);
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = j.choices?.[0]?.message?.content ?? "";
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI returned invalid JSON");
    const parsed = JSON.parse(m[0]) as Record<string, unknown>;
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
  });