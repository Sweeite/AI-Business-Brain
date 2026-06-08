import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClient } from '@brain/core'
import { ProactiveBuilderClient } from '@/components/proactive/proactive-builder-client'

export default async function ProactivePage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const serviceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )

  const { data: publicUser } = await serviceClient
    .from('users')
    .select('id, role_id, roles(name)')
    .eq('id', authUser.id)
    .single()

  const rolesField = publicUser?.roles as { name: string } | { name: string }[] | null | undefined
  const roleName = (Array.isArray(rolesField) ? rolesField[0] : rolesField)?.name ?? 'Member'
  const isAdmin = roleName === 'Owner' || roleName === 'Admin'

  const [routinesRes, agentConfigsRes] = await Promise.all([
    serviceClient
      .from('routines')
      .select('*, agent_configs(id, name, model)')
      .order('created_at', { ascending: false }),
    serviceClient
      .from('agent_configs')
      .select('id, name, model, description')
      .eq('is_active', true)
      .order('name', { ascending: true }),
  ])

  return (
    <ProactiveBuilderClient
      initialRoutines={(routinesRes.data ?? []) as Parameters<typeof ProactiveBuilderClient>[0]['initialRoutines']}
      agentConfigs={(agentConfigsRes.data ?? []) as Parameters<typeof ProactiveBuilderClient>[0]['agentConfigs']}
      isAdmin={isAdmin}
    />
  )
}
