-- Track the target job role per recipient, alongside the existing company field,
-- so campaign lists can show "{role} · {company}" instead of the raw subject line.
ALTER TABLE public.email_recipients ADD COLUMN IF NOT EXISTS role text;
