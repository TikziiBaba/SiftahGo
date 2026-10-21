import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { markClientReady } from "./lazy";

let client: SupabaseClient | undefined;

export function createClient() {
  if (!client) {
    client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    if (typeof window !== "undefined") markClientReady();
  }
  return client;
}
