import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TablesUpdate } from "@/integrations/supabase/types";

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("templates")
      .select("id, name, subject, body, category, preferred_resume_id, default_sender_id, follow_up_template_id, is_default, is_public, published_at, saves_count, source_template_id, created_at, updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(120),
  subject: z.string().max(998).default(""),
  body: z.string().max(100_000).default(""),
  preferredResumeId: z.string().uuid().nullable().optional(),
  defaultSenderId: z.string().uuid().nullable().optional(),
  followUpTemplateId: z.string().uuid().nullable().optional(),
  category: z.string().trim().max(60).nullable().optional(),
});

export const upsertTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (data.id) {
      const update: TablesUpdate<"templates"> = {
        name: data.name,
        subject: data.subject,
        body: data.body,
        preferred_resume_id: data.preferredResumeId ?? null,
      };
      if (data.defaultSenderId !== undefined) update.default_sender_id = data.defaultSenderId;
      if (data.followUpTemplateId !== undefined) update.follow_up_template_id = data.followUpTemplateId;
      if (data.category !== undefined) update.category = data.category;
      const { data: row, error } = await context.supabase
        .from("templates")
        .update(update)
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    } else {
      const { data: row, error } = await context.supabase
        .from("templates")
        .insert({
          user_id: context.userId,
          name: data.name,
          subject: data.subject,
          body: data.body,
          preferred_resume_id: data.preferredResumeId ?? null,
          default_sender_id: data.defaultSenderId ?? null,
          follow_up_template_id: data.followUpTemplateId ?? null,
          category: data.category ?? null,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("templates")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: src, error: e1 } = await context.supabase
      .from("templates")
      .select("name, subject, body")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (e1 || !src) throw new Error(e1?.message ?? "Template not found");
    const { data: row, error } = await context.supabase
      .from("templates")
      .insert({ user_id: context.userId, name: `${src.name} (copy)`, subject: src.subject, body: src.body })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setDefaultTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("templates")
      .update({ is_default: true })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setTemplatePublic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), isPublic: z.boolean(), category: z.string().max(60).nullable().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const update: TablesUpdate<"templates"> = {
      is_public: data.isPublic,
      published_at: data.isPublic ? new Date().toISOString() : null,
    };
    if (data.category !== undefined) update.category = data.category;
    const { error } = await context.supabase
      .from("templates")
      .update(update)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listPublicTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ search: z.string().optional(), category: z.string().optional(), limit: z.number().int().min(1).max(200).default(60) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("templates")
      .select("id, name, subject, body, category, saves_count, user_id, published_at, updated_at")
      .eq("is_public", true)
      .order("saves_count", { ascending: false })
      .limit(data.limit);
    if (data.category && data.category !== "all") q = q.eq("category", data.category);
    if (data.search) q = q.or(`name.ilike.%${data.search}%,subject.ilike.%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = rows ?? [];

    // Fetch author profiles for display.
    const ids = Array.from(new Set(list.map((r) => r.user_id)));
    const authors = new Map<string, { full_name: string | null; avatar_url: string | null; email: string | null }>();
    if (ids.length > 0) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name, avatar_url, email")
        .in("id", ids);
      for (const p of profs ?? []) authors.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url, email: p.email });
    }

    // Track which ones the current user already saved.
    const { data: saves } = await context.supabase
      .from("template_saves")
      .select("template_id")
      .eq("user_id", context.userId);
    const saved = new Set((saves ?? []).map((s) => s.template_id));

    return list.map((t) => ({
      ...t,
      author: authors.get(t.user_id) ?? { full_name: null, avatar_url: null, email: null },
      isSaved: saved.has(t.id),
      isMine: t.user_id === context.userId,
    }));
  });

export const saveMarketplaceTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: src, error } = await context.supabase
      .from("templates")
      .select("id, name, subject, body, category, user_id, is_public")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!src || !src.is_public) throw new Error("Template not available");
    if (src.user_id === context.userId) throw new Error("This is your own template");

    const { data: copy, error: cErr } = await context.supabase
      .from("templates")
      .insert({
        user_id: context.userId,
        name: src.name,
        subject: src.subject,
        body: src.body,
        category: src.category,
        source_template_id: src.id,
      })
      .select("id")
      .single();
    if (cErr) throw new Error(cErr.message);

    await context.supabase
      .from("template_saves")
      .insert({ user_id: context.userId, template_id: src.id });

    return { ok: true, newTemplateId: copy.id };
  });