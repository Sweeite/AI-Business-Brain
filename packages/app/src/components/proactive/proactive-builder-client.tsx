'use client'

import { useState, useEffect, useRef } from 'react'
import { RoutineWizard } from './routine-wizard'

export interface AgentConfigRow {
  id: string
  name: string
  model: string
  description: string | null
}

export interface RoutineRow {
  id: string
  name: string
  description: string | null
  is_active: boolean
  trigger_type: string
  cron_schedule: string | null
  webhook_connector: string | null
  webhook_event: string | null
  webhook_filters: unknown
  agent_config_id: string
  additional_context: string | null
  output_type: string
  output_config: unknown
  created_by: string
  scope: string
  created_at: string
  updated_at: string
  agent_configs: { id: string; name: string; model: string } | null
}

interface JobRunRow {
  id: string
  status: string
  triggered_by: string
  started_at: string
  completed_at: string | null
  tokens_used: number | null
  cost_usd: number | null
  output: unknown
  error: string | null
}

interface Props {
  initialRoutines: RoutineRow[]
  agentConfigs: AgentConfigRow[]
  isAdmin: boolean
}

const TRIGGER_COLORS: Record<string, string> = {
  cron: '#2563eb',
  webhook: '#7c3aed',
}

const OUTPUT_COLORS: Record<string, string> = {
  memory: '#16a34a',
  email: '#d97706',
  slack: '#dc2626',
  dashboard_notification: '#0891b2',
  tool_write: '#6b7280',
}

