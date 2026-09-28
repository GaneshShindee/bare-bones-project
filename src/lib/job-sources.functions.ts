import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiExtractJobFields } from "@/lib/job-ai";
import {
  fetchGreenhouseJobs,
  fetchLeverJobs,
  greenhouseToParseText,
  leverToParseText,
  parseRssOrAtom,
} from "@/lib/job-import";

export type JobSourceKind = "rss" | "greenhouse" | "lever" | "telegram";

export type JobSourceConfig = {
  url?: string;
  boardToken?: string;
  site?: string;
  company?: string;
  chatIds?: string[];
};

export type JobSource = {
  id: string;
  user_id: string;
  name: string;
  kind: JobSourceKind;
  config: JobSourceConfig;
  enabled: boolean;
  webhook_secret: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

const kindSchema = z.enum(["rss", "greenhouse", "lever", "telegram"]);

const configSchema = z
  .object({
    url: z.string().max(2_000).optional(),
    boardToken: z.string().max(120).optional(),
    site: z.string().max(120).optional(),
    company: z.string().max(200).optional(),
  })
  .passthrough();

function randomSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const listJobSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("job_sources")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as JobSource[]).map((row) => ({
      ...row,
      kind: row.kind as JobSourceKind,
      config: (row.config ?? {}) as JobSourceConfig,
    }));
  });

