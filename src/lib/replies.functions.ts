import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Pull recent inbox messages for every connection that granted read scope and
 *  persist those that appear to be replies to our own outreach threads. */
export const syncReplies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: conns, error } = await supabase
      .from("gmail_connections")
      .select("id, gmail_email, access_token, refresh_token, expires_at, last_synced_at, reads_enabled")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    const activeConns = (conns ?? []).filter((c) => c.reads_enabled);
    if (activeConns.length === 0) return { synced: 0, replies: 0, needsReconnect: (conns ?? []).length > 0 };

    const {
      refreshAccessToken,
      gmailListInboxSince,
      gmailGetMessage,
      extractPlainText,
      headerVal,
      parseFromHeader,
    } = await import("./gmail.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let totalReplies = 0;
    for (const conn of activeConns) {
      let accessToken = conn.access_token ?? "";
      const expired = !conn.expires_at || new Date(conn.expires_at).getTime() < Date.now() + 30_000;
      if (!accessToken || expired) {
        try {
          const r = await refreshAccessToken(conn.refresh_token);
          accessToken = r.access_token;
          await supabaseAdmin
            .from("gmail_connections")
            .update({
              access_token: accessToken,
              expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(),
            })
            .eq("id", conn.id);
        } catch {
          continue;
        }
      }

      // Look at messages received in the last ~48h (or since last sync).
      const cutoff = conn.last_synced_at
        ? Math.floor(new Date(conn.last_synced_at).getTime() / 1000)
        : Math.floor((Date.now() - 48 * 60 * 60 * 1000) / 1000);
      let list;
      try {
        list = await gmailListInboxSince(accessToken, cutoff, 25);
      } catch {
        continue;
      }

      // Load our recent recipients for quick match by email address.
      const { data: recentRecipients } = await supabaseAdmin
        .from("email_recipients")
        .select("id, email, email_history_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(2000);
      const recipientByEmail = new Map<string, { id: string; email_history_id: string }>();
      for (const r of recentRecipients ?? []) {
        if (!recipientByEmail.has(r.email)) recipientByEmail.set(r.email, { id: r.id, email_history_id: r.email_history_id });
      }

      for (const m of list.messages ?? []) {
        // Skip if we already stored it.
        const { data: existing } = await supabaseAdmin
          .from("email_replies")
          .select("id")
          .eq("user_id", userId)
          .eq("gmail_message_id", m.id)
          .maybeSingle();
        if (existing) continue;

        let msg;
        try {
          msg = await gmailGetMessage(accessToken, m.id);
        } catch {
          continue;
        }
        if (msg.labelIds && !msg.labelIds.includes("INBOX")) continue;
        if (msg.labelIds && msg.labelIds.includes("SENT")) continue;

        const fromRaw = headerVal(msg, "From");
        const subject = headerVal(msg, "Subject") ?? null;
        const dateHdr = headerVal(msg, "Date");
        const inReplyTo = headerVal(msg, "In-Reply-To");
        const references = headerVal(msg, "References");
        const { email: fromEmail, name: fromName } = parseFromHeader(fromRaw);
        if (fromEmail === conn.gmail_email.toLowerCase()) continue;

        const known = recipientByEmail.get(fromEmail);
        // Only save messages we can attribute to a campaign (either matched sender or in-reply header).
        if (!known && !inReplyTo && !references) continue;

        const receivedAt = dateHdr
          ? new Date(dateHdr).toISOString()
          : msg.internalDate
            ? new Date(Number(msg.internalDate)).toISOString()
            : new Date().toISOString();

        const body = extractPlainText(msg).slice(0, 20_000);
        await supabaseAdmin.from("email_replies").insert({
          user_id: userId,
          gmail_account_id: conn.id,
          gmail_message_id: msg.id,
          gmail_thread_id: msg.threadId ?? null,
          email_history_id: known?.email_history_id ?? null,
          email_recipient_id: known?.id ?? null,
          from_email: fromEmail,
          from_name: fromName ?? null,
          subject,
          snippet: msg.snippet?.slice(0, 500) ?? null,
          body,
          received_at: receivedAt,
        });
        totalReplies += 1;
      }

      await supabaseAdmin
        .from("gmail_connections")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", conn.id);
    }

    return { synced: activeConns.length, replies: totalReplies, needsReconnect: false };
  });

