import { createClient, type SupabaseClientOptions, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../db/database.types.js'

export function createSupabaseClient(
  url: string,
  key: string,
  options?: Pick<SupabaseClientOptions<'public'>, 'realtime'>,
): SupabaseClient<Database> {
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    ...options,
  })
}

export type { SupabaseClient }
