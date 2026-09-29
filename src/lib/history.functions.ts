import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

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

export type CampaignSummary = {
  id: string;
  subject: string;
  company: string | null;
  role: string | null;
  template_name: string | null;
  sender_email: string | null;
  status: string;
  sent_at: string;
  error: string | null;
  recipient_count: number;
  recipients: number;
  opened: number;
  total_opens: number;
  resume_views: number;
  replied: number;
  you_replied: number;
  attachment_count: number;
  followupEnabled: boolean;
  followupDays: FollowupDay[];
  followupPending: boolean;
  followupDueDay: number | null;
};

export const FOLLOWUP_TRACKED_DAYS = 7;

export type FollowupDay = {
  day: number;
  dueAt: string;
  done: boolean;
  overdue: boolean;
};

/**
 * Builds the 7-day manual follow-up checklist for a campaign: day N is "due"
 * 24*N hours after it was sent, and stays "overdue" (the red-mark trigger)
 * until the user checks it off — independent of whether the recipient replied.
 */
function computeFollowupDays(sentAt: string, doneDays: Set<number>, now = Date.now()): FollowupDay[] {
  const sentMs = new Date(sentAt).getTime();
  const days: FollowupDay[] = [];
  for (let day = 1; day <= FOLLOWUP_TRACKED_DAYS; day++) {
    const dueAtMs = sentMs + day * 24 * 60 * 60 * 1000;
    const done = doneDays.has(day);
    days.push({ day, dueAt: new Date(dueAtMs).toISOString(), done, overdue: !done && dueAtMs <= now });
  }
  return days;
}

async function fetchFollowupDoneDays(
  supabase: SupabaseClient<Database>,
  userId: string,
  campaignIds: string[],
): Promise<Map<string, Set<number>>> {
  const map = new Map<string, Set<number>>();
  if (campaignIds.length === 0) return map;
  const { data: rows } = await supabase
    .from("campaign_followup_days")
    .select("email_history_id, day_number")
    .eq("user_id", userId)
    .in("email_history_id", campaignIds);
  for (const r of rows ?? []) {
    const set = map.get(r.email_history_id) ?? new Set<number>();
    set.add(r.day_number);
    map.set(r.email_history_id, set);
  }
  return map;
}

const CAMPAIGN_LIST_SELECT =
  "id, subject, template_name, sender_email, status, sent_at, error, recipient_count, attachments, kind, followup_enabled";

type CampaignRow = {
  id: string;
  subject: string;
  template_name: string | null;
  sender_email: string | null;
  status: string;
  sent_at: string;
  error: string | null;
  recipient_count: number | null;
  attachments: unknown;
  followup_enabled: boolean | null;
};

