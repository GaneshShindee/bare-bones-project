-- Pending migration for BCC campaigns, bounce ingestion, follow-up batches,
-- and custom location values. Verified against project sgtqsvpriftbjrnhoqlr.
-- Already present (do NOT re-add): email_recipients.delivery_status,
-- open_count, pdf_view_count, gmail_thread_id, gmail_message_id;
-- email_history.gmail_thread_id, gmail_message_id, send_mode;
-- profile_details, profile_entries, email_drafts.

-- 1. Delivery / bounce state on recipients
ALTER TABLE public.email_recipients
  ADD COLUMN IF NOT EXISTS bounce_reason text,
  ADD COLUMN IF NOT EXISTS provider_response jsonb,
  ADD COLUMN IF NOT EXISTS bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS followed_up_at timestamptz;

CREATE INDEX IF NOT EXISTS email_recipients_delivery_status_idx
  ON public.email_recipients (delivery_status);

-- 2. Bounce ingestion (raw provider events, deduplicated)
CREATE TABLE IF NOT EXISTS public.bounce_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.email_recipients(id) ON DELETE SET NULL,
  email text NOT NULL,
  gmail_message_id text,
  gmail_thread_id text,
  bounce_type text NOT NULL CHECK (bounce_type IN ('hard','soft','complaint','unknown')),
  diagnostic_code text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider text NOT NULL DEFAULT 'gmail',
  dedupe_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bounce_events TO authenticated;
GRANT ALL ON public.bounce_events TO service_role;
ALTER TABLE public.bounce_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own bounce events" ON public.bounce_events
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. Follow-up batches + targets
CREATE TABLE IF NOT EXISTS public.followup_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.email_history(id) ON DELETE CASCADE,
  name text,
  subject text,
  body_html text,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sending','sent','failed')),
  total_targets integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_batches TO authenticated;
GRANT ALL ON public.followup_batches TO service_role;
ALTER TABLE public.followup_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own followup batches" ON public.followup_batches
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.followup_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.followup_batches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.email_recipients(id) ON DELETE CASCADE,
  email text NOT NULL,
  gmail_thread_id text,
  gmail_message_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed','skipped')),
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, recipient_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_targets TO authenticated;
GRANT ALL ON public.followup_targets TO service_role;
ALTER TABLE public.followup_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own followup targets" ON public.followup_targets
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. Custom location values
CREATE TABLE IF NOT EXISTS public.custom_location_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, value)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_location_values TO authenticated;
GRANT ALL ON public.custom_location_values TO service_role;
ALTER TABLE public.custom_location_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own location values" ON public.custom_location_values
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
