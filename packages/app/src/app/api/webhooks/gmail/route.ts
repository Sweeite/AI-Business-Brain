import { createRemoteJWKSet, jwtVerify } from 'jose'
import { createSupabaseClient } from '@brain/core'

// Cache the JWKS fetcher — avoids a round-trip on every webhook call.
// createRemoteJWKSet already caches keys internally with its own TTL.
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL))

async function verifyPubSubJwt(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, googleJwks, {
      issuer: 'accounts.google.com',
      audience: `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/gmail`,
    })
    return true
  } catch {
    return false
  }
}

export async function POST(req: Request): Promise<Response> {
  // 1. Verify Pub/Sub JWT
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(null, { status: 401 })
  }

  const token = authHeader.slice(7)
  const valid = await verifyPubSubJwt(token)
  if (!valid) {
    return new Response(null, { status: 401 })
  }

  // 2. Decode base64 message body
  let emailAddress: string
  let historyId: string

  try {
    const body = await req.json() as {
      message?: { data?: string }
    }
    const raw = Buffer.from(body.message?.data ?? '', 'base64').toString('utf-8')
    const parsed = JSON.parse(raw) as { emailAddress: string; historyId: string }
    emailAddress = parsed.emailAddress
    historyId = parsed.historyId
  } catch {
    // Malformed message — ack to prevent Google retrying a bad payload
    return new Response(null, { status: 200 })
  }

  const serviceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )

  // 3. Look up userId from emailAddress (read only, not a write)
  const { data: dbUser } = await serviceClient
    .from('users')
    .select('id')
    .eq('email', emailAddress)
    .maybeSingle()

  if (!dbUser) {
    // Unknown email — ack and drop
    return new Response(null, { status: 200 })
  }

  // 4. Enqueue gmail.sync job
  await serviceClient.rpc('enqueue_job', {
    p_name: 'gmail.sync',
    p_data: { userId: dbUser.id, historyId },
  })

  return new Response(null, { status: 200 })
}
