
-- Master LaTeX resume projects
CREATE TABLE public.resume_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  storage_prefix TEXT NOT NULL,           -- e.g. "<user_id>/<project_id>/"
  main_tex_filename TEXT NOT NULL DEFAULT 'resume.tex',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_projects TO authenticated;
GRANT ALL ON public.resume_projects TO service_role;
ALTER TABLE public.resume_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resume_projects owner read" ON public.resume_projects
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "resume_projects owner insert" ON public.resume_projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "resume_projects owner update" ON public.resume_projects
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "resume_projects owner delete" ON public.resume_projects
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER resume_projects_updated_at BEFORE UPDATE ON public.resume_projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Generated resume versions
CREATE TABLE public.resume_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.resume_projects(id) ON DELETE CASCADE,
  job_title TEXT,
  company TEXT,
  job_description TEXT NOT NULL,
  custom_instructions TEXT,
  tex_content TEXT NOT NULL,
  pdf_storage_path TEXT,
  ats_score INTEGER,
  matched_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_versions TO authenticated;
GRANT ALL ON public.resume_versions TO service_role;
ALTER TABLE public.resume_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resume_versions owner read" ON public.resume_versions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "resume_versions owner insert" ON public.resume_versions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "resume_versions owner update" ON public.resume_versions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "resume_versions owner delete" ON public.resume_versions
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER resume_versions_updated_at BEFORE UPDATE ON public.resume_versions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX resume_versions_project_idx ON public.resume_versions(project_id, created_at DESC);

-- Track skipped recipients per campaign for send reports
ALTER TABLE public.email_history
  ADD COLUMN IF NOT EXISTS skipped JSONB NOT NULL DEFAULT '[]'::jsonb;
