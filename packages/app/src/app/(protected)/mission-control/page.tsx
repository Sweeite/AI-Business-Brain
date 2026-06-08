import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClient } from '@brain/core'
import { MissionControlClient } from '@/components/mission-control/mission-control-client'

export default async function MissionControlPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const serviceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )

  const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001'

  const [usersRes, rolesRes, configsRes, jobRunsRes] = await Promise.all([
    serviceClient
      .from('users')
      .select('id, email, full_name, role_id, is_active, created_at, last_seen_at, roles(id, name, clearance_level)')
      .neq('id', SYSTEM_USER_ID)
      .order('created_at', { ascending: false }),
    serviceClient
      .from('roles')
      .select('*')
      .order('clearance_level', { ascending: false }),
    serviceClient
      .from('system_config')
      .select('id, key, value, updated_by, updated_at')
      .order('key', { ascending: true }),
    // Last run per system job type
    serviceClient
      .from('job_runs')
      .select('id, job_type, status, started_at, completed_at, error')
      .in('job_type', ['memory.proposal.drain', 'connector.sync', 'token.refresh', 'drive.webhook.renew'])
      .order('started_at', { ascending: false })
      .limit(40),
  ])

  // Deduplicate to last run per job_type
  type RunRow = { id: string; job_type: string; status: string; started_at: string; completed_at: string | null; error: string | null }
  const lastRunByType: Record<string, RunRow> = {}
  for (const run of (jobRunsRes.data ?? []) as RunRow[]) {
    if (!lastRunByType[run.job_type]) lastRunByType[run.job_type] = run
  }

  return (
    <MissionControlClient
      initialUsers={(usersRes.data ?? []) as Parameters<typeof MissionControlClient>[0]['initialUsers']}
      initialRoles={(rolesRes.data ?? []) as Parameters<typeof MissionControlClient>[0]['initialRoles']}
      initialConfigs={configsRes.data ?? []}
      lastRunByType={lastRunByType}
    />
  )
}