const STATUS_COLORS: Record<string, string> = {
  completed: '#16a34a',
  running: '#2563eb',
  failed: '#dc2626',
  pending: '#d97706',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function durationMs(start: string, end: string | null): string {
  if (!end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function outputSummary(output: unknown): string {
  if (!output || typeof output !== 'object') return '—'
  const o = output as Record<string, unknown>
  if (typeof o.agentOutput === 'string') return o.agentOutput.slice(0, 120) + (o.agentOutput.length > 120 ? '…' : '')
  return JSON.stringify(o).slice(0, 120) + '…'
}

export function ProactiveBuilderClient({ initialRoutines, agentConfigs, isAdmin }: Props) {
  const [routines, setRoutines] = useState<RoutineRow[]>(initialRoutines)
  const [selectedId, setSelectedId] = useState<string | null>(initialRoutines[0]?.id ?? null)
  const [runs, setRuns] = useState<JobRunRow[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [toggleLoading, setToggleLoading] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)
  const [runLoading, setRunLoading] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const selected = routines.find((r) => r.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedId) { setRuns([]); return }
    void fetchRuns(selectedId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  function startPolling(routineId: string) {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const fresh = await fetchRunsSilent(routineId)
      setRuns(fresh)
      const stillRunning = fresh.some((r) => r.status === 'running' || r.status === 'pending')
      if (!stillRunning) {
        clearInterval(pollRef.current!)
        pollRef.current = null
        setRunLoading(null)
      }
    }, 2000)
  }

  async function fetchRunsSilent(routineId: string): Promise<JobRunRow[]> {
    try {
      const resp = await fetch(`/api/routines/${routineId}/runs`)
      if (!resp.ok) return runs
      const data = await resp.json() as { runs: JobRunRow[] }
      return data.runs
    } catch {
      return runs
    }
  }

  async function fetchRuns(routineId: string) {
    setRunsLoading(true)
    try {
      const resp = await fetch(`/api/routines/${routineId}/runs`)
      if (!resp.ok) return
      const data = await resp.json() as { runs: JobRunRow[] }
      setRuns(data.runs)
    } finally {
      setRunsLoading(false)
    }
  }

  async function handleToggle(routine: RoutineRow) {
    setToggleLoading(routine.id)
    try {
      const resp = await fetch(`/api/routines/${routine.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !routine.is_active }),
      })
      if (resp.ok) {
        const data = await resp.json() as { routine: RoutineRow }
        setRoutines((prev) => prev.map((r) => r.id === routine.id ? { ...r, is_active: data.routine.is_active } : r))
      }
    } finally {
      setToggleLoading(null)
    }
  }

  async function handleDelete(id: string) {
    setDeleteLoading(id)
    try {
      const resp = await fetch(`/api/routines/${id}`, { method: 'DELETE' })
      if (resp.ok) {
        setRoutines((prev) => prev.filter((r) => r.id !== id))
        if (selectedId === id) {
          const remaining = routines.filter((r) => r.id !== id)
          setSelectedId(remaining[0]?.id ?? null)
        }
      }
    } finally {
      setDeleteLoading(null)
      setDeleteConfirm(null)
    }
  }

  async function handleRunNow(routine: RoutineRow) {
    setRunLoading(routine.id)
    try {
      const resp = await fetch(`/api/routines/${routine.id}/run`, { method: 'POST' })
      if (resp.ok) {
        setSelectedId(routine.id)
        // Insert a pending placeholder so the user sees feedback immediately
        setRuns((prev) => [{
          id: 'pending-' + Date.now(),
          status: 'pending',
          triggered_by: 'manual',
          started_at: new Date().toISOString(),
          completed_at: null,
          tokens_used: null,
          cost_usd: null,
          output: null,
          error: null,
        }, ...prev])
        startPolling(routine.id)
      }
    } catch {
      setRunLoading(null)
    }
  }

  function handleRoutineCreated(routine: RoutineRow) {
    setRoutines((prev) => [routine, ...prev])
    setSelectedId(routine.id)
    setShowWizard(false)
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.heading}>Proactive Builder</h1>
        <button style={styles.newBtn} onClick={() => setShowWizard(true)}>
          + New Routine
        </button>
      </div>

      <div style={styles.layout}>
        {/* Left panel — routine list */}
        <div style={styles.leftPanel}>
          {routines.length === 0 && (
            <div style={styles.empty}>
              No routines yet. Create one to automate trigger → agent → output workflows.
            </div>
          )}
          {routines.map((r) => (
            <div
              key={r.id}
              style={{
                ...styles.routineCard,
                ...(selectedId === r.id ? styles.routineCardActive : {}),
              }}
              onClick={() => setSelectedId(r.id)}
            >
              <div style={styles.routineCardTop}>
                <span style={styles.routineName}>{r.name}</span>
                <label style={styles.toggle} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={r.is_active}
                    disabled={toggleLoading === r.id}
                    onChange={() => void handleToggle(r)}
                    style={styles.toggleInput}
                  />
                  <span style={{ ...styles.toggleSlider, background: r.is_active ? '#2563eb' : '#d1d5db' }} />
                </label>
              </div>

              <div style={styles.badges}>
                <span style={{ ...styles.badge, background: TRIGGER_COLORS[r.trigger_type] ?? '#6b7280' }}>
                  {r.trigger_type}
                </span>
                <span style={{ ...styles.badge, background: OUTPUT_COLORS[r.output_type] ?? '#6b7280' }}>
                  {r.output_type.replace('_', ' ')}
                </span>
                {r.scope === 'system' && (
                  <span style={{ ...styles.badge, background: '#374151' }}>system</span>
                )}
              </div>

              {r.cron_schedule && (
                <div style={styles.scheduleHint}>{r.cron_schedule}</div>
              )}
              {r.webhook_connector && (
                <div style={styles.scheduleHint}>{r.webhook_connector} · {r.webhook_event}</div>
              )}

              <div style={styles.agentLabel}>
                {r.agent_configs?.name ?? r.agent_config_id}
              </div>

              <div style={styles.routineActions} onClick={(e) => e.stopPropagation()}>
                <button
                  style={styles.runBtn}
                  disabled={runLoading === r.id || !r.is_active}
                  onClick={() => void handleRunNow(r)}
                >
                  {runLoading === r.id ? 'Running…' : 'Run now'}
                </button>
                {deleteConfirm === r.id ? (
                  <>
                    <button
                      style={styles.dangerBtn}
                      disabled={deleteLoading === r.id}
                      onClick={() => void handleDelete(r.id)}
                    >
                      Confirm
                    </button>
                    <button style={styles.cancelBtn} onClick={() => setDeleteConfirm(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button style={styles.deleteBtn} onClick={() => setDeleteConfirm(r.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Right panel — run history */}
        <div style={styles.rightPanel}>
          {!selected ? (
            <div style={styles.emptyRight}>Select a routine to see its run history.</div>
          ) : (
            <>
              <div style={styles.rightHeader}>
                <h2 style={styles.rightHeading}>{selected.name}</h2>
                {selected.description && (
                  <p style={styles.rightDesc}>{selected.description}</p>
                )}
              </div>

              <h3 style={styles.runsHeading}>Run History</h3>

              {runsLoading && <div style={styles.loadingText}>Loading…</div>}

              {!runsLoading && runs.length === 0 && (
                <div style={styles.emptyRight}>No runs yet. Click "Run now" to test this routine.</div>
              )}

              {runs.map((run) => (
                <div key={run.id} style={styles.runCard}>
                  <div style={styles.runCardTop}>
                    <span style={{ ...styles.statusBadge, background: STATUS_COLORS[run.status] ?? '#6b7280' }}>
                      {run.status}
                    </span>
                    <span style={styles.runMeta}>
                      {run.triggered_by} · {formatDate(run.started_at)}
                    </span>
                    <span style={styles.runMeta}>
                      {durationMs(run.started_at, run.completed_at)}
                    </span>
                    {run.tokens_used != null && (
                      <span style={styles.runMeta}>{run.tokens_used.toLocaleString()} tokens</span>
                    )}
                  </div>

                  {run.error && (
                    <div style={styles.runError}>{run.error}</div>
                  )}

                  {run.output != null && (
                    <div style={styles.runOutput}>{outputSummary(run.output)}</div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {showWizard && (
        <RoutineWizard
          agentConfigs={agentConfigs}
          isAdmin={isAdmin}
          onClose={() => setShowWizard(false)}
          onCreated={handleRoutineCreated}
        />
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '32px 24px',
    fontFamily: 'system-ui, sans-serif',
    color: '#111827',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  heading: {
    fontSize: 24,
    fontWeight: 700,
    margin: 0,
  },
  newBtn: {
    padding: '8px 16px',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: '360px 1fr',
    gap: 24,
    alignItems: 'start',
  },
  leftPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  rightPanel: {
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: 24,
    minHeight: 300,
  },
  empty: {
    color: '#6b7280',
    fontSize: 14,
    padding: '24px 0',
  },
  emptyRight: {
    color: '#6b7280',
    fontSize: 14,
  },
  routineCard: {
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: 16,
    cursor: 'pointer',
    background: '#fff',
    transition: 'border-color 0.15s',
  },
  routineCardActive: {
    borderColor: '#2563eb',
    background: '#eff6ff',
  },
  routineCardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  routineName: {
    fontWeight: 600,
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  toggle: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  toggleInput: {
    position: 'absolute',
    opacity: 0,
    width: 0,
    height: 0,
  },
  toggleSlider: {
    width: 36,
    height: 20,
    borderRadius: 10,
    display: 'block',
    transition: 'background 0.2s',
    position: 'relative',
  },
  badges: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  badge: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 7px',
    borderRadius: 12,
    textTransform: 'capitalize',
  },
  scheduleHint: {
    fontSize: 12,
    color: '#6b7280',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  agentLabel: {
    fontSize: 12,
    color: '#374151',
    marginBottom: 10,
  },
  routineActions: {
    display: 'flex',
    gap: 8,
  },
  runBtn: {
    padding: '4px 10px',
    fontSize: 12,
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  },
  deleteBtn: {
    padding: '4px 10px',
    fontSize: 12,
    background: 'transparent',
    color: '#dc2626',
    border: '1px solid #dc2626',
    borderRadius: 4,
    cursor: 'pointer',
  },
  dangerBtn: {
    padding: '4px 10px',
    fontSize: 12,
    background: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  },
  cancelBtn: {
    padding: '4px 10px',
    fontSize: 12,
    background: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    cursor: 'pointer',
  },
  rightHeader: {
    marginBottom: 20,
  },
  rightHeading: {
    fontSize: 18,
    fontWeight: 700,
    margin: '0 0 4px',
  },
  rightDesc: {
    fontSize: 14,
    color: '#6b7280',
    margin: 0,
  },
  runsHeading: {
    fontSize: 14,
    fontWeight: 600,
    margin: '0 0 12px',
    color: '#374151',
  },
  loadingText: {
    color: '#6b7280',
    fontSize: 14,
  },
  runCard: {
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
    background: '#fff',
  },
  runCardTop: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  statusBadge: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 12,
  },
  runMeta: {
    fontSize: 12,
    color: '#6b7280',
  },
  runError: {
    fontSize: 12,
    color: '#dc2626',
    marginTop: 4,
    padding: '4px 8px',
    background: '#fef2f2',
    borderRadius: 4,
  },
  runOutput: {
    fontSize: 13,
    color: '#374151',
    marginTop: 4,
    padding: '4px 8px',
    background: '#f3f4f6',
    borderRadius: 4,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
}
