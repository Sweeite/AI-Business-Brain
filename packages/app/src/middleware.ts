import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { hasRouteAccess, createSupabaseClient } from '@brain/core'

// Routes that never require role checking (public or handled by API layer)
const isRoleCheckExempt = (pathname: string): boolean =>
  pathname.startsWith('/api/') ||
  pathname.startsWith('/onboarding') ||
  pathname.startsWith('/_next') ||
  pathname.startsWith('/favicon')

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANT: getUser() must be called to refresh the session cookie.
  // Do not remove this — it keeps the session alive between requests.
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // Role-gated route check: use service role to bypass RLS (anon client doesn't propagate auth.uid() to PostgREST in middleware).
  if (user && !isPublic && !isRoleCheckExempt(pathname)) {
    const serviceClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    )
    const { data: publicUser } = await serviceClient
      .from('users')
      .select('role_id, roles(name)')
      .eq('id', user.id)
      .maybeSingle()

    const rolesField = publicUser?.roles as { name: string } | { name: string }[] | null | undefined
    const rolesObj = Array.isArray(rolesField) ? rolesField[0] : rolesField
    const roleName = (rolesObj as { name: string } | null | undefined)?.name ?? 'Member'

    if (!hasRouteAccess(roleName, pathname)) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
  }

  supabaseResponse.headers.set('x-pathname', pathname)
  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all paths except static files and images.
     * Must use this format — Next.js 14 does not support complex regex in matcher.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
