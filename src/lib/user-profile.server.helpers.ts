import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The generated Supabase types can lag behind the profile/draft migrations.
 * `untyped` gives an untyped view of the *same* authenticated client, so RLS
 * and the `user_id` scoping in every query still apply.
 */
export function untyped(client: unknown): SupabaseClient {
  return client as SupabaseClient;
}
