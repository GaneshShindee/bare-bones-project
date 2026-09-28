import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyTemplate } from "@/lib/templating";
import { deriveNames, greetingFor, bodyHasGreeting } from "@/lib/recipients";
import { aiChatJson } from "@/lib/ai-gateway";
import { parseAiJson } from "@/lib/parse-ai-json";


const targetSchema = z.object({
  /** email_recipients.id */
  recipientId: z.string().uuid(),
});

const bulkSchema = z.object({
  /** One entry per recipient — a reply is NEVER combined or BCC'd. */
  recipientIds: z.array(z.string().uuid()).min(1).max(200),
  body: z.string().min(1).max(100_000),
  /** Optional template to render per recipient instead of the raw body. */
  templateId: z.string().uuid().optional().nullable(),
  variables: z.record(z.string(), z.string()).optional(),
});

export type BulkReplyResult = {
  success: Array<{ emailHistoryId: string; recipientId: string; recipient: string; threadId: string; messageId: string }>;
  failed: Array<{ emailHistoryId: string; recipientId: string; recipient: string; reason: string }>;
};

type RecipientRow = {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  email_history_id: string;
  gmail_thread_id: string | null;
  gmail_message_id: string | null;
  rfc_message_id: string | null;
  user_reply_count: number;
};

/**
 * Sends ONE individual reply per recipient, each inside that recipient's own
 * Gmail thread. Never uses BCC and never reuses another recipient's thread.
 */
