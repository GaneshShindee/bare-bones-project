import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FollowupRow = {
  id: string;
  user_id: string;
  recipient_id: string | null;
  campaign_id: string | null;
  recipient_email: string;
  recipient_name: string;
  company: string;
  condition: string;
  open_count: number;
  last_open_at: string | null;
  pdf_click_at: string | null;
  suggested_template_id: string | null;
  suggested_resume_version_id: string | null;
  gmail_connection_id: string | null;
  priority: number;
  status: "pending" | "approved" | "rejected" | "sent" | "canceled";
  scheduled_at: string | null;
  sent_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

function nextIST3pm(): Date {
  // Tomorrow at 15:00 IST (UTC+5:30) = 09:30 UTC.
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 9, 30, 0));
  return target;
}

/** List queue entries for the current user. */
export const listFollowups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ status: z.string().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("followup_queue")
      .select("*")
      .eq("user_id", context.userId)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as FollowupRow[];
  });

/** Refresh the queue: build pending items from recipients who have opened but haven't replied. */
export const refreshFollowupQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Fetch opened recipients not replied and not already queued.
    const { data: recipients, error } = await supabase
      .from("email_recipients")
      .select("id, email_history_id, email, name, company, open_count, last_opened_at, click_count, last_clicked_at, status")
      .eq("user_id", userId)
      .gt("open_count", 0)
      .neq("status", "replied")
      .order("last_opened_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const { data: existing } = await supabase
      .from("followup_queue")
      .select("recipient_id")
      .eq("user_id", userId)
      .in("status", ["pending", "approved"]);
    const excluded = new Set((existing ?? []).map((r) => r.recipient_id).filter(Boolean));

    const inserted: string[] = [];
    for (const r of recipients ?? []) {
      if (excluded.has(r.id)) continue;
      const condition = r.click_count && r.click_count > 0
        ? "clicked_pdf"
        : r.open_count >= 2
        ? "opened_multi"
        : "opened";
      const priority = (r.click_count ?? 0) * 10 + (r.open_count ?? 0);
      const { data: row } = await supabase
        .from("followup_queue")
        .insert({
          user_id: userId,
          recipient_id: r.id,
          campaign_id: r.email_history_id,
          recipient_email: r.email,
          recipient_name: r.name ?? "",
          company: r.company ?? "",
          condition,
          open_count: r.open_count ?? 0,
          last_open_at: r.last_opened_at,
          pdf_click_at: r.last_clicked_at,
          priority,
          status: "pending",
        })
        .select("id")
        .single();
      if (row) inserted.push(row.id);
    }
    return { added: inserted.length };
  });

export const decideFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["approve", "reject"]),
        scheduledAt: z.string().datetime().optional().nullable(),
        templateId: z.string().uuid().nullable().optional(),
        resumeVersionId: z.string().uuid().nullable().optional(),
        gmailConnectionId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const update: {
      status?: "approved" | "rejected";
      scheduled_at?: string | null;
      suggested_template_id?: string | null;
      suggested_resume_version_id?: string | null;
      gmail_connection_id?: string | null;
    } = {};
    if (data.action === "approve") {
      update.status = "approved";
      update.scheduled_at = data.scheduledAt ?? nextIST3pm().toISOString();
    } else {
      update.status = "rejected";
    }
    if (data.templateId !== undefined) update.suggested_template_id = data.templateId;
    if (data.resumeVersionId !== undefined) update.suggested_resume_version_id = data.resumeVersionId;
    if (data.gmailConnectionId !== undefined) update.gmail_connection_id = data.gmailConnectionId;
    const { error } = await context.supabase
      .from("followup_queue")
      .update(update)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("followup_queue")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: true };
  });