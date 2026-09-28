import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AI_PROVIDERS, verifyGeminiApiKey, verifyGrokApiKey, type AiProvider } from "@/lib/ai-gateway";

function maskKey(key: string): string {
  const tail = key.slice(-4);
  return `••••••••${tail}`;
}

/** Which AI provider the user has selected, and which providers have a key saved.
 *  Selecting "lovable" (the default), or selecting a provider with no key saved,
 *  means AI features run on the shared Lovable gateway. */
export const getAiKeyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("gemini_api_key, grok_api_key, active_ai_provider")
      .eq("id", context.userId)
      .maybeSingle();
    const geminiKey = data?.gemini_api_key ?? null;
    const grokKey = data?.grok_api_key ?? null;
    const activeProvider = (data?.active_ai_provider as AiProvider | undefined) ?? "lovable";
    return {
      activeProvider: AI_PROVIDERS.includes(activeProvider) ? activeProvider : "lovable",
      gemini: { hasKey: !!geminiKey, maskedKey: geminiKey ? maskKey(geminiKey) : null },
      grok: { hasKey: !!grokKey, maskedKey: grokKey ? maskKey(grokKey) : null },
    };
  });

/** Picks which saved key (if any) AI features should use. */
export const setActiveAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ provider: z.enum(["lovable", "gemini", "grok"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ active_ai_provider: data.provider })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Validates a Gemini API key against the live API without saving it. */
export const testGeminiApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ apiKey: z.string().trim().min(10).max(200) }).parse(d))
  .handler(async ({ data }) => verifyGeminiApiKey(data.apiKey));

export const setGeminiApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ apiKey: z.string().trim().min(10).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ gemini_api_key: data.apiKey })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearGeminiApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ gemini_api_key: null })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Validates a Grok (xAI) API key against the live API without saving it. */
export const testGrokApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ apiKey: z.string().trim().min(10).max(200) }).parse(d))
  .handler(async ({ data }) => verifyGrokApiKey(data.apiKey));

export const setGrokApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ apiKey: z.string().trim().min(10).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ grok_api_key: data.apiKey })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearGrokApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ grok_api_key: null })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
