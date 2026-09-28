import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

/**
 * Telegram bot webhook — each channel/group message becomes a Jobs Community posting.
 *
 * Setup:
 * 1. Create a bot with @BotFather, set TELEGRAM_BOT_TOKEN in .env
 * 2. On Jobs → Sync sources → add Telegram source (copies webhook URL)
 * 3. setWebhook: https://api.telegram.org/bot<TOKEN>/setWebhook?url=<YOUR_WEBHOOK_URL>
 * 4. Add the bot to your jobs channel; posts are parsed with AI and saved for that user
 */
export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const secret = url.searchParams.get("secret") || url.searchParams.get("token") || "";
        if (!secret || secret.length < 16) {
          return Response.json({ ok: false, error: "missing secret" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        type JobSourceRow = {
          id: string;
          user_id: string;
          config: Record<string, unknown> | null;
        };
        const { data: sourceRaw, error: sErr } = await supabaseAdmin
          .from("job_sources")
          .select("*")
          .eq("kind", "telegram")
          .eq("webhook_secret", secret)
          .eq("enabled", true)
          .maybeSingle();
        const source = sourceRaw as JobSourceRow | null;
        if (sErr || !source) {
          return Response.json({ ok: false, error: "unknown source" }, { status: 404 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
        }

        const update = body as {
          message?: {
            message_id?: number;
            text?: string;
            caption?: string;
            chat?: { id?: number; title?: string; type?: string };
            entities?: Array<{ type: string; offset: number; length: number }>;
          };
          channel_post?: {
            message_id?: number;
            text?: string;
            caption?: string;
            chat?: { id?: number; title?: string };
          };
        };

        const msg = update.channel_post ?? update.message;
        const text = (msg?.text || msg?.caption || "").trim();
        if (!text || text.length < 20) {
          return Response.json({ ok: true, skipped: "empty or short" });
        }
        // Ignore bot commands
        if (text.startsWith("/")) {
          return Response.json({ ok: true, skipped: "command" });
        }

        const chatId = msg?.chat?.id != null ? String(msg.chat.id) : "";
        const cfg = (source.config ?? {}) as { chatIds?: string[] };
        if (cfg.chatIds?.length && chatId && !cfg.chatIds.map(String).includes(chatId)) {
          return Response.json({ ok: true, skipped: "chat not allowed" });
        }

        const externalId = `telegram:${source.id}:${msg?.message_id ?? Date.now()}`;
        const { data: existing } = await supabaseAdmin
          .from("jobs")
          .select("id")
          .eq("user_id", source.user_id)
          .eq("external_id", externalId)
          .maybeSingle();
        if (existing) return Response.json({ ok: true, skipped: "duplicate" });

        try {
          const { aiExtractJobFields } = await import("@/lib/job-ai");
          const fields = await aiExtractJobFields(text, { supabase: supabaseAdmin, userId: source.user_id });
          const sourceUrl = `telegram://${source.id}/${msg?.message_id ?? "msg"}`;
          const { error: iErr } = await supabaseAdmin.from("jobs").insert({
            user_id: source.user_id,
            title: fields.title || "Untitled role",
            company: fields.company || (msg?.chat as { title?: string } | undefined)?.title || "Telegram",
            location: fields.location || "",
            work_mode: fields.work_mode || "",
            employment_type: fields.employment_type || "",
            experience: fields.experience || "",
            salary: fields.salary || "",
            description: fields.description || text.slice(0, 10_000),
            responsibilities: fields.responsibilities || [],
            skills: fields.skills || [],
            technologies: fields.technologies || [],
            tags: [...(fields.tags || []), "telegram"],
            recruiter_email: fields.recruiter_email || "",
            apply_url: fields.apply_url || "",
            company_website: fields.company_website || "",
            source_url: sourceUrl,
            external_id: externalId,
            is_public: true,
          });
          if (iErr) {
            await (supabaseAdmin as any)
              .from("job_sources")
              .update({ last_error: iErr.message, updated_at: new Date().toISOString() })
              .eq("id", source.id);
            return Response.json({ ok: false, error: iErr.message }, { status: 500 });
          }
          await (supabaseAdmin as any)
            .from("job_sources")
            .update({
              last_synced_at: new Date().toISOString(),
              last_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", source.id);
          return Response.json({ ok: true, created: true });
        } catch (e) {
          const err = (e as Error).message;
          await (supabaseAdmin as any)
            .from("job_sources")
            .update({ last_error: err, updated_at: new Date().toISOString() })
            .eq("id", source.id);
          return Response.json({ ok: false, error: err }, { status: 500 });
        }
      },
      GET: async () =>
        Response.json({
          ok: true,
          hint: "POST Telegram updates here with ?secret= from your Jobs → Sync sources Telegram entry",
        }),
    },
  },
});
