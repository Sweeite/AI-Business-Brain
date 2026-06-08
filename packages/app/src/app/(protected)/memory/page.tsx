import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClient } from '@brain/core'
import { MemoryInspectorClient } from '@/components/memory-inspector/memory-inspector-client'

export default async function MemoryPage() {
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
  const isAdmin = roleName === 'Owner' || roleName === 'Admin'

  return <MemoryInspectorClient isAdmin={isAdmin} />
}
