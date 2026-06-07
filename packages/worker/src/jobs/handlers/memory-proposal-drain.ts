import type PgBoss from 'pg-boss'
import type { SupabaseClient } from '@brain/core'
import { writeMemory } from '@brain/core'
import type { MemoryProposal, SensitivityLevel } from '@brain/core'
import { JOB_TYPES } from '../constants.js'
import { createJobRun, completeJobRun, failJobRun } from '../lifecycle.js'

const SENSITIVITY_RANK: Record<string, number> = {
  public: 1,
  internal: 2,
  management: 3,
  leadership: 4,
}

function sensitivityToLevel(s: string): number {
  return SENSITIVITY_RANK[s] ?? 2
}

async function getSystemConfigNumber(supabase: SupabaseClient, key: string): Promise<number> {
  const { data } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', key)
    .single()
  return typeof data?.value === 'number' ? data.value : 0.7
}

interface UserRole {
  roleName: string
  clearanceLevel: string
}

async function getUserRole(supabase: SupabaseClient, userId: string): Promise<UserRole | null> {
  const { data: user } = await supabase
    .from('users')
    .select('role_id')
    .eq('id', userId)
    .single()
  if (!user?.role_id) return null

  const { data: role } = await supabase
    .from('roles')
    .select('name, clearance_level')
    .eq('id', user.role_id)
    .single()
  if (!role) return null

  return { roleName: role.name, clearanceLevel: role.clearance_level }
}

// Parse sources JSONB to extract memory IDs for sensitivity lookup.
// Accepts arrays like [{ type: 'memory', id: '...' }] or objects with memory_id keys.
function extractMemoryIds(sources: Record<string, unknown>): string[] {
  const ids: string[] = []
  if (Array.isArray(sources)) {
    for (const src of sources as unknown[]) {
      if (
        src &&
        typeof src === 'object' &&
        (src as Record<string, unknown>)['type'] === 'memory' &&
        typeof (src as Record<string, unknown>)['id'] === 'string'
      ) {
        ids.push((src as Record<string, unknown>)['id'] as string)
      }
    }
  } else {
    const memId = sources['memory_id']
    if (typeof memId === 'string') ids.push(memId)
  }
  return ids
}

async function resolveHighestSensitivity(
  supabase: SupabaseClient,
  sources: Record<string, unknown>,
): Promise<SensitivityLevel> {
  const memoryIds = extractMemoryIds(sources)
  if (memoryIds.length === 0) return 'internal'

  const { data } = await supabase
    .from('memories')
    .select('sensitivity_level')
    .in('id', memoryIds)
    .eq('status', 'active')

  if (!data || data.length === 0) return 'internal'

  let highest = 0
  let highestLevel: SensitivityLevel = 'internal'
  for (const row of data) {
    const rank = sensitivityToLevel(row.sensitivity_level)
    if (rank > highest) {
      highest = rank
      highestLevel = row.sensitivity_level as SensitivityLevel
    }
  }
  return highestLevel
}

function deriveNamespace(entityRefs: Record<string, unknown>): string {
  if (typeof entityRefs['client_id'] === 'string') return `client:${entityRefs['client_id']}`
  if (typeof entityRefs['project_id'] === 'string') return `project:${entityRefs['project_id']}`
  return 'org'
}

function deriveZone(entityRefs: Record<string, unknown>): string | undefined {
  if (typeof entityRefs['client_id'] === 'string') return `client-${entityRefs['client_id']}`
  if (typeof entityRefs['project_id'] === 'string') return `project-${entityRefs['project_id']}`
  return undefined
}

async function routeToReview(supabase: SupabaseClient, proposalId: string): Promise<void> {
  await supabase
    .from('memory_proposals')
    .update({ status: 'pending_review' })
    .eq('id', proposalId)
}

async function markApproved(supabase: SupabaseClient, proposalId: string): Promise<void> {
  await supabase
    .from('memory_proposals')
    .update({ status: 'approved' })
    .eq('id', proposalId)
}

