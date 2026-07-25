
-- ============ TEMPLATES: marketplace + defaults ============
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS saves_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS uses_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_sender_id uuid REFERENCES public.gmail_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS follow_up_template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS templates_public_idx ON public.templates (is_public, published_at DESC) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS templates_user_idx ON public.templates (user_id, updated_at DESC);

-- Enforce a single default template per user
CREATE OR REPLACE FUNCTION public.enforce_single_default_template()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.templates SET is_default = false
      WHERE user_id = NEW.user_id AND id <> NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_single_default_template ON public.templates;
CREATE TRIGGER trg_single_default_template
  AFTER INSERT OR UPDATE OF is_default ON public.templates
  FOR EACH ROW WHEN (NEW.is_default = true)
  EXECUTE FUNCTION public.enforce_single_default_template();

-- Marketplace read policy for public templates (anyone authenticated can read public ones)
DROP POLICY IF EXISTS "Public templates readable" ON public.templates;
CREATE POLICY "Public templates readable" ON public.templates
  FOR SELECT TO authenticated
  USING (is_public = true OR auth.uid() = user_id);

-- ============ PROFILES: prefs & defaults ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS follow_up_template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS compose_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ============ GMAIL CONNECTIONS: editable display name ============
ALTER TABLE public.gmail_connections
  ADD COLUMN IF NOT EXISTS display_name text;

-- Backfill display_name from full_name where empty
UPDATE public.gmail_connections
  SET display_name = COALESCE(NULLIF(display_name, ''), NULLIF(full_name, ''), NULLIF(label, ''))
  WHERE display_name IS NULL;

-- ============ TEMPLATE SAVES ============
CREATE TABLE IF NOT EXISTS public.template_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, template_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_saves TO authenticated;
GRANT ALL ON public.template_saves TO service_role;
ALTER TABLE public.template_saves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own saves" ON public.template_saves;
CREATE POLICY "Users manage own saves" ON public.template_saves
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.sync_template_saves_count()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.templates SET saves_count = saves_count + 1 WHERE id = NEW.template_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.templates SET saves_count = GREATEST(saves_count - 1, 0) WHERE id = OLD.template_id;
  END IF;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_template_saves_count ON public.template_saves;
CREATE TRIGGER trg_template_saves_count
  AFTER INSERT OR DELETE ON public.template_saves
  FOR EACH ROW EXECUTE FUNCTION public.sync_template_saves_count();

-- ============ EMAIL RECIPIENTS (per-recipient tracking) ============
CREATE TABLE IF NOT EXISTS public.email_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_history_id uuid NOT NULL REFERENCES public.email_history(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  company text,
  status text NOT NULL DEFAULT 'sent',
  tracking_token text UNIQUE,
  open_count integer NOT NULL DEFAULT 0,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  click_count integer NOT NULL DEFAULT 0,
  last_clicked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_recipients_history_idx ON public.email_recipients (email_history_id);
CREATE INDEX IF NOT EXISTS email_recipients_user_idx ON public.email_recipients (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_recipients_email_idx ON public.email_recipients (user_id, email);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_recipients TO authenticated;
GRANT ALL ON public.email_recipients TO service_role;
ALTER TABLE public.email_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own recipients" ON public.email_recipients;
CREATE POLICY "Users view own recipients" ON public.email_recipients
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own recipients" ON public.email_recipients;
CREATE POLICY "Users insert own recipients" ON public.email_recipients
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own recipients" ON public.email_recipients;
CREATE POLICY "Users update own recipients" ON public.email_recipients
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users delete own recipients" ON public.email_recipients;
CREATE POLICY "Users delete own recipients" ON public.email_recipients
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
