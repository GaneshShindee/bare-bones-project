
-- Resumes table
CREATE TABLE public.resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  original_filename text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resumes TO authenticated;
GRANT ALL ON public.resumes TO service_role;

ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own resumes select" ON public.resumes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own resumes insert" ON public.resumes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own resumes update" ON public.resumes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own resumes delete" ON public.resumes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER resumes_updated_at BEFORE UPDATE ON public.resumes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX resumes_user_idx ON public.resumes(user_id, created_at DESC);

-- Template preferred resume (Phase A: enables auto-preselect on Send)
ALTER TABLE public.templates ADD COLUMN preferred_resume_id uuid REFERENCES public.resumes(id) ON DELETE SET NULL;

-- Attachments metadata on email_history (jsonb array of {name, size, source: 'resume'|'upload'})
ALTER TABLE public.email_history ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.email_history ADD COLUMN recipient_count integer NOT NULL DEFAULT 0;

-- Storage policies for the private 'resumes' bucket: only owner can read/write their files.
-- Convention: files stored at <user_id>/<resume_id>/<filename>
CREATE POLICY "resumes bucket own select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "resumes bucket own insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "resumes bucket own update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "resumes bucket own delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);