/** Shared recipient-aggregation + follow-up computation used by every campaign-list endpoint. */
async function buildCampaignSummaries(
  supabase: SupabaseClient<Database>,
  userId: string,
  campaigns: CampaignRow[],
): Promise<CampaignSummary[]> {
  if (campaigns.length === 0) return [];

  const ids = campaigns.map((c) => c.id);
  const { data: recipients } = await supabase
    .from("email_recipients")
    .select("email_history_id, company, role, open_count, pdf_view_count, replied_at, user_reply_sent_at")
    .eq("user_id", userId)
    .in("email_history_id", ids);

  const agg = new Map<
    string,
    { recipients: number; opened: number; opens: number; resume: number; replied: number; youReplied: number; companies: Set<string>; roles: Set<string> }
  >();
  for (const r of recipients ?? []) {
    const a = agg.get(r.email_history_id) ?? { recipients: 0, opened: 0, opens: 0, resume: 0, replied: 0, youReplied: 0, companies: new Set<string>(), roles: new Set<string>() };
    a.recipients += 1;
    a.opens += r.open_count ?? 0;
    if ((r.open_count ?? 0) > 0) a.opened += 1;
    if ((r.pdf_view_count ?? 0) > 0) a.resume += 1;
    if (r.replied_at) a.replied += 1;
    if (r.user_reply_sent_at) a.youReplied += 1;
    if (r.company?.trim()) a.companies.add(r.company.trim());
    if (r.role?.trim()) a.roles.add(r.role.trim());
    agg.set(r.email_history_id, a);
  }

  const doneDaysByCampaign = await fetchFollowupDoneDays(supabase, userId, ids);

  return campaigns.map((c) => {
    const a = agg.get(c.id);
    const attachments = Array.isArray(c.attachments) ? (c.attachments as unknown[]) : [];
    const companies = a?.companies ? Array.from(a.companies) : [];
    const company = companies.length === 1 ? companies[0] : companies.length > 1 ? `${companies.length} companies` : null;
    const roles = a?.roles ? Array.from(a.roles) : [];
    const role = roles.length === 1 ? roles[0] : roles.length > 1 ? `${roles.length} roles` : null;
    const followupEnabled = c.followup_enabled ?? true;
    const followupDays = followupEnabled ? computeFollowupDays(c.sent_at, doneDaysByCampaign.get(c.id) ?? new Set()) : [];
    const firstOverdue = followupDays.find((f) => f.overdue) ?? null;
    return {
      id: c.id,
      subject: c.subject,
      company,
      role,
      followupEnabled,
      followupDays,
      followupPending: !!firstOverdue,
      followupDueDay: firstOverdue?.day ?? null,
      template_name: c.template_name,
      sender_email: c.sender_email,
      status: c.status,
      sent_at: c.sent_at,
      error: c.error,
      recipient_count: c.recipient_count ?? 0,
      recipients: a?.recipients ?? c.recipient_count ?? 0,
      opened: a?.opened ?? 0,
      total_opens: a?.opens ?? 0,
      resume_views: a?.resume ?? 0,
      replied: a?.replied ?? 0,
      you_replied: a?.youReplied ?? 0,
      attachment_count: attachments.length,
    };
  });
}

/**
 * Builds the `.or()` clause for campaign search: matches the campaign's own fields
 * (subject/recipient list/template) plus any campaign whose recipients match by
 * name, company or role — company/role live on email_recipients, not email_history.
 */
async function buildCampaignSearchClause(supabase: SupabaseClient<Database>, userId: string, search: string): Promise<string> {
  const { data } = await supabase
    .from("email_recipients")
    .select("email_history_id")
    .eq("user_id", userId)
    .or(`name.ilike.%${search}%,company.ilike.%${search}%,role.ilike.%${search}%`)
    .limit(500);
  const matchingIds = Array.from(new Set((data ?? []).map((r) => r.email_history_id)));
  const idClause = matchingIds.length ? `,id.in.(${matchingIds.join(",")})` : "";
  return `recipient.ilike.%${search}%,subject.ilike.%${search}%,template_name.ilike.%${search}%${idClause}`;
}

