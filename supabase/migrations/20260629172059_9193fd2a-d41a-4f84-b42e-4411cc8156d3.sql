
-- Phase 1: Multi-Gmail accounts + sender tracking on history

-- 1) Restructure gmail_connections to support multiple accounts per user
ALTER TABLE public.gmail_connections DROP CONSTRAINT gmail_connections_pkey;
ALTER TABLE public.gmail_connections ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.gmail_connections ADD COLUMN label text;
ALTER TABLE public.gmail_connections ADD COLUMN is_default boolean NOT NULL DEFAULT true;
ALTER TABLE public.gmail_connections ADD COLUMN avatar_url text;
ALTER TABLE public.gmail_connections ADD COLUMN full_name text;
ALTER TABLE public.gmail_connections ADD CONSTRAINT gmail_connections_pkey PRIMARY KEY (id);
ALTER TABLE public.gmail_connections ADD CONSTRAINT gmail_connections_user_email_unique UNIQUE (user_id, gmail_email);

-- Exactly one default per user
CREATE UNIQUE INDEX gmail_connections_one_default_per_user
  ON public.gmail_connections (user_id) WHERE is_default;

CREATE INDEX gmail_connections_user_idx ON public.gmail_connections (user_id);

-- 2) Track which Gmail account sent each historical email
ALTER TABLE public.email_history ADD COLUMN gmail_account_id uuid REFERENCES public.gmail_connections(id) ON DELETE SET NULL;
ALTER TABLE public.email_history ADD COLUMN sender_email text;

-- Backfill sender_email from existing single-account setup
UPDATE public.email_history h
SET sender_email = g.gmail_email, gmail_account_id = g.id
FROM public.gmail_connections g
WHERE h.user_id = g.user_id AND h.sender_email IS NULL;
