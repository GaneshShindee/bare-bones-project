/** Shared (client + server) filter logic for the Email History recipient list. */

export type OpenCountFilter = "all" | "0" | "1" | "1+" | "2" | "3+";
export type ReplyStatusFilter = "all" | "replied" | "not_replied";
export type ResumeFilter = "all" | "viewed" | "not_viewed";

export type HistoryFilters = {
  search: string;
  openCount: OpenCountFilter;
  replyStatus: ReplyStatusFilter;
  resume: ResumeFilter;
  status: string;
};

export const defaultHistoryFilters: HistoryFilters = {
  search: "",
  openCount: "all",
  replyStatus: "all",
  resume: "all",
  status: "all",
};

/** One selectable row: a single recipient inside one campaign. */
export type HistoryRecipientRow = {
  id: string;
  email_history_id: string;
  email: string;
  name: string | null;
  company: string | null;
  subject: string;
  template_name: string | null;
  sender_email: string | null;
  sent_at: string;
  status: string;
  open_count: number;
  last_opened_at: string | null;
  first_opened_at: string | null;
  pdf_view_count: number;
  last_pdf_view_at: string | null;
  /** TRUE when the RECIPIENT replied to us at least once. */
  has_reply: boolean;
  recipient_replied_at: string | null;
  /** TRUE when WE sent a reply to this recipient. Independent from has_reply. */
  user_reply_sent: boolean;
  user_reply_count: number;
  user_reply_sent_at: string | null;
  followup_count: number;
  gmail_thread_id: string | null;
  gmail_message_id: string | null;
  rfc_message_id: string | null;
};

export function matchesOpenCount(openCount: number, f: OpenCountFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "0":
      return openCount === 0;
    case "1":
      return openCount === 1;
    case "1+":
      return openCount >= 1;
    case "2":
      return openCount === 2;
    case "3+":
      return openCount >= 3;
    default:
      return true;
  }
}

export function matchesReplyStatus(hasReply: boolean, f: ReplyStatusFilter): boolean {
  if (f === "all") return true;
  return f === "replied" ? hasReply : !hasReply;
}

export function matchesResume(pdfViewCount: number, f: ResumeFilter): boolean {
  if (f === "all") return true;
  return f === "viewed" ? pdfViewCount > 0 : pdfViewCount === 0;
}

export function matchesSearch(row: HistoryRecipientRow, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [row.name, row.email, row.subject, row.company]
    .some((v) => (v ?? "").toLowerCase().includes(q));
}

export function matchesFilters(row: HistoryRecipientRow, f: HistoryFilters): boolean {
  if (f.status !== "all" && row.status !== f.status) return false;
  return (
    matchesOpenCount(row.open_count, f.openCount) &&
    matchesReplyStatus(row.has_reply, f.replyStatus) &&
    matchesResume(row.pdf_view_count, f.resume) &&
    matchesSearch(row, f.search)
  );
}

export function filterRecipients(rows: HistoryRecipientRow[], f: HistoryFilters): HistoryRecipientRow[] {
  return rows.filter((r) => matchesFilters(r, f));
}

/** Recipients eligible for a follow-up: opened at least once, never replied. */
export function followUpEligible(row: HistoryRecipientRow): boolean {
  return row.open_count > 0 && !row.has_reply;
}