export const upsertJobSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional().nullable(),
        name: z.string().trim().max(120).default(""),
        kind: kindSchema,
        config: configSchema.default({}),
        enabled: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.kind === "rss" && !data.config.url) throw new Error("RSS feed URL is required");
    if (data.kind === "greenhouse" && !data.config.boardToken) {
      throw new Error("Greenhouse board token is required (e.g. from boards.greenhouse.io/TOKEN)");
    }
    if (data.kind === "lever" && !data.config.site) {
      throw new Error("Lever site slug is required (jobs.lever.co/SITE)");
    }

    const name =
      data.name ||
      (data.kind === "rss"
        ? "RSS feed"
        : data.kind === "greenhouse"
          ? `Greenhouse · ${data.config.boardToken}`
          : data.kind === "lever"
            ? `Lever · ${data.config.site}`
            : "Telegram channel");

    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("job_sources")
        .update({
          name,
          kind: data.kind,
          config: data.config as never,
          enabled: data.enabled,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return {
        ...(row as JobSource),
        kind: (row as JobSource).kind as JobSourceKind,
        config: ((row as JobSource).config ?? {}) as JobSourceConfig,
      };
    }

    const webhook_secret = data.kind === "telegram" ? randomSecret() : null;
    const { data: row, error } = await context.supabase
      .from("job_sources")
      .insert({
        user_id: context.userId,
        name,
        kind: data.kind,
        config: data.config as never,
        enabled: data.enabled,
        webhook_secret,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return {
      ...(row as JobSource),
      kind: (row as JobSource).kind as JobSourceKind,
      config: ((row as JobSource).config ?? {}) as JobSourceConfig,
    };
  });

export const deleteJobSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("job_sources")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function jobExists(
  supabase: { from: (t: string) => any },
  userId: string,
  opts: { sourceUrl?: string; externalId?: string },
) {
  if (opts.externalId) {
    const { data } = await supabase
      .from("jobs")
      .select("id")
      .eq("user_id", userId)
      .eq("external_id", opts.externalId)
      .maybeSingle();
    if (data) return true;
  }
  if (opts.sourceUrl) {
    const { data } = await supabase
      .from("jobs")
      .select("id")
      .eq("user_id", userId)
      .eq("source_url", opts.sourceUrl)
      .maybeSingle();
    if (data) return true;
  }
  return false;
}

async function insertParsedJob(
  supabase: { from: (t: string) => any },
  userId: string,
  fields: Awaited<ReturnType<typeof aiExtractJobFields>>,
  meta: { sourceUrl: string; externalId?: string; companyFallback?: string; applyUrl?: string },
) {
  const payload = {
    user_id: userId,
    title: fields.title || "Untitled role",
    company: fields.company || meta.companyFallback || "Unknown company",
    location: fields.location || "",
    work_mode: fields.work_mode || "",
    employment_type: fields.employment_type || "",
    experience: fields.experience || "",
    salary: fields.salary || "",
    description: fields.description || "",
    responsibilities: fields.responsibilities || [],
    skills: fields.skills || [],
    technologies: fields.technologies || [],
    tags: fields.tags || [],
    recruiter_email: fields.recruiter_email || "",
    apply_url: fields.apply_url || meta.applyUrl || meta.sourceUrl || "",
    company_website: fields.company_website || "",
    source_url: meta.sourceUrl || "",
    external_id: meta.externalId || null,
    is_public: true,
  };
  const { error } = await supabase.from("jobs").insert(payload as never);
  if (error) {
    if (/duplicate key|unique constraint/i.test(error.message)) return { inserted: false };
    throw new Error(error.message);
  }
  return { inserted: true };
}

/** Sync one RSS / Greenhouse / Lever source into the jobs board. */
export const syncJobSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: source, error: sErr } = await db
      .from("job_sources")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (sErr || !source) throw new Error(sErr?.message ?? "Source not found");
    const src = source as JobSource;
    if (src.kind === "telegram") {
      throw new Error("Telegram sources sync via webhook — post a job in your channel instead.");
    }

    let created = 0;
    let skipped = 0;
    let scanned = 0;

    try {
      const cfg = (src.config ?? {}) as {
        url?: string;
        boardToken?: string;
        site?: string;
        company?: string;
      };

      if (src.kind === "rss") {
        if (!cfg.url) throw new Error("Missing RSS URL");
        const res = await fetch(cfg.url, {
          headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
        });
        if (!res.ok) throw new Error(`RSS fetch failed (${res.status})`);
        const xml = await res.text();
        const items = parseRssOrAtom(xml);
        scanned = items.length;
        for (const item of items.slice(0, 15)) {
          const sourceUrl = item.link || `${cfg.url}#${item.title}`;
          if (await jobExists(context.supabase as never, context.userId, { sourceUrl })) {
            skipped += 1;
            continue;
          }
          const text = [`Title: ${item.title}`, item.link ? `URL: ${item.link}` : "", item.description]
            .filter(Boolean)
            .join("\n");
          const fields = await aiExtractJobFields(text, { supabase: context.supabase, userId: context.userId });
          const r = await insertParsedJob(context.supabase as never, context.userId, fields, {
            sourceUrl,
            companyFallback: cfg.company,
            applyUrl: item.link,
          });
          if (r.inserted) created += 1;
          else skipped += 1;
        }
      } else if (src.kind === "greenhouse") {
        if (!cfg.boardToken) throw new Error("Missing Greenhouse board token");
        const jobs = await fetchGreenhouseJobs(cfg.boardToken);
        scanned = jobs.length;
        for (const job of jobs.slice(0, 25)) {
          const sourceUrl = job.absolute_url;
          const externalId = `greenhouse:${cfg.boardToken}:${job.id}`;
          if (await jobExists(context.supabase as never, context.userId, { sourceUrl, externalId })) {
            skipped += 1;
            continue;
          }
          const fields = await aiExtractJobFields(greenhouseToParseText(job), { supabase: context.supabase, userId: context.userId });
          const r = await insertParsedJob(context.supabase as never, context.userId, fields, {
            sourceUrl,
            externalId,
            companyFallback: cfg.company || cfg.boardToken,
            applyUrl: job.absolute_url,
          });
          if (r.inserted) created += 1;
          else skipped += 1;
        }
      } else if (src.kind === "lever") {
        if (!cfg.site) throw new Error("Missing Lever site slug");
        const jobs = await fetchLeverJobs(cfg.site);
        scanned = jobs.length;
        for (const job of jobs.slice(0, 25)) {
          const sourceUrl = job.hostedUrl;
          const externalId = `lever:${cfg.site}:${job.id}`;
          if (await jobExists(context.supabase as never, context.userId, { sourceUrl, externalId })) {
            skipped += 1;
            continue;
          }
          const fields = await aiExtractJobFields(leverToParseText(job), { supabase: context.supabase, userId: context.userId });
          const r = await insertParsedJob(context.supabase as never, context.userId, fields, {
            sourceUrl,
            externalId,
            companyFallback: cfg.company || cfg.site,
            applyUrl: job.hostedUrl,
          });
          if (r.inserted) created += 1;
          else skipped += 1;
        }
      }

      await context.supabase
        .from("job_sources")
        .update({
          last_synced_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", src.id);

      return { created, skipped, scanned };
    } catch (e) {
      const msg = (e as Error).message;
      await context.supabase
        .from("job_sources")
        .update({ last_error: msg, updated_at: new Date().toISOString() })
        .eq("id", src.id);
      throw e;
    }
  });
