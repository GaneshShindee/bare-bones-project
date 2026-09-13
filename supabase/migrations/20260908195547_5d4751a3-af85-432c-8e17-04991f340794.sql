ALTER TABLE public.email_recipients
  ADD COLUMN IF NOT EXISTS user_reply_sent_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS user_reply_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS email_recipients_user_open_idx
  ON public.email_recipients (user_id, open_count);

CREATE INDEX IF NOT EXISTS email_recipients_user_pdf_idx
  ON public.email_recipients (user_id, pdf_view_count);

CREATE INDEX IF NOT EXISTS email_replies_recipient_idx
  ON public.email_replies (user_id, email_recipient_id);