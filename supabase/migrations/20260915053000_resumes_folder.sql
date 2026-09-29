-- Group resumes in the library (e.g. "AI generated resume based on JD").
ALTER TABLE public.resumes ADD COLUMN IF NOT EXISTS folder text;
ALTER TABLE public.resumes ADD COLUMN IF NOT EXISTS source_resume_version_id uuid REFERENCES public.resume_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS resumes_user_folder_idx
  ON public.resumes (user_id, folder);

CREATE UNIQUE INDEX IF NOT EXISTS resumes_user_source_version_uidx
  ON public.resumes (user_id, source_resume_version_id)
  WHERE source_resume_version_id IS NOT NULL;
