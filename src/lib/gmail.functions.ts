import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyTemplate } from "./templating";
import { deriveNames, validateEmails, greetingFor, bodyHasGreeting, type SkippedRecipient } from "./recipients";

export type GmailAccount = {
  id: string;
  gmail_email: string;
  label: string | null;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_default: boolean;
  connected_at: string;
};

export const listGmailAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GmailAccount[]> => {
    const { data, error } = await context.supabase
      .from("gmail_connections")
      .select("id, gmail_email, label, full_name, display_name, avatar_url, is_default, connected_at")
      .eq("user_id", context.userId)
      .order("is_default", { ascending: false })
      .order("connected_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as GmailAccount[];
  });

// Back-compat: returns the default account in the old shape.
export const getGmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("gmail_connections")
      .select("gmail_email, connected_at")
      .eq("user_id", context.userId)
      .order("is_default", { ascending: false })
      .order("connected_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return { connected: !!data, email: data?.gmail_email ?? null, connectedAt: data?.connected_at ?? null };
  });

export const startGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { buildAuthUrl, signState, callbackRedirectUri, requireGmailEnv } = await import("./gmail.server");
    requireGmailEnv();
    const proto = getRequestHeader("x-forwarded-proto") ?? "https";
    const host = getRequestHost();
    const origin = `${proto}://${host}`;
    const state = signState(context.userId);
    const url = buildAuthUrl({ redirectUri: callbackRedirectUri(origin), state });
    return { url };
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("gmail_connections").delete().eq("user_id", context.userId);
    if (data.id) q = q.eq("id", data.id);
    const { error } = await q;
    if (error) throw new Error(error.message);
    // Promote a remaining account to default if needed.
    const { data: remaining } = await context.supabase
      .from("gmail_connections")
      .select("id, is_default")
      .eq("user_id", context.userId)
      .order("connected_at", { ascending: true });
    if (remaining && remaining.length > 0 && !remaining.some((r) => r.is_default)) {
      await context.supabase
        .from("gmail_connections")
        .update({ is_default: true })
        .eq("id", remaining[0].id);
    }
    return { ok: true };
  });

export const setDefaultGmailAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Clear current defaults for this user, then set the chosen one.
    const { error: clearErr } = await context.supabase
      .from("gmail_connections")
      .update({ is_default: false })
      .eq("user_id", context.userId)
      .eq("is_default", true);
    if (clearErr) throw new Error(clearErr.message);
    const { error } = await context.supabase
      .from("gmail_connections")
      .update({ is_default: true })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const renameGmailAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), label: z.string().max(60).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("gmail_connections")
      .update({ label: data.label?.trim() || null })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateGmailDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), displayName: z.string().trim().max(120).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("gmail_connections")
      .update({ display_name: data.displayName?.trim() || null })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testGmailConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: conn, error } = await context.supabase
      .from("gmail_connections")
      .select("refresh_token, access_token, expires_at, gmail_email")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !conn) throw new Error("Account not found");
    const { refreshAccessToken } = await import("./gmail.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await refreshAccessToken(conn.refresh_token);
    await supabaseAdmin
      .from("gmail_connections")
      .update({
        access_token: r.access_token,
        expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(),
      })
      .eq("id", data.id);
    return { ok: true, email: conn.gmail_email };
  });

const sendSchema = z.object({
  templateId: z.string().uuid().optional().nullable(),
  gmailAccountId: z.string().uuid().optional().nullable(),
  recipients: z.array(z.string()).min(1).max(2000),
  recipientMeta: z
    .array(z.object({ email: z.string(), name: z.string().max(200).optional(), company: z.string().max(200).optional() }))
    .max(2000)
    .optional(),
  subject: z.string().min(1).max(998),
  body: z.string().min(1).max(100_000),
  variables: z.record(z.string(), z.string()).optional(),
  resumeIds: z.array(z.string().uuid()).max(10).optional(),
  uploads: z.array(z.object({
    filename: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(128),
    base64: z.string().min(1),
    size: z.number().int().positive().max(25 * 1024 * 1024),
  })).max(10).optional(),
});

