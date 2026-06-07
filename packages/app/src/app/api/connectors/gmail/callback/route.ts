import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClient } from '@brain/core'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const userId = searchParams.get('state')

  if (!code || !userId) {
    return NextResponse.redirect(
      new URL('/onboarding?error=gmail_oauth_failed', process.env.NEXT_PUBLIC_SITE_URL!),
    )
  }

  // Verify the requesting user matches the state param
  const sessionClient = await createClient()
  const { data: { user } } = await sessionClient.auth.getUser()
  if (!user || user.id !== userId) {
    return NextResponse.redirect(
      new URL('/login', process.env.NEXT_PUBLIC_SITE_URL!),
    )
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GMAIL_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    console.error('[gmail-callback] token exchange failed:', await tokenRes.text())
    return NextResponse.redirect(
      new URL('/onboarding?error=gmail_token_failed', process.env.NEXT_PUBLIC_SITE_URL!),
    )
  }

  const tokenData = await tokenRes.json() as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  if (!tokenData.refresh_token) {
    // refresh_token only returned on first authorization with prompt=consent
    return NextResponse.redirect(
      new URL('/onboarding?error=gmail_no_refresh_token', process.env.NEXT_PUBLIC_SITE_URL!),
    )
  }

  const expiresAt = Date.now() + (tokenData.expires_in - 300) * 1000
  const tokenJson = JSON.stringify({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: expiresAt,
  })

  // All writes go through service role
  const serviceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )

  // Create connection row with placeholder credential_ref
  const { data: conn, error: connErr } = await serviceClient
    .from('connections')
    .insert({
      connector_type: 'gmail',
      scope: 'per-user',
      owner_user_id: userId,
      credential_ref: 'pending',
      status: 'active',
      granted_scopes: ['gmail.readonly'],
      created_by: userId,
    })
    .select('id')
    .single()

  if (connErr || !conn) {
    console.error('[gmail-callback] connection insert failed:', connErr)
    return NextResponse.redirect(
      new URL('/onboarding?error=gmail_connect_failed', process.env.NEXT_PUBLIC_SITE_URL!),
    )
  }

  // Store token in Vault (updates credential_ref atomically)
  const { error: vaultErr } = await serviceClient.rpc('store_credential', {
    p_connection_id: conn.id,
    p_token: tokenJson,
  })

  if (vaultErr) {
    console.error('[gmail-callback] vault store failed:', vaultErr)
    // Clean up the connection row
    await serviceClient.from('connections').delete().eq('id', conn.id)
    return NextResponse.redirect(
      new URL('/onboarding?error=gmail_vault_failed', process.env.NEXT_PUBLIC_SITE_URL!),
    )
  }

  // Register Gmail push notifications (get initial historyId)
  let initialHistoryId: string | null = null
  if (process.env.GOOGLE_PUBSUB_TOPIC) {
    try {
      const watchRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/watch',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            topicName: process.env.GOOGLE_PUBSUB_TOPIC,
            labelIds: ['INBOX'],
          }),
        },
      )
      if (watchRes.ok) {
        const watchData = await watchRes.json() as { historyId?: string }
        initialHistoryId = watchData.historyId ?? null
      } else {
        console.warn('[gmail-callback] watch registration failed:', await watchRes.text())
      }
    } catch (err) {
      console.warn('[gmail-callback] watch registration error:', err)
    }
  }

  // Store cursor and enqueue initial sync
  await serviceClient
    .from('connections')
    .update({
      sync_cursor: initialHistoryId ? { historyId: initialHistoryId } : {},
      last_synced_at: null,
    })
    .eq('id', conn.id)

  await serviceClient.rpc('enqueue_job', {
    p_name: 'gmail.sync',
    p_data: { userId, historyId: null },
  })

  return NextResponse.redirect(
    new URL('/onboarding?connected=gmail', process.env.NEXT_PUBLIC_SITE_URL!),
  )
}
