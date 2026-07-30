
ALTER TABLE public.email_history
  ADD COLUMN IF NOT EXISTS tracking_token uuid UNIQUE DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS tracking_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_opened_at timestamptz;

CREATE INDEX IF NOT EXISTS email_history_tracking_token_idx ON public.email_history(tracking_token);
CREATE INDEX IF NOT EXISTS email_history_user_sent_at_idx ON public.email_history(user_id, sent_at DESC);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tracking_open_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.record_email_open(_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.email_history
     SET open_count = open_count + 1,
         last_opened_at = now(),
         first_opened_at = COALESCE(first_opened_at, now())
   WHERE tracking_token = _token
     AND tracking_enabled = true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_email_open(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_email_open(uuid) TO anon, authenticated, service_role;
