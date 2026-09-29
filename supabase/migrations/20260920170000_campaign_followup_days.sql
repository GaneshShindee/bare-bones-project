-- Manual per-campaign follow-up checklist: one row per day (1-7) the user has
-- marked "follow-up taken" for a campaign, counted from its sent_at.
CREATE TABLE IF NOT EXISTS public.campaign_followup_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_history_id uuid NOT NULL REFERENCES public.email_history(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_number smallint NOT NULL CHECK (day_number BETWEEN 1 AND 7),
  done_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email_history_id, day_number)
);

CREATE INDEX IF NOT EXISTS campaign_followup_days_campaign_idx ON public.campaign_followup_days (email_history_id);
CREATE INDEX IF NOT EXISTS campaign_followup_days_user_idx ON public.campaign_followup_days (user_id);

ALTER TABLE public.campaign_followup_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_followup_days_owner_all ON public.campaign_followup_days;
CREATE POLICY campaign_followup_days_owner_all ON public.campaign_followup_days
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_followup_days TO authenticated;
GRANT ALL ON public.campaign_followup_days TO service_role;
