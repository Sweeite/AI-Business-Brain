import type { SupabaseClient } from '../supabase/client.js'

export async function getCredential(client: SupabaseClient, connectionId: string): Promise<string> {
  const { data, error } = await client.rpc('get_decrypted_credential', { p_connection_id: connectionId })
  if (error) throw error
  return data as string
}

export async function storeCredential(client: SupabaseClient, connectionId: string, token: string): Promise<void> {
  const { error } = await client.rpc('store_credential', { p_connection_id: connectionId, p_token: token })
  if (error) throw error
}

export async function refreshCredential(client: SupabaseClient, connectionId: string, newToken: string): Promise<void> {
  const { error } = await client.rpc('refresh_credential', { p_connection_id: connectionId, p_new_token: newToken })
  if (error) throw error
}
