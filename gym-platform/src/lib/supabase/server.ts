import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/** Per-request client bound to the signed-in user's JWT (RLS applies). */
export async function supabaseForUser(): Promise<SupabaseClient> {
  const jar = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there.
        }
      },
    },
  });
}

/** Service-role client. ONLY for webhooks, public API, cron and validated public routes. */
export function supabaseService(): SupabaseClient {
  if (!env.supabaseServiceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  return createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false } });
}
