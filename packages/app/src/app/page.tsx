import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { QueryInterface } from '@/components/query-interface'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      <Nav roleName={roleName} currentPath={pathname} userEmail={user.email ?? ''} />
      <main style={{ flex: 1, padding: '24px 32px', backgroundColor: '#fafafa', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <QueryInterface userId={user.id} userEmail={user.email ?? ''} roleName={roleName} />
      </main>
    </div>
  )
}
