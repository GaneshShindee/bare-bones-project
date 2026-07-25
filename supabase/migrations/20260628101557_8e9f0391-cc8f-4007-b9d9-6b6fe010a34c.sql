CREATE TABLE public.instruction_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  email_pattern TEXT NOT NULL DEFAULT 'first.last',
  custom_pattern TEXT NOT NULL DEFAULT '{first}.{last}',
  company_domain TEXT NOT NULL DEFAULT '',
  batch_size INTEGER NOT NULL DEFAULT 100,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  prefixes JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  surname_min_length INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instruction_templates TO authenticated;
GRANT ALL ON public.instruction_templates TO service_role;
ALTER TABLE public.instruction_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own instruction templates" ON public.instruction_templates FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER instruction_templates_touch BEFORE UPDATE ON public.instruction_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();