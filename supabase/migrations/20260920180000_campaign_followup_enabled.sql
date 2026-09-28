-- Lets a campaign opt out of the 7-day follow-up tracker entirely (e.g. cold
-- outreach that doesn't warrant chasing).
ALTER TABLE public.email_history ADD COLUMN IF NOT EXISTS followup_enabled boolean NOT NULL DEFAULT true;
