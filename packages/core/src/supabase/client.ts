import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../db/types.js'

export function createSupabaseClient(url: string, key: string): SupabaseClient<Database> {
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export type { SupabaseClient }
