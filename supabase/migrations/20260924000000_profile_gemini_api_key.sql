-- Lets a user connect their own Gemini API key so AI features run against
-- their own quota instead of the shared Lovable AI gateway.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;