/** Campaign-level history list (one row per send, replies excluded). */
export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        search: z.string().default(""),
        status: z.string().default("all"),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<CampaignSummary[]> => {
    let q = context.supabase
      .from("email_history")
      .select(CAMPAIGN_LIST_SELECT)
      .eq("user_id", context.userId)
      .neq("kind", "reply")
      .order("sent_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.search) q = q.or(await buildCampaignSearchClause(context.supabase, context.userId, data.search));
    if (data.dateFrom) q = q.gte("sent_at", `${data.dateFrom}T00:00:00.000Z`);
    if (data.dateTo) q = q.lte("sent_at", `${data.dateTo}T23:59:59.999Z`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return buildCampaignSummaries(context.supabase, context.userId, rows ?? []);
  });

export type CampaignPage = { rows: CampaignSummary[]; total: number; page: number; pageSize: number };

/** Paginated campaign-level history list for the history page (25 per page by default). */
export const listCampaignsPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        search: z.string().default(""),
        status: z.string().default("all"),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<CampaignPage> => {
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = context.supabase
      .from("email_history")
      .select(CAMPAIGN_LIST_SELECT, { count: "exact" })
      .eq("user_id", context.userId)
      .neq("kind", "reply")
      .order("sent_at", { ascending: false })
      .range(from, to);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.search) q = q.or(await buildCampaignSearchClause(context.supabase, context.userId, data.search));
    if (data.dateFrom) q = q.gte("sent_at", `${data.dateFrom}T00:00:00.000Z`);
    if (data.dateTo) q = q.lte("sent_at", `${data.dateTo}T23:59:59.999Z`);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    const summaries = await buildCampaignSummaries(context.supabase, context.userId, rows ?? []);
    return { rows: summaries, total: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

/** Permanently deletes a campaign (and its recipients/opens/replies/follow-up tracking via cascade). */
export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaignId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Reply-thread rows chained off this campaign have no FK cascade (self-reference), so clear them first.
    await context.supabase
      .from("email_history")
      .delete()
      .eq("user_id", context.userId)
      .eq("parent_campaign_id", data.campaignId);

    const { error, count } = await context.supabase
      .from("email_history")
      .delete({ count: "exact" })
      .eq("id", data.campaignId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    if (!count) throw new Error("Campaign not found");
    return { ok: true };
  });

/**
 * Recipient-level history rows with reply + resume-view state resolved from the
 * real tracking tables, then filtered with the shared filter logic.
 */
export const listHistoryRecipients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        search: z.string().default(""),
        openCount: z.enum(["all", "0", "1", "1+", "2", "3+"]).default("all"),
        replyStatus: z.enum(["all", "replied", "not_replied"]).default("all"),
        resume: z.enum(["all", "viewed", "not_viewed"]).default("all"),
        status: z.string().default("all"),
        campaignId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(2000).default(1000),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { filterRecipients } = await import("@/lib/history-filters");
    let q = context.supabase
      .from("email_recipients")
      .select(
        "id, email_history_id, email, name, company, role, status, open_count, first_opened_at, last_opened_at, pdf_view_count, last_pdf_view_at, replied_at, user_reply_sent_at, user_reply_count, followup_count, gmail_thread_id, gmail_message_id, rfc_message_id",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.campaignId) q = q.eq("email_history_id", data.campaignId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    if (list.length === 0) return [];

    const historyIds = Array.from(new Set(list.map((r) => r.email_history_id)));
    const [{ data: campaigns }, { data: replies }] = await Promise.all([
      context.supabase
        .from("email_history")
        .select("id, subject, template_name, sender_email, sent_at")
        .in("id", historyIds)
        .eq("user_id", context.userId),
      context.supabase
        .from("email_replies")
        .select("email_recipient_id, from_email, received_at")
        .eq("user_id", context.userId)
        .limit(5000),
    ]);
    const campaignById = new Map((campaigns ?? []).map((c) => [c.id, c]));
    const repliedRecipientIds = new Set<string>();
    const repliedEmails = new Map<string, string>();
    for (const r of replies ?? []) {
      if (r.email_recipient_id) repliedRecipientIds.add(r.email_recipient_id);
      const key = r.from_email.toLowerCase();
      if (!repliedEmails.has(key)) repliedEmails.set(key, r.received_at);
    }

    const shaped = list.map((r) => {
      const c = campaignById.get(r.email_history_id);
      const hasReply =
        !!r.replied_at || repliedRecipientIds.has(r.id) || repliedEmails.has(r.email.toLowerCase());
      return {
        id: r.id,
        email_history_id: r.email_history_id,
        email: r.email,
        name: r.name,
        company: r.company,
        role: r.role,
        subject: c?.subject ?? "(deleted campaign)",
        template_name: c?.template_name ?? null,
        sender_email: c?.sender_email ?? null,
        sent_at: c?.sent_at ?? new Date(0).toISOString(),
        status: r.status,
        open_count: r.open_count ?? 0,
        last_opened_at: r.last_opened_at,
        first_opened_at: r.first_opened_at,
        pdf_view_count: r.pdf_view_count ?? 0,
        last_pdf_view_at: r.last_pdf_view_at,
        has_reply: hasReply,
        recipient_replied_at: r.replied_at ?? repliedEmails.get(r.email.toLowerCase()) ?? null,
        user_reply_sent: !!r.user_reply_sent_at,
        user_reply_count: r.user_reply_count ?? 0,
        user_reply_sent_at: r.user_reply_sent_at,
        followup_count: r.followup_count ?? 0,
        gmail_thread_id: r.gmail_thread_id,
        gmail_message_id: r.gmail_message_id,
        rfc_message_id: r.rfc_message_id,
      };
    });

    return filterRecipients(shaped, {
      search: data.search,
      openCount: data.openCount,
      replyStatus: data.replyStatus,
      resume: data.resume,
      status: data.status,
    });
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
      .select("id, subject, body, template_name, template_id, status, sent_at, error, sender_email, gmail_account_id, bcc, attachments, recipient_count, open_count, first_opened_at, last_opened_at, tracking_enabled, followup_enabled")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!campaign) throw new Error("Campaign not found");

    const { data: recipients, error: rErr } = await context.supabase
      .from("email_recipients")
      .select("id, email, name, company, role, status, open_count, first_opened_at, last_opened_at, click_count")
      .eq("email_history_id", data.id)
      .order("open_count", { ascending: false })
      .order("email", { ascending: true });
    if (rErr) throw new Error(rErr.message);

    const doneDaysByCampaign = await fetchFollowupDoneDays(context.supabase, context.userId, [campaign.id]);
    const followupDays = campaign.followup_enabled
      ? computeFollowupDays(campaign.sent_at, doneDaysByCampaign.get(campaign.id) ?? new Set())
      : [];

    return { campaign, recipients: recipients ?? [], followupDays };
  });