export const listReplies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ filter: z.enum(["all", "unread", "read", "archived"]).default("unread") }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("email_replies")
      .select("id, from_email, from_name, subject, snippet, received_at, is_read, is_archived, email_history_id, gmail_thread_id, gmail_account_id")
      .eq("user_id", context.userId)
      .order("received_at", { ascending: false })
      .limit(200);
    if (data.filter === "unread") q = q.eq("is_read", false).eq("is_archived", false);
    else if (data.filter === "read") q = q.eq("is_read", true).eq("is_archived", false);
    else if (data.filter === "archived") q = q.eq("is_archived", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getReply = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: reply, error } = await context.supabase
      .from("email_replies")
      .select("id, from_email, from_name, subject, snippet, body, received_at, is_read, is_archived, email_history_id, email_recipient_id, gmail_thread_id, gmail_account_id, gmail_message_id")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!reply) throw new Error("Reply not found");
    // Mark as read on view.
    if (!reply.is_read) {
      await context.supabase.from("email_replies").update({ is_read: true }).eq("id", reply.id);
    }
    let campaign = null;
    if (reply.email_history_id) {
      const { data: c } = await context.supabase
        .from("email_history")
        .select("id, subject, sender_email, sent_at, template_name")
        .eq("id", reply.email_history_id)
        .maybeSingle();
      campaign = c;
    }
    return { reply, campaign };
  });

export const updateReplyState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      isRead: z.boolean().optional(),
      isArchived: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const update: { is_read?: boolean; is_archived?: boolean } = {};
    if (data.isRead !== undefined) update.is_read = data.isRead;
    if (data.isArchived !== undefined) update.is_archived = data.isArchived;
    const { error } = await context.supabase
      .from("email_replies")
      .update(update)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generateReplyDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      replyId: z.string().uuid(),
      instruction: z.string().max(2000).optional(),
      tone: z.enum(["professional", "friendly", "formal", "confident", "enthusiastic", "neutral"]).optional(),
      length: z.enum(["short", "medium", "detailed"]).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI gateway not configured");
    const { data: reply, error } = await context.supabase
      .from("email_replies")
      .select("subject, body, snippet, from_email, from_name, email_history_id")
      .eq("id", data.replyId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !reply) throw new Error("Reply not found");
    let campaignContext = "";
    if (reply.email_history_id) {
      const { data: c } = await context.supabase
        .from("email_history")
        .select("subject, body")
        .eq("id", reply.email_history_id)
        .maybeSingle();
      if (c) campaignContext = `\n\nOriginal outreach subject: ${c.subject}\nOriginal body:\n${(c.body ?? "").slice(0, 2000)}`;
    }
    const tone = data.tone ?? "professional";
    const length = data.length ?? "medium";
    const lengthGuide =
      length === "short" ? "Keep the reply under 80 words." :
      length === "detailed" ? "Aim for 200-300 words with clear structure." :
      "Keep the reply around 120-180 words.";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              `You are an email reply assistant. Draft a context-aware reply that references the ORIGINAL outreach and the recipient's latest message. Tone: ${tone}. ${lengthGuide} Do NOT invent facts, credentials, dates, or offers. If the user provides custom instructions, follow them naturally. Return STRICT JSON: {"subject":"...","body":"..."}. No markdown.`,
          },
          {
            role: "user",
            content: `Draft a reply to this message.${data.instruction ? `\n\nUser instructions: ${data.instruction}` : ""}\n\nFrom: ${reply.from_name ?? ""} <${reply.from_email}>\nSubject: ${reply.subject ?? ""}\nTheir message:\n${(reply.body ?? reply.snippet ?? "").slice(0, 6000)}${campaignContext}`,
          },
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
    const parsed = JSON.parse(m[0]) as { subject?: string; body?: string };
    return {
      subject: (parsed.subject ?? "").trim() || `Re: ${reply.subject ?? ""}`,
      body: (parsed.body ?? "").trim(),
    };
  });

