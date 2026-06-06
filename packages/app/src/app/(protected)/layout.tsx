import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch role name for nav rendering
  const { data: publicUser } = await supabase
    .from('users')
    .select('role_id, roles(name)')
    .eq('id', user.id)
    .single()

  const roleName =
    (publicUser?.roles as { name: string } | null)?.name ?? 'Member'

  const headersList = await headers()
  const pathname = headersList.get('x-pathname') ?? '/'

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <Nav roleName={roleName} currentPath={pathname} userEmail={user.email ?? ''} />
      <main style={{ flex: 1, padding: '32px', backgroundColor: '#fafafa' }}>
        {children}
      </main>
    </div>
  )
}
