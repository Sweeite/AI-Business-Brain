import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClient } from '@brain/core'
import { HealthClient } from '@/components/health/health-client'

const OWNER_ROLES = new Set(['Owner', 'Admin'])

export default async function HealthPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const serviceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )

  const { data: publicUser } = await serviceClient
    .from('users')
    .select('role_id, roles(name)')
    .eq('id', authUser.id)
    .single()

  const rolesField = publicUser?.roles as { name: string } | { name: string }[] | null | undefined
  const roleName = (Array.isArray(rolesField) ? rolesField[0] : rolesField)?.name ?? 'Member'

  if (!OWNER_ROLES.has(roleName)) redirect('/')

  return <HealthClient />
}