type ProcessResult = 'committed' | 'dedup_skip' | 'review_queued' | 'error'

async function processProposal(
  supabase: SupabaseClient,
  proposal: MemoryProposal,
  minConfidence: number,
): Promise<ProcessResult> {
  // ── Step 1: Member check (always routes to review) ─────────────────────────
  const userRole = await getUserRole(supabase, proposal.acting_user_id)
  if (userRole?.roleName === 'Member') {
    await routeToReview(supabase, proposal.id)
    return 'review_queued'
  }

  // ── Step 1 (continued): Sensitivity check ──────────────────────────────────
  const resolvedSensitivity = await resolveHighestSensitivity(supabase, proposal.sources)
  const userClearance = userRole?.clearanceLevel ?? 'internal'
  if (sensitivityToLevel(resolvedSensitivity) > sensitivityToLevel(userClearance)) {
    await routeToReview(supabase, proposal.id)
    return 'review_queued'
  }

  // ── Step 2: Confidence threshold ───────────────────────────────────────────
  if (proposal.confidence < minConfidence) {
    await routeToReview(supabase, proposal.id)
    return 'review_queued'
  }

  // ── Step 3: Gate 4 — structured action check (Phase 1 stub) ───────────────
  // When structured connectors exist (issues #8+), query connector_schemas here:
  //   const hasStructuredAction = await checkGate4(supabase, proposal.entity_refs)
  //   if (hasStructuredAction) → dual-write: SoR write + episodic memory of origin
  const hasStructuredAction = false

  if (hasStructuredAction) {
    // Dual-write path — not reachable in Phase 1.
    await routeToReview(supabase, proposal.id)
    return 'review_queued'
  }

  // ── Step 4: Commit ─────────────────────────────────────────────────────────
  const entityRefs = proposal.entity_refs as Record<string, unknown>
  const namespace = deriveNamespace(entityRefs)
  const zone = deriveZone(entityRefs)

  const { skipped } = await writeMemory({
    type: proposal.suggested_type,
    content: proposal.claim,
    sourceRefs: proposal.sources,
    authorType: 'agent',
    authorId: proposal.acting_user_id,
    agentTaskId: proposal.task_id,
    sensitivityLevel: resolvedSensitivity,
    namespace,
    zone,
    serviceClient: supabase,
  })

  await markApproved(supabase, proposal.id)
  return skipped ? 'dedup_skip' : 'committed'
}

export function createMemoryProposalDrainHandler(supabase: SupabaseClient) {
  return async (_job: PgBoss.JobWithMetadata): Promise<void> => {
    const runId = await createJobRun(supabase, JOB_TYPES.MEMORY_PROPOSAL_DRAIN, 'system')
    try {
      const minConfidence = await getSystemConfigNumber(supabase, 'memory_proposal_min_confidence')

      const { data: proposals, error } = await supabase
        .from('memory_proposals')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

      if (error) throw new Error(`Failed to fetch proposals: ${error.message}`)
      if (!proposals || proposals.length === 0) {
        await completeJobRun(supabase, runId, { processed: 0, committed: 0, dedup_skipped: 0, review_queued: 0, errors: 0 })
        return
      }

      let committed = 0, dedupSkipped = 0, reviewQueued = 0, errors = 0

      for (const proposal of proposals) {
        try {
          const result = await processProposal(supabase, proposal as MemoryProposal, minConfidence)
          if (result === 'committed') committed++
          else if (result === 'dedup_skip') { committed++; dedupSkipped++ }
          else if (result === 'review_queued') reviewQueued++
        } catch (err) {
          errors++
          console.error(`[memory-proposal-drain] error on proposal ${proposal.id}:`, err)
        }
      }

      await completeJobRun(supabase, runId, {
        processed: proposals.length,
        committed,
        dedup_skipped: dedupSkipped,
        review_queued: reviewQueued,
        errors,
      })
    } catch (err) {
      await failJobRun(supabase, runId, err as Error)
      throw err
    }
  }
}
