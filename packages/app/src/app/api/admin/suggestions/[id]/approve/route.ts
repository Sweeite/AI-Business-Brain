import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwner()
  if (isErrorResponse(auth)) return auth

  const { id } = await params
  const { actorId, serviceClient } = auth

  // Load suggestion
  const { data: suggestion, error: fetchError } = await serviceClient
    .from('improvement_suggestions')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !suggestion) {
    return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 })
  }
  if (suggestion.status !== 'pending') {
    return NextResponse.json({ error: 'Suggestion is not pending' }, { status: 400 })
  }

  const proposedChange = suggestion.proposed_change as Record<string, unknown>
  const changeType = proposedChange?.type as string | undefined
  const now = new Date().toISOString()

  // Apply the proposed change
  if (changeType === 'agent_prompt_update' && suggestion.target_config_id) {
    const configId = suggestion.target_config_id

    // Load current agent config
    const { data: currentConfig, error: configError } = await serviceClient
      .from('agent_configs')
      .select('id, version, system_prompt, model, tool_ids')
      .eq('id', configId)
      .single()

    if (configError || !currentConfig) {
      return NextResponse.json({ error: 'Target agent config not found' }, { status: 404 })
    }

    // Write-before-update: copy current row to agent_config_versions
    const { error: versionError } = await serviceClient
      .from('agent_config_versions')
      .insert({
        id: crypto.randomUUID(),
        agent_config_id: configId,
        version: currentConfig.version,
        system_prompt: currentConfig.system_prompt,
        model: currentConfig.model,
        tool_ids: currentConfig.tool_ids,
        changed_by: actorId,
        change_reason: 'self_improvement_approval',
        improvement_suggestion_id: id,
        created_at: now,
      })

    if (versionError) {
      return NextResponse.json({ error: `Failed to version config: ${versionError.message}` }, { status: 500 })
    }

    // Apply the new system prompt
    const newPrompt = proposedChange.new_system_prompt as string | undefined
    if (!newPrompt) {
      return NextResponse.json({ error: 'proposed_change missing new_system_prompt' }, { status: 400 })
    }

    const { error: updateError } = await serviceClient
      .from('agent_configs')
      .update({
        system_prompt: newPrompt,
        version: currentConfig.version + 1,
        updated_at: now,
      })
      .eq('id', configId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    await serviceClient.from('audit_log').insert({
      id: crypto.randomUUID(),
      action_type: 'config_change',
      actor_id: actorId,
      actor_type: 'user',
      target_type: 'agent_config',
      target_id: configId,
      metadata: {
        improvement_suggestion_id: id,
        change_reason: 'self_improvement_approval',
        old_version: currentConfig.version,
        new_version: currentConfig.version + 1,
      },
    })
  } else if (changeType === 'system_config_update') {
    const key = proposedChange.key as string | undefined
    const rawValue = proposedChange.value

    if (!key || rawValue === undefined) {
      return NextResponse.json({ error: 'proposed_change missing key or value' }, { status: 400 })
    }

    // system_config.value is jsonb — wrap primitive in a compatible Json type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsonValue = rawValue as any

    const { error: configUpdateError } = await serviceClient
      .from('system_config')
      .update({ value: jsonValue, updated_by: actorId, updated_at: now })
      .eq('key', key)

    if (configUpdateError) {
      return NextResponse.json({ error: configUpdateError.message }, { status: 500 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta: any = { improvement_suggestion_id: id, key, new_value: String(rawValue) }
    await serviceClient.from('audit_log').insert({
      id: crypto.randomUUID(),
      action_type: 'config_change',
      actor_id: actorId,
      actor_type: 'user',
      target_type: 'system_config',
      target_id: id,
      metadata: meta,
    })
  }
  // For 'informational': no DB changes, just mark approved

  // Mark suggestion as approved
  const { error: approveError } = await serviceClient
    .from('improvement_suggestions')
    .update({ status: 'approved', reviewed_by: actorId, reviewed_at: now })
    .eq('id', id)

  if (approveError) return NextResponse.json({ error: approveError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
