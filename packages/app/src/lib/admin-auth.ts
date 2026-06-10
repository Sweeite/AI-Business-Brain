import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClient } from '@brain/core'

export type AdminContext = {
  actorId: string
  serviceClient: ReturnType<typeof createSupabaseClient>
}

/**
 * Verifies the caller is an authenticated Owner/Admin.
 * Returns { actorId, serviceClient } on success, or a NextResponse (403/401) on failure.
 */
export async function requireOwner(): Promise<AdminContext | NextResponse> {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )

  const { data: publicUser } = await serviceClient
    .from('users')
    .select('id, role_id, roles(name)')
    .eq('id', authUser.id)
    .maybeSingle()

  const roleName = (publicUser?.roles as { name: string } | null)?.name ?? ''
  if (roleName !== 'Owner' && roleName !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return { actorId: authUser.id, serviceClient }
}

export function isErrorResponse(val: AdminContext | NextResponse): val is NextResponse {
  return val instanceof NextResponse
}

const MANAGER_ROLES = new Set(['Manager', 'Operator', 'Owner', 'Admin'])

export async function requireManager(): Promise<AdminContext | NextResponse> {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )

  const { data: publicUser } = await serviceClient
    .from('users')
    .select('id, role_id, roles(name)')
    .eq('id', authUser.id)
    .maybeSingle()

  const roleName = (publicUser?.roles as { name: string } | null)?.name ?? ''
  if (!MANAGER_ROLES.has(roleName)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return { actorId: authUser.id, serviceClient }
}
