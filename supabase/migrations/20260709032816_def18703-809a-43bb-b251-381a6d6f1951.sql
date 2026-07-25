-- Individual open events table for CRM-style tracking
CREATE TABLE public.email_opens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email_recipient_id UUID REFERENCES public.email_recipients(id) ON DELETE CASCADE,
  email_history_id UUID NOT NULL REFERENCES public.email_history(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip TEXT,
  user_agent TEXT,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  country TEXT,
  city TEXT,
  region TEXT
);
CREATE INDEX idx_email_opens_recipient ON public.email_opens(email_recipient_id, opened_at DESC);
CREATE INDEX idx_email_opens_history ON public.email_opens(email_history_id, opened_at DESC);
CREATE INDEX idx_email_opens_user ON public.email_opens(user_id, opened_at DESC);

GRANT SELECT, INSERT ON public.email_opens TO authenticated;
GRANT ALL ON public.email_opens TO service_role;

ALTER TABLE public.email_opens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own open events"
  ON public.email_opens FOR SELECT
  USING (auth.uid() = user_id);