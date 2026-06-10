import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwner()
  if (isErrorResponse(auth)) return auth

  const { id } = await params
  const { actorId, serviceClient } = auth

  const body = await req.json() as { version_id: string }
  if (!body.version_id) {
    return NextResponse.json({ error: 'version_id is required' }, { status: 400 })
  }

  // Load the target version row — must belong to this config
  const { data: targetVersion, error: versionError } = await serviceClient
    .from('agent_config_versions')
    .select('*')
    .eq('id', body.version_id)
    .eq('agent_config_id', id)
    .single()

  if (versionError || !targetVersion) {
    return NextResponse.json({ error: 'Version not found for this config' }, { status: 404 })
  }

  // Load current config
  const { data: currentConfig, error: configError } = await serviceClient
    .from('agent_configs')
    .select('id, version, system_prompt, model, tool_ids')
    .eq('id', id)
    .single()

  if (configError || !currentConfig) {
    return NextResponse.json({ error: 'Agent config not found' }, { status: 404 })
  }

  const now = new Date().toISOString()

  // Write current state to versions before overwriting
  const { error: archiveError } = await serviceClient
    .from('agent_config_versions')
    .insert({
      id: crypto.randomUUID(),
      agent_config_id: id,
      version: currentConfig.version,
      system_prompt: currentConfig.system_prompt,
      model: currentConfig.model,
      tool_ids: currentConfig.tool_ids,
      changed_by: actorId,
      change_reason: 'rollback',
      improvement_suggestion_id: null,
      created_at: now,
    })

  if (archiveError) {
    return NextResponse.json({ error: `Failed to archive current version: ${archiveError.message}` }, { status: 500 })
  }

  const newVersion = currentConfig.version + 1

  // Restore the target version
  const { error: restoreError } = await serviceClient
    .from('agent_configs')
    .update({
      system_prompt: targetVersion.system_prompt,
      model: targetVersion.model,
      tool_ids: targetVersion.tool_ids,
      version: newVersion,
      updated_at: now,
    })
    .eq('id', id)

  if (restoreError) {
    return NextResponse.json({ error: restoreError.message }, { status: 500 })
  }

  await serviceClient.from('audit_log').insert({
    id: crypto.randomUUID(),
    action_type: 'config_change',
    actor_id: actorId,
    actor_type: 'user',
    target_type: 'agent_config',
    target_id: id,
    metadata: {
      action: 'rollback',
      restored_version_id: body.version_id,
      restored_from_version: targetVersion.version,
      new_version: newVersion,
    },
  })

  return NextResponse.json({ ok: true, restoredVersion: newVersion })
}
