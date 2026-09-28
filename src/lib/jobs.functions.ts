import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiExtractJobFields, normalizeHttpUrl } from "@/lib/job-ai";

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
  title: z.string().trim().max(200).default(""),
  company: z.string().trim().max(200).default(""),
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

const jobDateFilter = z.enum(["all", "today", "week", "month"]).default("all");

/** ISO cutoff for a "added today/this week/this month" filter, or null for "all". */
function dateFilterCutoffIso(filter: z.infer<typeof jobDateFilter>): string | null {
  if (filter === "all") return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filter === "today") return startOfToday.toISOString();
  if (filter === "week") return new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();
  return new Date(startOfToday.getFullYear(), startOfToday.getMonth() - 1, startOfToday.getDate()).toISOString();
}

/** `.or()` clause matching title/company/description/location by free-text search. */
function jobSearchClause(search: string): string {
  const s = `%${search}%`;
  return `title.ilike.${s},company.ilike.${s},description.ilike.${s},location.ilike.${s}`;
}

const jobListFilters = z.object({
  search: z.string().max(200).optional(),
  onlyMine: z.boolean().optional(),
  bookmarkedOnly: z.boolean().optional(),
  workMode: z.string().max(40).optional(),
  dateFilter: jobDateFilter,
  role: z.string().max(200).optional(),
  experience: z.string().max(60).optional(),
});

export type JobsPage = {
  rows: Array<Job & { bookmarked: boolean; isMine: boolean }>;
  total: number;
  page: number;
  pageSize: number;
};

export const listJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    jobListFilters
      .extend({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(30),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<JobsPage> => {
    const { data: bookmarks } = await context.supabase
      .from("job_bookmarks")
      .select("job_id")
      .eq("user_id", context.userId);
    const bset = new Set((bookmarks ?? []).map((b) => b.job_id));

    if (data.bookmarkedOnly && bset.size === 0) {
      return { rows: [], total: 0, page: data.page, pageSize: data.pageSize };
    }

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = context.supabase
      .from("jobs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (data.onlyMine) q = q.eq("user_id", context.userId);
    if (data.workMode) q = q.eq("work_mode", data.workMode);
    if (data.role) q = q.eq("title", data.role);
    if (data.experience) q = q.eq("experience", data.experience);
    if (data.bookmarkedOnly) q = q.in("id", Array.from(bset));
    if (data.search) q = q.or(jobSearchClause(data.search));
    const cutoff = dateFilterCutoffIso(data.dateFilter);
    if (cutoff) q = q.gte("created_at", cutoff);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as Job[];
    return {
      rows: list.map((j) => ({ ...j, bookmarked: bset.has(j.id), isMine: j.user_id === context.userId })),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

/**
 * Distinct role/experience values for the filter dropdowns — scoped by the same
 * search/mine/bookmarked/date filters as the list (so options stay contextual)
 * but independent of pagination, since a 30-row page would otherwise starve them.
 */
export const listJobFilterOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => jobListFilters.omit({ role: true, experience: true }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let bset: Set<string> | null = null;
    if (data.bookmarkedOnly) {
      const { data: bookmarks } = await context.supabase
        .from("job_bookmarks")
        .select("job_id")
        .eq("user_id", context.userId);
      bset = new Set((bookmarks ?? []).map((b) => b.job_id));
      if (bset.size === 0) return { roles: [], experiences: [] };
    }

    let q = context.supabase.from("jobs").select("title, experience").limit(2000);
    if (data.onlyMine) q = q.eq("user_id", context.userId);
    if (data.workMode) q = q.eq("work_mode", data.workMode);
    if (bset) q = q.in("id", Array.from(bset));
    if (data.search) q = q.or(jobSearchClause(data.search));
    const cutoff = dateFilterCutoffIso(data.dateFilter);
    if (cutoff) q = q.gte("created_at", cutoff);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const roles = new Set<string>();
    const experiences = new Set<string>();
    for (const r of rows ?? []) {
      if (r.title?.trim()) roles.add(r.title.trim());
      if (r.experience?.trim()) experiences.add(r.experience.trim());
    }
    return {
      roles: Array.from(roles).sort((a, b) => a.localeCompare(b)),
      experiences: Array.from(experiences).sort((a, b) => a.localeCompare(b)),
    };
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

export type { ParsedJobFields } from "@/lib/job-ai";
export { aiExtractJobFields } from "@/lib/job-ai";

/** AI Job Parser — extract structured fields from raw text/URL content. */
export const parseJobText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ text: z.string().max(50_000) }).parse(d),
  )
  .handler(async ({ data, context }) =>
    aiExtractJobFields(data.text, { supabase: context.supabase, userId: context.userId }),
  );

/** Fetch a careers / LinkedIn / ATS page and extract job fields for review. */
export const parseJobFromUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ url: z.string().min(4).max(2_000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { fetchUrlAsJobText } = await import("./job-import");
    const url = normalizeHttpUrl(data.url);
    const { text, finalUrl } = await fetchUrlAsJobText(url);
    const fields = await aiExtractJobFields(text, { supabase: context.supabase, userId: context.userId });
    return {
      ...fields,
      source_url: finalUrl,
      apply_url: fields.apply_url || finalUrl,
    };
  });
