-- Profile module + email drafts for Smart Email Sender V2.
-- Apply with the database migration tool; kept here because supabase/migrations/ is tool-managed.

-- 1. profile_details ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_details (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL DEFAULT '',
  last_name  text NOT NULL DEFAULT '',
  email      text NOT NULL DEFAULT '',
  phone      text NOT NULL DEFAULT '',
  location   text NOT NULL DEFAULT '',
  linkedin   text NOT NULL DEFAULT '',
  github     text NOT NULL DEFAULT '',
  portfolio  text NOT NULL DEFAULT '',
  summary    text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_details TO authenticated;
GRANT ALL ON public.profile_details TO service_role;

ALTER TABLE public.profile_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own profile details"
  ON public.profile_details FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. profile_entries ---------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.profile_section AS ENUM
    ('education','experience','project','skill','certification','achievement','language');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.profile_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section public.profile_section NOT NULL,
  title       text NOT NULL DEFAULT '',
  subtitle    text NOT NULL DEFAULT '',
  location    text NOT NULL DEFAULT '',
  start_date  text NOT NULL DEFAULT '',
  end_date    text NOT NULL DEFAULT '',
  is_current  boolean NOT NULL DEFAULT false,
  description text NOT NULL DEFAULT '',
  bullets     text[] NOT NULL DEFAULT '{}',
  tags        text[] NOT NULL DEFAULT '{}',
  url         text NOT NULL DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_entries_user_section_idx
  ON public.profile_entries (user_id, section, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_entries TO authenticated;
GRANT ALL ON public.profile_entries TO service_role;

ALTER TABLE public.profile_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own profile entries"
  ON public.profile_entries FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. email_drafts ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled draft',
  gmail_account_id uuid,
  template_id uuid,
  resume_version_id uuid,
  recipients text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  resume_ids uuid[] NOT NULL DEFAULT '{}',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  company text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  job_description text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_drafts_user_updated_idx
  ON public.email_drafts (user_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_drafts TO authenticated;
GRANT ALL ON public.email_drafts TO service_role;

ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own drafts"
  ON public.email_drafts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. draft attachment storage -------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('draft-attachments', 'draft-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users manage their own draft attachments"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'draft-attachments' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'draft-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
