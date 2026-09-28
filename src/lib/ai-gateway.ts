import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Shared chat-completion caller. A user can save a Gemini and/or Grok API key
 *  and pick one as their active provider in Settings → AI. Whichever provider
 *  is selected there is used strictly — the shared Lovable gateway is only
 *  used when nothing is selected (or the selected provider has no key saved),
 *  never as a silent runtime fallback if the selected provider's call fails. */

export type AiProvider = "lovable" | "gemini" | "grok";
export const AI_PROVIDERS: AiProvider[] = ["lovable", "gemini", "grok"];

const LOVABLE_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_MODEL = "google/gemini-3-flash-preview";

const GEMINI_DIRECT_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_DIRECT_MODEL = "gemini-flash-latest";

const GROK_DIRECT_URL = "https://api.x.ai/v1/chat/completions";
const GROK_DIRECT_MODEL = "grok-4-fast";

type ChatCompletion = { choices?: { message?: { content?: string } }[] };
type ChatMessage = { role: string; content: string };

/** Providers occasionally return 503 "model overloaded" for a moment —
 *  retry a couple of times with backoff before surfacing an error. */
const OVERLOAD_RETRY_DELAYS_MS = [400, 1200];

async function postChatCompletion(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
): Promise<Response> {
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, response_format: { type: "json_object" } }),
    });
    if (res.status !== 503 || attempt >= OVERLOAD_RETRY_DELAYS_MS.length) return res;
    await new Promise((r) => setTimeout(r, OVERLOAD_RETRY_DELAYS_MS[attempt]));
  }
}

export async function getUserAiConfig(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ provider: AiProvider; geminiKey: string | null; grokKey: string | null }> {
  const { data } = await supabase
    .from("profiles")
    .select("gemini_api_key, grok_api_key, active_ai_provider")
    .eq("id", userId)
    .maybeSingle();
  const provider = (data?.active_ai_provider as AiProvider | undefined) ?? "lovable";
  const gemini = data?.gemini_api_key;
  const grok = data?.grok_api_key;
  return {
    provider: AI_PROVIDERS.includes(provider) ? provider : "lovable",
    geminiKey: gemini && gemini.trim() ? gemini.trim() : null,
    grokKey: grok && grok.trim() ? grok.trim() : null,
  };
}

/** Most providers () return 401/403 for a bad key, but xAI's Grok API
 *  returns plain 400 with {"code":"invalid-argument","error":"Incorrect API
 *  key..."} — detect that shape too so it still reads as a rejected key. */
function looksLikeInvalidKeyError(status: number, bodyText: string): boolean {
  if (status !== 400) return false;
  const lower = bodyText.toLowerCase();
  return lower.includes("invalid-argument") && lower.includes("api key");
}

async function callOpenAiCompatible(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  label: string,
): Promise<string> {
  const res = await postChatCompletion(url, apiKey, model, messages);
  if (res.status === 429) throw new Error(`Your ${label} API key hit its rate limit. Try again shortly.`);
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Your ${label} API key was rejected. Check it in Settings → AI.`);
  }
  if (res.status === 503) throw new Error(`${label} is temporarily overloaded with high demand. Try again in a moment.`);
  if (!res.ok) {
    const text = await res.text();
    if (looksLikeInvalidKeyError(res.status, text)) {
      throw new Error(`Your ${label} API key was rejected. Check it in Settings → AI.`);
    }
    throw new Error(`${label} API error ${res.status}: ${text.slice(0, 300)}`);
  }
  const j = (await res.json()) as ChatCompletion;
  return j.choices?.[0]?.message?.content ?? "";
}

const callDirectGemini = (apiKey: string, messages: ChatMessage[]) =>
  callOpenAiCompatible(GEMINI_DIRECT_URL, apiKey, GEMINI_DIRECT_MODEL, messages, "Gemini");

const callDirectGrok = (apiKey: string, messages: ChatMessage[]) =>
  callOpenAiCompatible(GROK_DIRECT_URL, apiKey, GROK_DIRECT_MODEL, messages, "Grok");

async function callLovableGateway(messages: ChatMessage[]): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI gateway not configured");
  const res = await postChatCompletion(LOVABLE_GATEWAY_URL, key, LOVABLE_MODEL, messages);
  if (res.status === 429) {
    throw new Error("AI rate limit reached. Try again shortly, or select your own API key in Settings → AI.");
  }
  if (res.status === 402) {
    throw new Error("AI credits exhausted. Select your own API key in Settings → AI to keep using AI features.");
  }
  if (res.status === 503) {
    throw new Error("AI is temporarily overloaded with high demand. Please try again in a moment.");
  }
  if (!res.ok) throw new Error(`AI error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as ChatCompletion;
  return j.choices?.[0]?.message?.content ?? "";
}

/** POST a chat-completion request (system + user message, JSON response) and
 *  return the raw content string. Uses whichever provider is selected in
 *  Settings → AI: "lovable" (or a selected provider with no key saved) goes
 *  to the shared Lovable gateway; "gemini"/"grok" with a saved key goes
 *  straight to that provider and its errors propagate as-is — no silent
 *  fallback to Lovable if the selected provider's own call fails. */
export async function aiChatJson(params: {
  supabase: SupabaseClient<Database>;
  userId: string;
  system: string;
  user: string;
}): Promise<string> {
  const { supabase, userId, system, user } = params;
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const cfg = await getUserAiConfig(supabase, userId);
  if (cfg.provider === "gemini" && cfg.geminiKey) return callDirectGemini(cfg.geminiKey, messages);
  if (cfg.provider === "grok" && cfg.grokKey) return callDirectGrok(cfg.grokKey, messages);

  return callLovableGateway(messages);
}

/** Validates a Gemini API key by making a minimal live request against it. */
export async function verifyGeminiApiKey(apiKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return verifyApiKey(GEMINI_DIRECT_URL, GEMINI_DIRECT_MODEL, apiKey, "Gemini");
}

/** Validates a Grok (xAI) API key by making a minimal live request against it. */
export async function verifyGrokApiKey(apiKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return verifyApiKey(GROK_DIRECT_URL, GROK_DIRECT_MODEL, apiKey, "Grok");
}

async function verifyApiKey(
  url: string,
  model: string,
  apiKey: string,
  label: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
        max_tokens: 5,
      }),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Invalid API key." };
    if (res.status === 429) return { ok: false, error: "Key is valid, but is currently rate-limited." };
    if (!res.ok) {
      const text = await res.text();
      if (looksLikeInvalidKeyError(res.status, text)) return { ok: false, error: "Invalid API key." };
      return { ok: false, error: `${label} API error ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : `Could not reach ${label} API.` };
  }
}
