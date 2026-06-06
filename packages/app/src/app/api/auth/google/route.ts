import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      scopes: 'email profile',
    },
  })

  if (error || !data.url) {
    return NextResponse.redirect(
      new URL('/login?error=oauth_failed', process.env.NEXT_PUBLIC_SITE_URL!),
    )
  }

  return NextResponse.redirect(data.url)
}
