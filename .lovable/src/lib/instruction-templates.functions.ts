import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { InstructionTemplate } from "./instruction-templates";

const tplSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(120),
  email_pattern: z.enum(["first.last", "firstlast", "flast", "firstl", "last.first", "custom"]),
  custom_pattern: z.string().max(200).default("{first}.{last}"),
  company_domain: z.string().max(253).default(""),
  batch_size: z.number().int().min(1).max(1000).default(100),
  rules: z.record(z.string(), z.boolean()).default({}),
  prefixes: z.array(z.string().max(40)).max(64).default([]),
  custom_rules: z.array(z.string().max(500)).max(100).default([]),
  surname_min_length: z.number().int().min(0).max(20).default(2),
});

export const listInstructionTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("instruction_templates")
      .select("*")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as InstructionTemplate[];
  });

export const upsertInstructionTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => tplSchema.parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      name: data.name,
      email_pattern: data.email_pattern,
      custom_pattern: data.custom_pattern,
      company_domain: data.company_domain,
      batch_size: data.batch_size,
      rules: data.rules,
      prefixes: data.prefixes,
      custom_rules: data.custom_rules,
      surname_min_length: data.surname_min_length,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("instruction_templates")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row as InstructionTemplate;
    }
    const { data: row, error } = await context.supabase
      .from("instruction_templates")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as InstructionTemplate;
  });

export const deleteInstructionTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("instruction_templates")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateInstructionTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: src, error: e1 } = await context.supabase
      .from("instruction_templates")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (e1 || !src) throw new Error(e1?.message ?? "Template not found");
    const s = src as InstructionTemplate;
    const { data: row, error } = await context.supabase
      .from("instruction_templates")
      .insert({
        user_id: context.userId,
        name: `${s.name} (copy)`,
        email_pattern: s.email_pattern,
        custom_pattern: s.custom_pattern,
        company_domain: s.company_domain,
        batch_size: s.batch_size,
        rules: s.rules,
        prefixes: s.prefixes,
        custom_rules: s.custom_rules,
        surname_min_length: s.surname_min_length,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as InstructionTemplate;
  });