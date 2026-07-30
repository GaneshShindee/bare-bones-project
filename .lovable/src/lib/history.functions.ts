import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ search: z.string().optional(), status: z.string().optional(), limit: z.number().int().min(1).max(500).default(200) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("email_history")
      .select("id, recipient, subject, template_name, status, sent_at, error, sender_email, bcc, attachments, recipient_count, open_count, last_opened_at, first_opened_at, tracking_enabled, body")
      .eq("user_id", context.userId)
      .order("sent_at", { ascending: false })
      .limit(data.limit);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.search) q = q.or(`recipient.ilike.%${data.search}%,subject.ilike.%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const dashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ count: total }, { count: sent }, { count: failed }, { data: recent }, { count: templateCount }, { data: openAgg }] =
      await Promise.all([
        context.supabase.from("email_history").select("id", { count: "exact", head: true }).eq("user_id", context.userId),
        context.supabase.from("email_history").select("id", { count: "exact", head: true }).eq("user_id", context.userId).eq("status", "sent"),
        context.supabase.from("email_history").select("id", { count: "exact", head: true }).eq("user_id", context.userId).eq("status", "failed"),
        context.supabase
          .from("email_history")
          .select("id, recipient, subject, status, sent_at, template_name, open_count, recipient_count")
          .eq("user_id", context.userId)
          .order("sent_at", { ascending: false })
          .limit(5),
        context.supabase.from("templates").select("id", { count: "exact", head: true }).eq("user_id", context.userId),
        context.supabase
          .from("email_history")
          .select("open_count, first_opened_at, status, tracking_enabled")
          .eq("user_id", context.userId),
      ]);
    const rows = (openAgg ?? []) as Array<{ open_count: number | null; first_opened_at: string | null; status: string; tracking_enabled: boolean | null }>;
    const totalOpens = rows.reduce((n, r) => n + (r.open_count ?? 0), 0);
    const trackedSent = rows.filter((r) => r.status === "sent" && r.tracking_enabled).length;
    const uniqueOpened = rows.filter((r) => (r.open_count ?? 0) > 0).length;
    const openRate = trackedSent > 0 ? uniqueOpened / trackedSent : 0;
    return {
      total: total ?? 0,
      sent: sent ?? 0,
      failed: failed ?? 0,
      templates: templateCount ?? 0,
      totalOpens,
      uniqueOpened,
      openRate,
      trackedSent,
      recent: recent ?? [],
    };
  });

export const analyticsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ days: z.number().int().min(1).max(365).default(30) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("email_history")
      .select("id, sent_at, status, recipient_count, open_count, first_opened_at, template_name, tracking_enabled")
      .eq("user_id", context.userId)
      .gte("sent_at", since)
      .order("sent_at", { ascending: true });
    if (error) throw new Error(error.message);
    const list = rows ?? [];

    // Bucket by day.
    const byDay = new Map<string, { sent: number; failed: number; opens: number; recipients: number }>();
    for (let i = 0; i < data.days; i++) {
      const d = new Date(Date.now() - (data.days - 1 - i) * 24 * 60 * 60 * 1000);
      byDay.set(d.toISOString().slice(0, 10), { sent: 0, failed: 0, opens: 0, recipients: 0 });
    }
    const templateAgg = new Map<string, { sent: number; opens: number; unique: number }>();
    let totalSent = 0, totalFailed = 0, totalRecipients = 0, totalOpens = 0, uniqueOpened = 0, trackedSent = 0;
    for (const r of list) {
      const day = new Date(r.sent_at).toISOString().slice(0, 10);
      const bucket = byDay.get(day);
      if (bucket) {
        if (r.status === "sent") bucket.sent += 1;
        if (r.status === "failed") bucket.failed += 1;
        bucket.opens += r.open_count ?? 0;
        bucket.recipients += r.recipient_count ?? 0;
      }
      if (r.status === "sent") totalSent += 1;
      if (r.status === "failed") totalFailed += 1;
      totalRecipients += r.recipient_count ?? 0;
      totalOpens += r.open_count ?? 0;
      if ((r.open_count ?? 0) > 0) uniqueOpened += 1;
      if (r.status === "sent" && r.tracking_enabled) trackedSent += 1;

      const key = r.template_name ?? "(no template)";
      const t = templateAgg.get(key) ?? { sent: 0, opens: 0, unique: 0 };
      if (r.status === "sent") t.sent += 1;
      t.opens += r.open_count ?? 0;
      if ((r.open_count ?? 0) > 0) t.unique += 1;
      templateAgg.set(key, t);
    }

    const series = Array.from(byDay.entries()).map(([date, v]) => ({ date, ...v }));
    const topTemplates = Array.from(templateAgg.entries())
      .map(([name, v]) => ({ name, ...v, openRate: v.sent > 0 ? v.unique / v.sent : 0 }))
      .sort((a, b) => b.sent - a.sent)
      .slice(0, 5);

    return {
      totals: {
        sent: totalSent,
        failed: totalFailed,
        recipients: totalRecipients,
        opens: totalOpens,
        uniqueOpened,
        trackedSent,
        openRate: trackedSent > 0 ? uniqueOpened / trackedSent : 0,
      },
      series,
      topTemplates,
    };
  });

export const getCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: campaign, error } = await context.supabase
      .from("email_history")
      .select("id, subject, body, template_name, template_id, status, sent_at, error, sender_email, gmail_account_id, bcc, attachments, recipient_count, open_count, first_opened_at, last_opened_at, tracking_enabled")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!campaign) throw new Error("Campaign not found");

    const { data: recipients, error: rErr } = await context.supabase
      .from("email_recipients")
      .select("id, email, name, company, status, open_count, first_opened_at, last_opened_at, click_count")
      .eq("email_history_id", data.id)
      .order("open_count", { ascending: false })
      .order("email", { ascending: true });
    if (rErr) throw new Error(rErr.message);

    return { campaign, recipients: recipients ?? [] };
  });

export const getRecipient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: recipient, error } = await context.supabase
      .from("email_recipients")
      .select("id, email, name, company, status, open_count, first_opened_at, last_opened_at, click_count, email_history_id")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!recipient) throw new Error("Recipient not found");

    const { data: campaign } = await context.supabase
      .from("email_history")
      .select("id, subject, body, template_id, template_name, sender_email, gmail_account_id, sent_at")
      .eq("id", recipient.email_history_id)
      .maybeSingle();

    const { data: opens, error: oErr } = await context.supabase
      .from("email_opens")
      .select("id, opened_at, device_type, browser, os, country, city, region, ip")
      .eq("email_recipient_id", recipient.id)
      .order("opened_at", { ascending: true });
    if (oErr) throw new Error(oErr.message);

    return { recipient, campaign, opens: opens ?? [] };
  });