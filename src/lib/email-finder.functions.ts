import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  EMAIL_FINDER_PROVIDERS,
  configuredProviderIds,
  searchEmailProviders,
  type EmailFinderProviderId,
} from "@/lib/email-finder";

const providerIdSchema = z.enum([
  "hunter",
  "apollo",
  "prospeo",
  "snov",
  "datagma",
  "persana",
  "lusha",
  "kaspr",
  "surfe",
  "cleanlist",
  "getprospect",
  "clearout",
  "skrapp",
  "findymail",
  "experte",
]);

/** Which enrichment APIs have keys configured on the server. */
export const listEmailFinderStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const configured = new Set(configuredProviderIds());
    return EMAIL_FINDER_PROVIDERS.map((p) => ({
      id: p.id,
      name: p.name,
      freeNote: p.freeNote,
      hasApi: p.hasApi,
      configured: p.hasApi ? configured.has(p.id) : false,
      envKeys: p.envKeys,
    }));
  });

/**
 * Domain → sample emails via Hunter / Apollo / Prospeo / Snov / etc.
 * Providers without API keys are skipped (web links still returned).
 */
export const findEmailsByDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyOrDomain: z.string().min(1).max(200),
        providers: z.array(providerIdSchema).max(12).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const result = await searchEmailProviders(
      data.companyOrDomain,
      data.providers as EmailFinderProviderId[] | undefined,
    );
    return result;
  });
