import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClient } from '@brain/core'

interface DriveWatchResponse {
  id: string
  resourceId: string
  expiration?: string
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const userId = searchParams.get('state')

  if (!code || !userId) {
    return NextResponse.redirect(
      new URL('/onboarding?error=drive_oauth_failed', process.env.NEXT_PUBLIC_SITE_URL!),
    )
  }

  // Verify requesting user matches state param
  const sessionClient = await createClient()
  const { data: { user } } = await sessionClient.auth.getUser()
  if (!user || user.id !== userId) {
    return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL!))
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.DRIVE_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    console.error('[drive-callback] token exchange failed:', await tokenRes.text())
    return NextResponse.redirect(
      new URL('/onboarding?error=drive_token_failed', process.env.NEXT_PUBLIC_SITE_URL!),
    )
  }

  const tokenData = await tokenRes.json() as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  if (!tokenData.refresh_token) {
    return NextResponse.redirect(
      new URL('/onboarding?error=drive_no_refresh_token', process.env.NEXT_PUBLIC_SITE_URL!),
    )
  }

  const expiresAt = Date.now() + (tokenData.expires_in - 300) * 1000
  const tokenJson = JSON.stringify({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: expiresAt,
  })

  const serviceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )

  // Create connection row
  const { data: conn, error: connErr } = await serviceClient
    .from('connections')
    .insert({
      connector_type: 'google_drive',
      scope: 'per-user',
      owner_user_id: userId,
      credential_ref: 'pending',
      status: 'active',
      granted_scopes: ['drive.readonly'],
      created_by: userId,
    })
    .select('id')
    .single()

  if (connErr || !conn) {
    console.error('[drive-callback] connection insert failed:', connErr)
    return NextResponse.redirect(
      new URL('/onboarding?error=drive_connect_failed', process.env.NEXT_PUBLIC_SITE_URL!),
    )
  }

  // Store token in Vault
  const { error: vaultErr } = await serviceClient.rpc('store_credential', {
    p_connection_id: conn.id,
    p_token: tokenJson,
  })

  if (vaultErr) {
    console.error('[drive-callback] vault store failed:', vaultErr)
    await serviceClient.from('connections').delete().eq('id', conn.id)
    return NextResponse.redirect(
      new URL('/onboarding?error=drive_vault_failed', process.env.NEXT_PUBLIC_SITE_URL!),
    )
  }

  // Read channel token from system_config
  const { data: configRow } = await serviceClient
    .from('system_config')
    .select('value')
    .eq('key', 'drive_webhook_channel_token')
    .maybeSingle()

  const channelToken = (configRow?.value as string | undefined) ?? ''

  // Get the start page token for the Changes API
  let startPageToken: string | null = null
  try {
    const sptRes = await fetch(
      'https://www.googleapis.com/drive/v3/changes/startPageToken',
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
    )
    if (sptRes.ok) {
      const sptData = await sptRes.json() as { startPageToken?: string }
      startPageToken = sptData.startPageToken ?? null
    }
  } catch (err) {
    console.warn('[drive-callback] startPageToken fetch failed:', err)
  }

  // Register Drive Changes watch
  let watchData: DriveWatchResponse | null = null
  if (channelToken && channelToken !== 'REPLACE_WITH_SECRET') {
    try {
      const watchRes = await fetch(
        'https://www.googleapis.com/drive/v3/changes/watch',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: conn.id,
            type: 'web_hook',
            address: `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/drive`,
            token: channelToken,
            expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
          }),
        },
      )
      if (watchRes.ok) {
        watchData = await watchRes.json() as DriveWatchResponse
      } else {
        console.warn('[drive-callback] watch registration failed:', await watchRes.text())
      }
    } catch (err) {
      console.warn('[drive-callback] watch registration error:', err)
    }
  }

  // Store sync cursor and webhook expiry
  const syncCursor = {
    pageToken: startPageToken,
    channelId: watchData?.id ?? conn.id,
    resourceId: watchData?.resourceId ?? null,
  }

  const webhookExpiresAt = watchData?.expiration
    ? new Date(parseInt(watchData.expiration)).toISOString()
    : null

  await serviceClient
    .from('connections')
    .update({
      sync_cursor: syncCursor,
      webhook_expires_at: webhookExpiresAt,
      last_synced_at: null,
    })
    .eq('id', conn.id)

  // Enqueue initial sync
  await serviceClient.rpc('enqueue_job', {
    p_name: 'drive.sync',
    p_data: { userId, connectionId: conn.id, pageToken: null },
  })

  return NextResponse.redirect(
    new URL('/onboarding?connected=drive', process.env.NEXT_PUBLIC_SITE_URL!),
  )
}