export const sendEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sendSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Pick the requested Gmail account, or fall back to the user's default.
    const baseSelect = supabase
      .from("gmail_connections")
      .select("id, gmail_email, display_name, full_name, refresh_token, access_token, expires_at")
      .eq("user_id", userId);
    const { data: conn, error: connErr } = data.gmailAccountId
      ? await baseSelect.eq("id", data.gmailAccountId).maybeSingle()
      : await baseSelect.order("is_default", { ascending: false }).order("connected_at", { ascending: true }).limit(1).maybeSingle();
    if (connErr) throw new Error(connErr.message);
    if (!conn) throw new Error("Gmail is not connected. Connect Gmail in Settings.");

    const { refreshAccessToken, buildRawEmailWithAttachments, gmailSend, formatFromHeader } = await import("./gmail.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Per-user tracking preference (defaults on).
    const { data: prof } = await supabase
      .from("profiles")
      .select("tracking_open_enabled")
      .eq("id", userId)
      .maybeSingle();
    const trackingEnabled = (prof as { tracking_open_enabled?: boolean } | null)?.tracking_open_enabled ?? true;

    let accessToken = conn.access_token ?? "";
    const expired = !conn.expires_at || new Date(conn.expires_at).getTime() < Date.now() + 30_000;
    if (!accessToken || expired) {
      const refreshed = await refreshAccessToken(conn.refresh_token);
      accessToken = refreshed.access_token;
      await supabaseAdmin
        .from("gmail_connections")
        .update({
          access_token: accessToken,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        })
        .eq("id", conn.id);
    }

    const globalVars = data.variables ?? {};

    // Validate + dedupe recipients server-side. Skipped ones are recorded, campaign continues.
    const metaByEmail = new Map<string, { name?: string; company?: string }>();
    for (const m of data.recipientMeta ?? []) {
      metaByEmail.set(m.email.trim().toLowerCase(), { name: m.name, company: m.company });
    }
    const totalRequested = data.recipients.length;
    const { valid: deduped, skipped: preSkipped } = validateEmails(data.recipients, metaByEmail);
    const skippedReport: SkippedRecipient[] = [...preSkipped];
    if (deduped.length === 0) {
      throw new Error(
        "No valid recipients. All addresses were skipped (invalid syntax, duplicates, or unroutable domains).",
      );
    }
    const displayName = (conn.display_name ?? conn.full_name ?? "").trim() || null;
    const fromHeader = formatFromHeader(conn.gmail_email, displayName);

    let templateName: string | null = null;
    if (data.templateId) {
      const { data: t } = await supabase.from("templates").select("name").eq("id", data.templateId).maybeSingle();
      templateName = t?.name ?? null;
    }

    // Resolve attachments: saved resumes fetched server-side from storage, plus inline uploads.
    type Att = { filename: string; mimeType: string; data: Buffer; size: number; source: "resume" | "upload" };
    const attachments: Att[] = [];
    const attachmentMeta: Array<{ name: string; size: number; source: "resume" | "upload" }> = [];

    if (data.resumeIds && data.resumeIds.length > 0) {
      const { data: rows, error: rErr } = await supabase
        .from("resumes")
        .select("id, storage_path, original_filename, mime_type, size_bytes")
        .in("id", data.resumeIds)
        .eq("user_id", userId);
      if (rErr) throw new Error(rErr.message);
      for (const r of rows ?? []) {
        const { data: blob, error: dErr } = await supabaseAdmin.storage.from("resumes").download(r.storage_path);
        if (dErr || !blob) throw new Error(`Failed to read resume: ${dErr?.message ?? "missing"}`);
        const ab = await blob.arrayBuffer();
        attachments.push({
          filename: r.original_filename,
          mimeType: r.mime_type,
          data: Buffer.from(ab),
          size: r.size_bytes,
          source: "resume",
        });
        attachmentMeta.push({ name: r.original_filename, size: r.size_bytes, source: "resume" });
      }
    }
    for (const u of data.uploads ?? []) {
      const buf = Buffer.from(u.base64, "base64");
      attachments.push({ filename: u.filename, mimeType: u.mimeType, data: buf, size: u.size, source: "upload" });
      attachmentMeta.push({ name: u.filename, size: u.size, source: "upload" });
    }
    const totalAttachSize = attachments.reduce((n, a) => n + a.size, 0);
    if (totalAttachSize > 25 * 1024 * 1024) {
      throw new Error("Attachments exceed 25 MB total.");
    }

    // Pre-create the campaign history row.
    const proto = getRequestHeader("x-forwarded-proto") ?? "https";
    const host = getRequestHost();
    const origin = `${proto}://${host}`;
    // Render subject/body for the campaign-level record using the sender's own name as fallback.
    const previewNames = deriveNames("preview@example.com", displayName);
    const previewVars: Record<string, string> = {
      first_name: previewNames.first_name,
      last_name: previewNames.last_name,
      full_name: previewNames.full_name,
      name: previewNames.full_name || "there",
      sender_name: displayName ?? conn.gmail_email,
      company: "",
      designation: "",
      location: "",
      date: new Date().toLocaleDateString(),
      ...globalVars,
    };
    const subject = applyTemplate(data.subject, previewVars);
    const body = applyTemplate(data.body, previewVars);
    const hasPdf = attachments.some((a) => /pdf/i.test(a.mimeType) || /\.pdf$/i.test(a.filename));
    const { data: historyRow, error: hErr } = await supabaseAdmin
      .from("email_history")
      .insert({
        user_id: userId,
        template_id: data.templateId ?? null,
        template_name: templateName,
        recipient: deduped.join(", "),
        bcc: null,
        subject,
        body,
        status: "sending",
        gmail_account_id: conn.id,
        sender_email: conn.gmail_email,
        attachments: attachmentMeta,
        recipient_count: deduped.length,
        tracking_enabled: trackingEnabled,
        skipped: skippedReport,
      })
      .select("id")
      .single();
    if (hErr || !historyRow) throw new Error(hErr?.message ?? "Failed to log send");

    // Insert per-recipient rows (with tracking tokens) up-front.
    const recipientRows = deduped.map((email) => {
      const m = metaByEmail.get(email) ?? {};
      return {
        user_id: userId,
        email_history_id: historyRow.id,
        email,
        name: m.name ?? null,
        company: m.company ?? null,
        status: "pending" as const,
        tracking_token: trackingEnabled ? crypto.randomUUID() : null,
        pdf_tracking_token: hasPdf ? crypto.randomUUID() : null,
      };
    });
    const { data: inserted, error: rInsErr } = await supabaseAdmin
      .from("email_recipients")
      .insert(recipientRows)
      .select("id, email, name, company, tracking_token, pdf_tracking_token");
    if (rInsErr || !inserted) throw new Error(rInsErr?.message ?? "Failed to prepare recipients");

    // Send one message per recipient with a unique pixel — limited concurrency.
    const CONCURRENCY = 4;
    let sentCount = 0;
    let failedCount = 0;
    const errorRef: { value: string | null } = { value: null };

    const send = async (row: {
      id: string;
      email: string;
      name: string | null;
      company: string | null;
      tracking_token: string | null;
      pdf_tracking_token: string | null;
    }) => {
      const pixelUrl = trackingEnabled && row.tracking_token
        ? `${origin}/api/public/track/open/${row.tracking_token}`
        : undefined;

      // Per-recipient variables — greeting is the ONLY personalization.
      const names = deriveNames(row.email, row.name);
      const greeting = greetingFor(row.email, row.name);
      const perVars: Record<string, string> = {
        ...previewVars,
        first_name: names.first_name || "there",
        last_name: names.last_name,
        full_name: names.full_name || names.first_name || "there",
        name: names.full_name || names.first_name || "there",
        greeting,
        company: row.company ?? previewVars.company ?? "",
        ...globalVars,
      };
      let personalSubject = applyTemplate(data.subject, perVars);
      let personalBody = applyTemplate(data.body, perVars);
      // If the template doesn't already have a greeting anywhere, prepend one.
      if (!bodyHasGreeting(data.body)) {
        personalBody = `${greeting}\n\n${personalBody}`;
      }

      // Append tracked PDF link when a PDF is attached.
      if (hasPdf && row.pdf_tracking_token) {
        const pdfUrl = `${origin}/api/public/track/pdf/${row.pdf_tracking_token}`;
        personalBody = `${personalBody}\n\n📎 View attached resume: ${pdfUrl}`;
      }

      try {
        const raw = buildRawEmailWithAttachments({
          from: fromHeader,
          // TO = recipient. Sender is NOT placed in TO or BCC — no self-copy.
          to: row.email,
          subject: personalSubject,
          body: personalBody,
          attachments,
          trackingPixelUrl: pixelUrl,
        });
        await gmailSend(accessToken, raw);
        sentCount += 1;
        await supabaseAdmin
          .from("email_recipients")
          .update({ status: "sent" })
          .eq("id", row.id);
      } catch (err) {
        failedCount += 1;
        const msg = err instanceof Error ? err.message : String(err);
        if (!errorRef.value) errorRef.value = msg;
        await supabaseAdmin
          .from("email_recipients")
          .update({ status: "failed" })
          .eq("id", row.id);
      }
    };

    // Simple concurrency-limited worker pool.
    const queue = [...inserted];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) return;
        await send(next as Parameters<typeof send>[0]);
      }
    });
    await Promise.all(workers);

    const finalStatus = failedCount === 0 ? "sent" : sentCount === 0 ? "failed" : "partial";
    await supabaseAdmin
      .from("email_history")
      .update({
        status: finalStatus,
        error: errorRef.value ? errorRef.value.slice(0, 1000) : null,
      })
      .eq("id", historyRow.id);

    if (sentCount === 0) throw new Error(errorRef.value ?? "All sends failed");
    return {
      ok: true,
      historyId: historyRow.id,
      sent: sentCount,
      failed: failedCount,
      recipientCount: deduped.length,
      total: totalRequested,
      skipped: skippedReport,
    };
  });