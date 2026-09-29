-- Lets a user pause use of their saved Gemini API key (fall back to the shared
-- gateway) without deleting the key itself.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gemini_api_key_enabled boolean NOT NULL DEFAULT true;
