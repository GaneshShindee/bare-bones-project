-- Job import sources (RSS / Greenhouse / Lever / Telegram) + dedupe helpers.

CREATE TABLE IF NOT EXISTS public.job_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  kind text NOT NULL CHECK (kind IN ('rss', 'greenhouse', 'lever', 'telegram')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  webhook_secret text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_sources_user_idx ON public.job_sources (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS job_sources_webhook_secret_uidx
  ON public.job_sources (webhook_secret)
  WHERE webhook_secret IS NOT NULL AND webhook_secret <> '';

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_user_source_url_uidx
  ON public.jobs (user_id, source_url)
  WHERE source_url IS NOT NULL AND length(trim(source_url)) > 0;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_user_external_id_uidx
  ON public.jobs (user_id, external_id)
  WHERE external_id IS NOT NULL AND length(trim(external_id)) > 0;

ALTER TABLE public.job_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_sources_owner_all ON public.job_sources;
CREATE POLICY job_sources_owner_all ON public.job_sources
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_sources TO authenticated;
GRANT ALL ON public.job_sources TO service_role;