/** Turns the 7-day follow-up tracker on/off for a campaign (e.g. cold outreach that doesn't need chasing). */
export const setCampaignFollowupEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ campaignId: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("email_history")
      .update({ followup_enabled: data.enabled })
      .eq("id", data.campaignId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Marks (or un-marks) one of the 7 follow-up-tracker days for a campaign as done. */
export const setCampaignFollowupDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        day: z.number().int().min(1).max(FOLLOWUP_TRACKED_DAYS),
        done: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: campaign } = await context.supabase
      .from("email_history")
      .select("id")
      .eq("id", data.campaignId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!campaign) throw new Error("Campaign not found");

    if (data.done) {
      const { error } = await context.supabase
        .from("campaign_followup_days")
        .upsert(
          { email_history_id: data.campaignId, user_id: context.userId, day_number: data.day, done_at: new Date().toISOString() },
          { onConflict: "email_history_id,day_number" },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("campaign_followup_days")
        .delete()
        .eq("email_history_id", data.campaignId)
        .eq("user_id", context.userId)
        .eq("day_number", data.day);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const getRecipient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: recipient, error } = await context.supabase
      .from("email_recipients")
      .select("id, email, name, company, role, status, open_count, first_opened_at, last_opened_at, click_count, email_history_id")
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

export type ThreadMessage = {
  id: string;
  direction: "outgoing" | "incoming";
  subject: string | null;
  body: string;
  at: string;
  /** Outgoing only: whether/how often the recipient viewed this exact message. */
  open_count: number;
  first_opened_at: string | null;
  last_opened_at: string | null;
  pdf_view_count: number;
  tracking_enabled: boolean;
  is_original: boolean;
};

/**
 * The full conversation for one recipient: the original email we sent, every
 * reply we sent afterwards (each individually tracked), and every reply they
 * sent back — ordered chronologically.
 */
export const getRecipientThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: recipient, error } = await supabase
      .from("email_recipients")
      .select(
        "id, email, name, company, status, open_count, first_opened_at, last_opened_at, pdf_view_count, first_pdf_view_at, last_pdf_view_at, replied_at, user_reply_count, followup_count, email_history_id, gmail_thread_id",
      )
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!recipient) throw new Error("Recipient not found");

    const { data: campaign } = await supabase
      .from("email_history")
      .select("id, subject, body, sent_at, sender_email, gmail_account_id, template_name, tracking_enabled, parent_campaign_id, attachments")
      .eq("id", recipient.email_history_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!campaign) throw new Error("Campaign not found");
    const rootId = campaign.parent_campaign_id ?? campaign.id;

    const [{ data: replyCampaigns }, { data: incoming }] = await Promise.all([
      supabase
        .from("email_history")
        .select("id, subject, body, sent_at, sender_email, tracking_enabled")
        .eq("user_id", userId)
        .eq("kind", "reply")
        .eq("parent_campaign_id", rootId)
        .order("sent_at", { ascending: true }),
      supabase
        .from("email_replies")
        .select("id, subject, body, snippet, received_at, from_email, email_recipient_id")
        .eq("user_id", userId)
        .order("received_at", { ascending: true })
        .limit(200),
    ]);

    const replyIds = (replyCampaigns ?? []).map((c) => c.id);
    let replyRecipientRows: Array<{
      email_history_id: string;
      email: string;
      open_count: number | null;
      first_opened_at: string | null;
      last_opened_at: string | null;
      pdf_view_count: number | null;
    }> = [];
    if (replyIds.length > 0) {
      const { data: rr } = await supabase
        .from("email_recipients")
        .select("email_history_id, email, open_count, first_opened_at, last_opened_at, pdf_view_count")
        .eq("user_id", userId)
        .in("email_history_id", replyIds);
      replyRecipientRows = rr ?? [];
    }
    const statsByReply = new Map(
      replyRecipientRows
        .filter((r) => r.email.toLowerCase() === recipient.email.toLowerCase())
        .map((r) => [r.email_history_id, r]),
    );

    const messages: ThreadMessage[] = [
      {
        id: campaign.id,
        direction: "outgoing",
        subject: campaign.subject,
        body: campaign.body,
        at: campaign.sent_at,
        open_count: recipient.open_count ?? 0,
        first_opened_at: recipient.first_opened_at,
        last_opened_at: recipient.last_opened_at,
        pdf_view_count: recipient.pdf_view_count ?? 0,
        tracking_enabled: !!campaign.tracking_enabled,
        is_original: true,
      },
    ];

    for (const c of replyCampaigns ?? []) {
      const stats = statsByReply.get(c.id);
      if (!stats) continue; // a reply sent to a different recipient in this campaign
      messages.push({
        id: c.id,
        direction: "outgoing",
        subject: c.subject,
        body: c.body,
        at: c.sent_at,
        open_count: stats.open_count ?? 0,
        first_opened_at: stats.first_opened_at,
        last_opened_at: stats.last_opened_at,
        pdf_view_count: stats.pdf_view_count ?? 0,
        tracking_enabled: !!c.tracking_enabled,
        is_original: false,
      });
    }

    const email = recipient.email.toLowerCase();
    for (const r of incoming ?? []) {
      const mine = r.email_recipient_id === recipient.id || r.from_email.toLowerCase() === email;
      if (!mine) continue;
      messages.push({
        id: r.id,
        direction: "incoming",
        subject: r.subject,
        body: r.body ?? r.snippet ?? "",
        at: r.received_at,
        open_count: 0,
        first_opened_at: null,
        last_opened_at: null,
        pdf_view_count: 0,
        tracking_enabled: false,
        is_original: false,
      });
    }

    messages.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return { recipient, campaign, messages };
  });