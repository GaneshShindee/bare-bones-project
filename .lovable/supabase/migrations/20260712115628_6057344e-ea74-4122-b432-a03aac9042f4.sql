
-- Gmail connections: sync cursor and read scope flag
ALTER TABLE public.gmail_connections
  ADD COLUMN IF NOT EXISTS last_history_id TEXT,
  ADD COLUMN IF NOT EXISTS reads_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Replies table
CREATE TABLE IF NOT EXISTS public.email_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_account_id UUID REFERENCES public.gmail_connections(id) ON DELETE SET NULL,
  email_history_id UUID REFERENCES public.email_history(id) ON DELETE SET NULL,
  email_recipient_id UUID REFERENCES public.email_recipients(id) ON DELETE SET NULL,
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT,
  from_email TEXT NOT NULL,
  from_name TEXT,
  subject TEXT,
  snippet TEXT,
  body TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, gmail_message_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_replies TO authenticated;
GRANT ALL ON public.email_replies TO service_role;
ALTER TABLE public.email_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user manages own replies" ON public.email_replies
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS email_replies_user_recv_idx ON public.email_replies (user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS email_replies_history_idx ON public.email_replies (email_history_id);

-- PDF events
CREATE TABLE IF NOT EXISTS public.pdf_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_history_id UUID REFERENCES public.email_history(id) ON DELETE CASCADE,
  email_recipient_id UUID REFERENCES public.email_recipients(id) ON DELETE CASCADE,
  tracking_token TEXT NOT NULL,
  filename TEXT,
  event_type TEXT NOT NULL DEFAULT 'view', -- view | download
  ip TEXT,
  user_agent TEXT,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  country TEXT,
  city TEXT,
  region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdf_events TO authenticated;
GRANT ALL ON public.pdf_events TO service_role;
ALTER TABLE public.pdf_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user reads own pdf events" ON public.pdf_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS pdf_events_recipient_idx ON public.pdf_events (email_recipient_id);
CREATE INDEX IF NOT EXISTS pdf_events_token_idx ON public.pdf_events (tracking_token);

-- Add pdf tracking token to recipients so we can attach a tracked link
ALTER TABLE public.email_recipients
  ADD COLUMN IF NOT EXISTS pdf_tracking_token TEXT;
CREATE INDEX IF NOT EXISTS email_recipients_pdf_token_idx ON public.email_recipients (pdf_tracking_token);