export const bulkSendReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkSchema.parse(d))
  .handler(async ({ data, context }): Promise<BulkReplyResult> => {
    const { supabase, userId } = context;

    // Ownership validation — RLS-scoped read, never trust the browser's ids.
    const { data: recipients, error } = await supabase
      .from("email_recipients")
      .select("id, email, name, company, email_history_id, gmail_thread_id, gmail_message_id, rfc_message_id, user_reply_count")
      .in("id", data.recipientIds)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    const owned = (recipients ?? []) as RecipientRow[];
    if (owned.length === 0) throw new Error("No matching recipients for this account.");

    const historyIds = Array.from(new Set(owned.map((r) => r.email_history_id)));
    const { data: campaigns, error: cErr } = await supabase
      .from("email_history")
      .select("id, subject, body, gmail_account_id, sender_email, template_name, parent_campaign_id")
      .in("id", historyIds)
      .eq("user_id", userId);
    if (cErr) throw new Error(cErr.message);
    const campaignById = new Map((campaigns ?? []).map((c) => [c.id, c]));

    let templateBody: string | null = null;
    if (data.templateId) {
      const { data: t } = await supabase
        .from("templates")
        .select("id, body")
        .eq("id", data.templateId)
        .eq("user_id", userId)
        .maybeSingle();
      templateBody = t?.body ?? null;
    }

    const {
      refreshAccessToken,
      buildRawEmail,
      formatFromHeader,
      gmailSend,
      generateRfcMessageId,
      replySubject,
      buildReferences,
    } = await import("./gmail.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve + cache an access token per Gmail account used by the selection.
    const tokenCache = new Map<string, { token: string; email: string; from: string }>();
    const resolveSender = async (accountId: string | null) => {
      const key = accountId ?? "__default__";
      const cached = tokenCache.get(key);
      if (cached) return cached;
      const base = supabase
        .from("gmail_connections")
        .select("id, gmail_email, display_name, full_name, refresh_token, access_token, expires_at")
        .eq("user_id", userId);
      const { data: conn } = accountId
        ? await base.eq("id", accountId).maybeSingle()
        : await base.order("is_default", { ascending: false }).limit(1).maybeSingle();
      if (!conn) throw new Error("Gmail account for this campaign is not connected.");
      let accessToken = conn.access_token ?? "";
      const expired = !conn.expires_at || new Date(conn.expires_at).getTime() < Date.now() + 30_000;
      if (!accessToken || expired) {
        const r = await refreshAccessToken(conn.refresh_token);
        accessToken = r.access_token;
        await supabaseAdmin
          .from("gmail_connections")
          .update({ access_token: accessToken, expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString() })
          .eq("id", conn.id);
      }
      const displayName = (conn.display_name ?? conn.full_name ?? "").trim() || null;
      const entry = { token: accessToken, email: conn.gmail_email, from: formatFromHeader(conn.gmail_email, displayName) };
      tokenCache.set(key, entry);
      return entry;
    };

    const result: BulkReplyResult = { success: [], failed: [] };
    const globalVars = data.variables ?? {};
    const proto = getRequestHeader("x-forwarded-proto") ?? "https";
    const origin = `${proto}://${getRequestHost()}`;


    // Sequential: one Gmail message per recipient, failures never abort the rest.
    for (const row of owned) {
      const campaign = campaignById.get(row.email_history_id);
      try {
        if (!campaign) throw new Error("Original campaign not found");
        const sender = await resolveSender(campaign.gmail_account_id);

        // Per-recipient variable resolution — never leak another recipient's name.
        const names = deriveNames(row.email, row.name);
        const greeting = greetingFor(row.email, row.name);
        const vars: Record<string, string> = {
          first_name: names.first_name || "there",
          last_name: names.last_name,
          full_name: names.full_name || names.first_name || "there",
          name: names.full_name || names.first_name || "there",
          greeting,
          company: row.company ?? "",
          sender_name: sender.email,
          date: new Date().toLocaleDateString(),
          ...globalVars,
        };
        const source = templateBody ?? data.body;
        let body = applyTemplate(source, vars);
        if (!bodyHasGreeting(source)) body = `${greeting}\n\n${body}`;

        const subject = replySubject(campaign.subject);
        const rfcMessageId = generateRfcMessageId(sender.email);
        const inReplyTo = row.rfc_message_id ?? null;
        const references = buildReferences({ references: row.rfc_message_id, inReplyTo });

        // Each outgoing reply is a first-class, individually tracked message.
        const rootCampaignId = campaign.parent_campaign_id ?? campaign.id;
        const trackingToken = crypto.randomUUID();
        const { data: replyHistory, error: rhErr } = await supabaseAdmin
          .from("email_history")
          .insert({
            user_id: userId,
            kind: "reply",
            parent_campaign_id: rootCampaignId,
            template_id: data.templateId ?? null,
            recipient: row.email,
            subject,
            body,
            status: "sending",
            gmail_account_id: campaign.gmail_account_id,
            sender_email: sender.email,
            recipient_count: 1,
            tracking_enabled: true,
            rfc_message_id: rfcMessageId,
          })
          .select("id")
          .single();
        if (rhErr || !replyHistory) throw new Error(rhErr?.message ?? "Failed to log reply");

        const { data: replyRecipient } = await supabaseAdmin
          .from("email_recipients")
          .insert({
            user_id: userId,
            email_history_id: replyHistory.id,
            email: row.email,
            name: row.name,
            company: row.company,
            status: "pending",
            tracking_token: trackingToken,
            rfc_message_id: rfcMessageId,
            gmail_thread_id: row.gmail_thread_id,
          })
          .select("id")
          .single();

        const raw = buildRawEmail({
          from: sender.from,
          to: row.name ? formatFromHeader(row.email, row.name) : row.email,
          subject,
          body,
          trackingPixelUrl: `${origin}/api/public/track/open/${trackingToken}`,
          thread: { messageId: rfcMessageId, inReplyTo, references },
        });
        // threadId keeps the reply inside THIS recipient's conversation.
        const sent = await gmailSend(sender.token, raw, row.gmail_thread_id);

        await supabaseAdmin
          .from("email_recipients")
          .update({
            user_reply_sent_at: new Date().toISOString(),
            user_reply_count: (row.user_reply_count ?? 0) + 1,
            gmail_thread_id: row.gmail_thread_id ?? sent.threadId,
          })
          .eq("id", row.id);

        await supabaseAdmin
          .from("email_history")
          .update({
            status: "sent",
            gmail_thread_id: sent.threadId,
            gmail_message_id: sent.id,
          })
          .eq("id", replyHistory.id);
        if (replyRecipient) {
          await supabaseAdmin
            .from("email_recipients")
            .update({ status: "sent", gmail_thread_id: sent.threadId, gmail_message_id: sent.id })
            .eq("id", replyRecipient.id);
        }


        result.success.push({
          emailHistoryId: row.email_history_id,
          recipientId: row.id,
          recipient: row.email,
          threadId: sent.threadId,
          messageId: sent.id,
        });
      } catch (err) {
        result.failed.push({
          emailHistoryId: row.email_history_id,
          recipientId: row.id,
          recipient: row.email,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  });

/** AI draft for a bulk reply. Never sends — the user reviews and confirms. */
export const generateBulkReplyDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        recipientIds: z.array(z.string().uuid()).min(1).max(200),
        instruction: z.string().max(2000).optional(),
        tone: z.enum(["professional", "friendly", "formal", "confident", "enthusiastic", "neutral"]).optional(),
        length: z.enum(["short", "medium", "detailed"]).optional(),
        templateId: z.string().uuid().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: recipients } = await supabase
      .from("email_recipients")
      .select("id, email, email_history_id")
      .in("id", data.recipientIds.slice(0, 5))
      .eq("user_id", userId);
    const first = (recipients ?? [])[0];
    if (!first) throw new Error("No matching recipients for this account.");

    const { data: campaign } = await supabase
      .from("email_history")
      .select("subject, body")
      .eq("id", first.email_history_id)
      .eq("user_id", userId)
      .maybeSingle();

    let conversation = "";
    const { data: replies } = await supabase
      .from("email_replies")
      .select("from_email, subject, body, snippet, received_at")
      .eq("user_id", userId)
      .in("email_recipient_id", data.recipientIds.slice(0, 5))
      .order("received_at", { ascending: false })
      .limit(3);
    for (const r of replies ?? []) {
      conversation += `\n\nReply from ${r.from_email}: ${(r.body ?? r.snippet ?? "").slice(0, 1500)}`;
    }

    let templateBody = "";
    if (data.templateId) {
      const { data: t } = await supabase
        .from("templates")
        .select("body")
        .eq("id", data.templateId)
        .eq("user_id", userId)
        .maybeSingle();
      templateBody = t?.body ?? "";
    }

    const tone = data.tone ?? "professional";
    const length = data.length ?? "medium";
    const lengthGuide =
      length === "short" ? "Under 80 words." : length === "detailed" ? "200-300 words." : "Around 120-180 words.";

    const content = await aiChatJson({
      supabase,
      userId,
      system:
        `You draft ONE reply body that will be sent individually to several recipients of the same campaign. Tone: ${tone}. ${lengthGuide} Use the placeholder {{first_name}} for the recipient's name — never a real name. Do not invent facts, dates, or offers. Return STRICT JSON: {"body":"..."} with no markdown.`,
      user: `Original outreach subject: ${campaign?.subject ?? ""}\nOriginal body:\n${(campaign?.body ?? "").slice(0, 2500)}${conversation}${templateBody ? `\n\nBase this closely on this reply template:\n${templateBody.slice(0, 2500)}` : ""}${data.instruction ? `\n\nUser instructions: ${data.instruction}` : ""}`,
    });
    const parsed = parseAiJson<{ body?: string }>(content);
    const body = (parsed.body ?? "").trim();
    if (!body) throw new Error("AI returned an empty draft");
    return { body };
  });

export type BulkReplyTarget = z.infer<typeof targetSchema>;
