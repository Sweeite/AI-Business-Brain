import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`)
  }

  // Detect first login: created_at and last_seen_at will be identical (trigger
  // just provisioned the row, last_seen_at hasn't been updated yet)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: publicUser } = await supabase
      .from('users')
      .select('created_at, last_seen_at')
      .eq('id', user.id)
      .single()

    const isFirstLogin =
      publicUser &&
      (!publicUser.last_seen_at ||
        publicUser.created_at === publicUser.last_seen_at)

    if (isFirstLogin) {
      return NextResponse.redirect(`${origin}/onboarding`)
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
