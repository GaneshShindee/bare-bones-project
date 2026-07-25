
-- Jobs board
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT DEFAULT '',
  work_mode TEXT DEFAULT '',        -- remote / hybrid / onsite
  employment_type TEXT DEFAULT '',  -- full-time / intern / contract
  experience TEXT DEFAULT '',
  salary TEXT DEFAULT '',
  description TEXT DEFAULT '',
  responsibilities TEXT[] NOT NULL DEFAULT '{}',
  skills TEXT[] NOT NULL DEFAULT '{}',
  technologies TEXT[] NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  recruiter_email TEXT DEFAULT '',
  apply_url TEXT DEFAULT '',
  company_website TEXT DEFAULT '',
  source_url TEXT DEFAULT '',
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX jobs_created_at_idx ON public.jobs (created_at DESC);
CREATE INDEX jobs_user_idx ON public.jobs (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can view public jobs"
  ON public.jobs FOR SELECT TO authenticated
  USING (is_public = true OR user_id = auth.uid());
CREATE POLICY "Users can create jobs"
  ON public.jobs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners can update"
  ON public.jobs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners can delete"
  ON public.jobs FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
CREATE TRIGGER jobs_touch_updated_at BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Bookmarks
CREATE TABLE public.job_bookmarks (
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_id)
);
GRANT SELECT, INSERT, DELETE ON public.job_bookmarks TO authenticated;
GRANT ALL ON public.job_bookmarks TO service_role;
ALTER TABLE public.job_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their bookmarks"
  ON public.job_bookmarks FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Follow-up queue
CREATE TABLE public.followup_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  recipient_id UUID REFERENCES public.email_recipients ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.email_history ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT DEFAULT '',
  company TEXT DEFAULT '',
  condition TEXT NOT NULL DEFAULT 'opened',  -- opened / opened_multi / clicked_pdf / no_reply
  open_count INT NOT NULL DEFAULT 0,
  last_open_at TIMESTAMPTZ,
  pdf_click_at TIMESTAMPTZ,
  suggested_template_id UUID REFERENCES public.templates ON DELETE SET NULL,
  suggested_resume_version_id UUID REFERENCES public.resume_versions ON DELETE SET NULL,
  gmail_connection_id UUID REFERENCES public.gmail_connections ON DELETE SET NULL,
  priority INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending/approved/rejected/sent/canceled
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX followup_queue_user_status_idx ON public.followup_queue (user_id, status, scheduled_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_queue TO authenticated;
GRANT ALL ON public.followup_queue TO service_role;
ALTER TABLE public.followup_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their follow-ups"
  ON public.followup_queue FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER followup_queue_touch_updated_at BEFORE UPDATE ON public.followup_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- AI resume prompt templates
CREATE TABLE public.resume_prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_prompt_templates TO authenticated;
GRANT ALL ON public.resume_prompt_templates TO service_role;
ALTER TABLE public.resume_prompt_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their prompt templates"
  ON public.resume_prompt_templates FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER resume_prompt_templates_touch_updated_at BEFORE UPDATE ON public.resume_prompt_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Profile defaults
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_template_id UUID REFERENCES public.templates ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_gmail_connection_id UUID REFERENCES public.gmail_connections ON DELETE SET NULL;

-- Cancel pending follow-ups when a reply arrives
CREATE OR REPLACE FUNCTION public.cancel_followups_on_reply()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.followup_queue
     SET status = 'canceled', notes = 'Auto-canceled: recipient replied'
   WHERE user_id = NEW.user_id
     AND status IN ('pending', 'approved')
     AND lower(recipient_email) = lower(NEW.from_email);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS email_replies_cancel_followups ON public.email_replies;
CREATE TRIGGER email_replies_cancel_followups
  AFTER INSERT ON public.email_replies
  FOR EACH ROW EXECUTE FUNCTION public.cancel_followups_on_reply();
