import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Resume = {
  id: string;
  name: string;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  is_default: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

export const listResumes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Resume[]> => {
    const { data, error } = await context.supabase
      .from("resumes")
      .select("id, name, original_filename, storage_path, mime_type, size_bytes, is_default, version, created_at, updated_at")
      .eq("user_id", context.userId)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Resume[];
  });

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  originalFilename: z.string().min(1).max(255),
  storagePath: z.string().min(1).max(1024),
  mimeType: z.string().min(1).max(128),
  sizeBytes: z.number().int().positive().max(25 * 1024 * 1024),
  makeDefault: z.boolean().optional(),
});

export const createResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Ensure the storage path begins with this user's folder (defence in depth).
    if (!data.storagePath.startsWith(`${context.userId}/`)) {
      throw new Error("Invalid storage path.");
    }
    const { count } = await context.supabase
      .from("resumes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId);
    const shouldBeDefault = data.makeDefault || !count || count === 0;
    if (shouldBeDefault) {
      await context.supabase
        .from("resumes")
        .update({ is_default: false })
        .eq("user_id", context.userId)
        .eq("is_default", true);
    }
    const { data: row, error } = await context.supabase
      .from("resumes")
      .insert({
        user_id: context.userId,
        name: data.name,
        original_filename: data.originalFilename,
        storage_path: data.storagePath,
        mime_type: data.mimeType,
        size_bytes: data.sizeBytes,
        is_default: shouldBeDefault,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as Resume;
  });

export const renameResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("resumes")
      .update({ name: data.name })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const replaceResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      originalFilename: z.string().min(1).max(255),
      storagePath: z.string().min(1).max(1024),
      mimeType: z.string().min(1).max(128),
      sizeBytes: z.number().int().positive().max(25 * 1024 * 1024),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!data.storagePath.startsWith(`${context.userId}/`)) throw new Error("Invalid storage path.");
    // Find the current row to bump version and remove the old file.
    const { data: cur, error: e1 } = await context.supabase
      .from("resumes")
      .select("storage_path, version")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (e1 || !cur) throw new Error(e1?.message ?? "Resume not found");
    const { error } = await context.supabase
      .from("resumes")
      .update({
        original_filename: data.originalFilename,
        storage_path: data.storagePath,
        mime_type: data.mimeType,
        size_bytes: data.sizeBytes,
        version: cur.version + 1,
      })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    // Best-effort delete the old object.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (cur.storage_path && cur.storage_path !== data.storagePath) {
      await supabaseAdmin.storage.from("resumes").remove([cur.storage_path]);
    }
    return { ok: true, version: cur.version + 1 };
  });

export const deleteResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: cur } = await context.supabase
      .from("resumes")
      .select("storage_path, is_default")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    const { error } = await context.supabase
      .from("resumes")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (cur?.storage_path) {
      await supabaseAdmin.storage.from("resumes").remove([cur.storage_path]);
    }
    // Promote a remaining resume to default if needed.
    if (cur?.is_default) {
      const { data: remain } = await context.supabase
        .from("resumes")
        .select("id")
        .eq("user_id", context.userId)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (remain && remain[0]) {
        await context.supabase.from("resumes").update({ is_default: true }).eq("id", remain[0].id);
      }
    }
    return { ok: true };
  });

export const setDefaultResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("resumes")
      .update({ is_default: false })
      .eq("user_id", context.userId)
      .eq("is_default", true);
    const { error } = await context.supabase
      .from("resumes")
      .update({ is_default: true })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getResumeSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), download: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("resumes")
      .select("storage_path, original_filename")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (error || !row) throw new Error(error?.message ?? "Resume not found");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: e2 } = await supabaseAdmin.storage
      .from("resumes")
      .createSignedUrl(row.storage_path, 60 * 5, data.download ? { download: row.original_filename } : undefined);
    if (e2 || !signed) throw new Error(e2?.message ?? "Failed to sign URL");
    return { url: signed.signedUrl, filename: row.original_filename };
  });