export const sendReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      replyId: z.string().uuid(),
      subject: z.string().min(1).max(998),
      body: z.string().min(1).max(100_000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: reply, error } = await supabase
      .from("email_replies")
      .select("id, from_email, from_name, subject, gmail_thread_id, gmail_message_id, gmail_account_id, email_history_id")
      .eq("id", data.replyId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !reply) throw new Error("Reply not found");
    if (!reply.gmail_account_id) throw new Error("Reply is not linked to a Gmail account");
    const { data: conn, error: cErr } = await supabase
      .from("gmail_connections")
      .select("id, gmail_email, display_name, full_name, refresh_token, access_token, expires_at")
      .eq("id", reply.gmail_account_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (cErr || !conn) throw new Error("Sender account not found");

    const { refreshAccessToken, buildRawEmail, formatFromHeader } = await import("./gmail.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
    const from = formatFromHeader(conn.gmail_email, displayName);
    const to = reply.from_name ? formatFromHeader(reply.from_email, reply.from_name) : reply.from_email;
    const raw = buildRawEmail({ from, to, subject: data.subject, body: data.body });

    // Post to Gmail with threading headers so it shows in the same conversation.
    const payload: { raw: string; threadId?: string } = { raw };
    if (reply.gmail_thread_id) payload.threadId = reply.gmail_thread_id;
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Gmail send failed: ${res.status} ${await res.text()}`);

    await supabase.from("email_replies").update({ is_read: true }).eq("id", reply.id);
    return { ok: true };
  });

export const notificationsFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: opens }, { data: replies }, { data: pdfs }] = await Promise.all([
      supabase
        .from("email_opens")
        .select("id, opened_at, email_recipient_id, email_history_id, device_type, browser")
        .eq("user_id", userId)
        .order("opened_at", { ascending: false })
        .limit(50),
      supabase
        .from("email_replies")
        .select("id, from_email, from_name, subject, received_at, is_read, email_history_id")
        .eq("user_id", userId)
        .order("received_at", { ascending: false })
        .limit(50),
      supabase
        .from("pdf_events")
        .select("id, created_at, filename, email_history_id, email_recipient_id, device_type")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    type N = { id: string; type: string; time: string; title: string; sub: string; link?: string };
    const items: N[] = [];
    for (const o of opens ?? []) {
      items.push({
        id: `o-${o.id}`,
        type: "open",
        time: o.opened_at,
        title: "Email opened",
        sub: `${o.browser ?? "Unknown"} · ${o.device_type ?? ""}`,
        link: o.email_history_id ? `/campaigns/${o.email_history_id}` : undefined,
      });
    }
    for (const r of replies ?? []) {
      items.push({
        id: `r-${r.id}`,
        type: "reply",
        time: r.received_at,
        title: `Reply from ${r.from_name ?? r.from_email}`,
        sub: r.subject ?? "",
        link: `/replies`,
      });
    }
    for (const p of pdfs ?? []) {
      items.push({
        id: `p-${p.id}`,
        type: "pdf",
        time: p.created_at,
        title: `Resume viewed`,
        sub: `${p.filename ?? "PDF"} · ${p.device_type ?? ""}`,
        link: p.email_history_id ? `/campaigns/${p.email_history_id}` : undefined,
      });
    }
    return items.sort((a, b) => (a.time < b.time ? 1 : -1)).slice(0, 60);
  });