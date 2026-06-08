import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClient } from '@brain/core'
import { Nav } from '@/components/nav'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const serviceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )

  const { data: publicUser } = await serviceClient
    .from('users')
    .select('role_id, roles(name)')
    .eq('id', user.id)
    .single()

  const rolesField = publicUser?.roles as { name: string } | { name: string }[] | null | undefined
  const roleName = (Array.isArray(rolesField) ? rolesField[0] : rolesField)?.name ?? 'Member'

  const headersList = await headers()
  const pathname = headersList.get('x-pathname') ?? '/'

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      <Nav roleName={roleName} currentPath={pathname} userEmail={user.email ?? ''} />
      <main style={{ flex: 1, padding: '32px', backgroundColor: '#fafafa', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
