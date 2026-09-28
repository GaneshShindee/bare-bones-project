-- Lets a user save keys for multiple AI providers (Gemini, Grok) and pick which
-- one is active. Leaving it on 'lovable' (the default) or leaving a provider
-- unselected keeps AI features on the shared Lovable gateway.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS grok_api_key TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_ai_provider TEXT NOT NULL DEFAULT 'lovable' CHECK (active_ai_provider IN ('lovable', 'gemini', 'grok'));
