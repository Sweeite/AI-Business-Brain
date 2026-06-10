'use client'

import { useState, useEffect, useRef } from 'react'

interface AgentRun {
  id: string
  status: string
  trigger_context: Record<string, unknown> | null
  created_at: string
  tokens_used: number | null
  cost_usd: number | null
  duration_ms: number | null
  user_rating: number | null
  user_feedback: string | null
  acting_user_id: string | null
  agent_config_id: string | null
  users: { email: string; full_name: string | null } | null
  agent_configs: { name: string } | null
}

interface TraceRun extends AgentRun {
  memory_retrieved: unknown
  tool_calls: unknown
  reasoning_trace: string | null
  output: string | null
  provenance_labels: unknown
}

interface ToolCall {
  tool: string
  input: unknown
  output: unknown
}

interface RetrievedMemory {
  id?: string
  type?: string
  content?: string
  sensitivity_level?: string
}

interface ProvenanceLabel {
  type: string
  label?: string
  source?: string
}

interface Filters {
  agent_config_id: string
  user_id: string
  date_from: string
  date_to: string
  rating: string
  status: string
}

const STATUS_COLORS: Record<string, string> = {
  completed: '#16a34a',
  failed: '#dc2626',
  running: '#d97706',
}

const TRIGGER_COLORS: Record<string, string> = {
  user_query: '#2563eb',
  cron: '#7c3aed',
  webhook: '#0891b2',
  manual: '#6b7280',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatCost(usd: number | null): string {
  if (usd === null) return '—'
  return `$${usd.toFixed(4)}`
}

function ratingIcon(rating: number | null): string {
  if (rating === 1) return '👍'
  if (rating === -1) return '👎'
  return '—'
}

function triggerLabel(run: AgentRun): string {
  const ctx = run.trigger_context
  if (!ctx) return 'unknown'
  return (ctx.type as string) ?? 'unknown'
}

export function ActivityClient() {
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const [traceData, setTraceData] = useState<TraceRun | null>(null)
  const [traceLoading, setTraceLoading] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  const [filters, setFilters] = useState<Filters>({
    agent_config_id: '',
    user_id: '',
    date_from: '',
    date_to: '',
    rating: '',
    status: '',
  })

  // Derived option lists from loaded runs
  const [agentOptions, setAgentOptions] = useState<{ id: string; name: string }[]>([])
  const [userOptions, setUserOptions] = useState<{ id: string; label: string }[]>([])
  const agentOptionsLoaded = useRef(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void fetchRuns(0)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  useEffect(() => {
    void fetchRuns(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  async function fetchRuns(targetPage: number) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(targetPage))
      if (filters.agent_config_id) params.set('agent_config_id', filters.agent_config_id)
      if (filters.user_id) params.set('user_id', filters.user_id)
      if (filters.date_from) params.set('date_from', filters.date_from)
      if (filters.date_to) params.set('date_to', filters.date_to)
      if (filters.rating !== '') params.set('rating', filters.rating)
      if (filters.status) params.set('status', filters.status)

      const resp = await fetch(`/api/activity?${params.toString()}`)
      if (!resp.ok) {
        const data = await resp.json() as { error?: string }
        setError(data.error ?? 'Failed to load runs')
        return
      }
      const data = await resp.json() as { runs: AgentRun[]; total: number; page: number }
      setRuns(data.runs)
      setTotal(data.total)

      if (!agentOptionsLoaded.current && data.runs.length > 0) {
        agentOptionsLoaded.current = true
        const seen = new Map<string, string>()
        data.runs.forEach((r) => {
          if (r.agent_config_id && r.agent_configs?.name) {
            seen.set(r.agent_config_id, r.agent_configs.name)
          }
        })
        setAgentOptions(Array.from(seen.entries()).map(([id, name]) => ({ id, name })))

        const userSeen = new Map<string, string>()
        data.runs.forEach((r) => {
          if (r.acting_user_id && r.users) {
            userSeen.set(r.acting_user_id, r.users.full_name ?? r.users.email)
          }
        })
        setUserOptions(Array.from(userSeen.entries()).map(([id, label]) => ({ id, label })))
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const DEFAULT_FILTERS: Filters = {
    agent_config_id: '',
    user_id: '',
    date_from: '',
    date_to: '',
    rating: '',
    status: '',
  }

  const hasActiveFilters = Object.values(filters).some((v) => v !== '')

  function onFilterChange(key: keyof Filters, value: string) {
    setPage(0)
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function clearFilters() {
    setPage(0)
    setFilters(DEFAULT_FILTERS)
  }

  async function toggleTrace(runId: string) {
    if (expandedRunId === runId) {
      setExpandedRunId(null)
      setTraceData(null)
      return
    }
    setExpandedRunId(runId)
    setTraceData(null)
    setTraceLoading(true)
    setExpandedSections(new Set())
    try {
      const resp = await fetch(`/api/activity/${runId}`)
      if (!resp.ok) return
      const data = await resp.json() as { run: TraceRun }
      setTraceData(data.run)
    } finally {
      setTraceLoading(false)
    }
  }

  function toggleSection(key: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const totalPages = Math.ceil(total / 20)

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Agent Activity</h1>
      <p style={styles.subheading}>{total} run{total !== 1 ? 's' : ''} found</p>

      {/* Filter bar */}
      <div style={styles.filterBar}>
        <select
          value={filters.agent_config_id}
          onChange={(e) => onFilterChange('agent_config_id', e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All agents</option>
          {agentOptions.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select
          value={filters.user_id}
          onChange={(e) => onFilterChange('user_id', e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All users</option>
          {userOptions.map((u) => (
            <option key={u.id} value={u.id}>{u.label}</option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => onFilterChange('status', e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="running">Running</option>
        </select>
        <select
          value={filters.rating}
          onChange={(e) => onFilterChange('rating', e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All ratings</option>
          <option value="1">Thumbs up</option>
          <option value="0">Neutral</option>
          <option value="-1">Thumbs down</option>
        </select>
        <input
          type="date"
          value={filters.date_from}
          onChange={(e) => onFilterChange('date_from', e.target.value)}
          style={styles.filterDate}
          title="From date"
        />
        <input
          type="date"
          value={filters.date_to}
          onChange={(e) => onFilterChange('date_to', e.target.value)}
          style={styles.filterDate}
          title="To date"
        />
        {hasActiveFilters && (
          <button onClick={clearFilters} style={styles.clearFiltersBtn}>
            Clear filters
          </button>
        )}
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}
      {loading && <div style={styles.loadingText}>Loading...</div>}

      {!loading && runs.length === 0 && (
        <div style={styles.emptyText}>No agent runs match the current filters.</div>
      )}

      {runs.map((run) => {
        const triggerType = triggerLabel(run)
        const isExpanded = expandedRunId === run.id

        return (
          <div key={run.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={styles.badges}>
                <span style={styles.agentName}>
                  {run.agent_configs?.name ?? 'Unknown agent'}
                </span>
                <span
                  style={{
                    ...styles.triggerBadge,
                    backgroundColor: TRIGGER_COLORS[triggerType] ?? '#6b7280',
                  }}
                >
                  {triggerType}
                </span>
                <span
                  style={{
                    ...styles.statusBadge,
                    backgroundColor: STATUS_COLORS[run.status] ?? '#6b7280',
                  }}
                >
                  {run.status}
                </span>
              </div>
              <button
                onClick={() => { void toggleTrace(run.id) }}
                style={styles.traceBtn}
              >
                {isExpanded ? 'Hide trace' : 'View trace'}
              </button>
            </div>

            <div style={styles.cardMeta}>
              <span>User: {run.users?.full_name ?? run.users?.email ?? '—'}</span>
              <span>{formatDate(run.created_at)}</span>
            </div>

            <div style={styles.cardStats}>
              <span>Tokens: {run.tokens_used ?? '—'}</span>
              <span>Cost: {formatCost(run.cost_usd)}</span>
              <span>Duration: {formatDuration(run.duration_ms)}</span>
              <span>Rating: {ratingIcon(run.user_rating)}</span>
              {run.user_feedback && (
                <span style={styles.feedbackText}>"{run.user_feedback}"</span>
              )}
            </div>

            {/* Inline trace */}
            {isExpanded && (
              <div style={styles.tracePanel}>
                {traceLoading && <p style={styles.traceLoading}>Loading trace…</p>}
                {traceData && traceData.id === run.id && (
                  <TraceView
                    run={traceData}
                    expandedSections={expandedSections}
                    onToggleSection={toggleSection}
                  />
                )}
              </div>
            )}
          </div>
        )
      })}

      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            style={styles.pageBtn}
          >
            Previous
          </button>
          <span style={styles.pageInfo}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages - 1 || loading}
            style={styles.pageBtn}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

function TraceView({
  run,
  expandedSections,
  onToggleSection,
}: {
  run: TraceRun
  expandedSections: Set<string>
  onToggleSection: (key: string) => void
}) {
  const triggerCtx = run.trigger_context
  const queryText = triggerCtx?.type === 'user_query' ? (triggerCtx.query as string | undefined) : null

  const memories = Array.isArray(run.memory_retrieved) ? (run.memory_retrieved as RetrievedMemory[]) : []
  const toolCalls = Array.isArray(run.tool_calls) ? (run.tool_calls as ToolCall[]) : []
  const provenanceLabels = Array.isArray(run.provenance_labels)
    ? (run.provenance_labels as ProvenanceLabel[])
    : []

  return (
    <div style={styles.trace}>
      {queryText && (
        <div style={styles.traceSection}>
          <div style={styles.traceSectionTitle}>Query</div>
          <p style={styles.queryText}>{queryText}</p>
        </div>
      )}

      {/* Output */}
      {run.output && (
        <div style={styles.traceSection}>
          <div style={styles.traceSectionTitle}>Output</div>
          <p style={styles.outputText}>{run.output}</p>
        </div>
      )}

      {/* Provenance labels */}
      {provenanceLabels.length > 0 && (
        <div style={styles.traceSection}>
          <div style={styles.traceSectionTitle}>Provenance</div>
          <div style={styles.provenanceRow}>
            {provenanceLabels.map((lbl, i) => (
              <span key={i} style={styles.provenanceBadge}>
                {lbl.label ?? lbl.type}
                {lbl.source ? ` (${lbl.source})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Memory retrieved */}
      {memories.length > 0 && (
        <div style={styles.traceSection}>
          <button
            onClick={() => onToggleSection('memory')}
            style={styles.collapsibleBtn}
          >
            {expandedSections.has('memory') ? '▾' : '▸'} Memory retrieved ({memories.length})
          </button>
          {expandedSections.has('memory') && (
            <div style={styles.collapsibleContent}>
              {memories.map((m, i) => (
                <div key={i} style={styles.memoryItem}>
                  <div style={styles.memoryHeader}>
                    <span style={styles.typeBadge}>{m.type ?? '?'}</span>
                    {m.sensitivity_level && (
                      <span style={styles.levelBadge}>{m.sensitivity_level}</span>
                    )}
                  </div>
                  <p style={styles.memoryContent}>
                    {(m.content ?? '').slice(0, 300)}{(m.content?.length ?? 0) > 300 ? '…' : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tool calls */}
      {toolCalls.length > 0 && (
        <div style={styles.traceSection}>
          <button
            onClick={() => onToggleSection('tools')}
            style={styles.collapsibleBtn}
          >
            {expandedSections.has('tools') ? '▾' : '▸'} Tool calls ({toolCalls.length})
          </button>
          {expandedSections.has('tools') && (
            <div style={styles.collapsibleContent}>
              {toolCalls.map((tc, i) => {
                const key = `tool-${i}`
                const isOpen = expandedSections.has(key)
                return (
                  <div key={i} style={styles.toolItem}>
                    <button
                      onClick={() => onToggleSection(key)}
                      style={styles.toolHeader}
                    >
                      {isOpen ? '▾' : '▸'} <span style={styles.toolName}>{tc.tool}</span>
                    </button>
                    {isOpen && (
                      <div style={styles.toolBody}>
                        <div style={styles.toolLabel}>Input</div>
                        <pre style={styles.jsonBlock}>
                          {JSON.stringify(tc.input, null, 2)}
                        </pre>
                        <div style={styles.toolLabel}>Output</div>
                        <pre style={styles.jsonBlock}>
                          {typeof tc.output === 'string'
                            ? tc.output
                            : JSON.stringify(tc.output, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Reasoning trace */}
      {run.reasoning_trace && (
        <div style={styles.traceSection}>
          <button
            onClick={() => onToggleSection('reasoning')}
            style={styles.collapsibleBtn}
          >
            {expandedSections.has('reasoning') ? '▾' : '▸'} Reasoning trace
          </button>
          {expandedSections.has('reasoning') && (
            <pre style={{ ...styles.jsonBlock, marginTop: '8px' }}>
              {run.reasoning_trace}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: '960px' },
  heading: { fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: '#111' },
  subheading: { fontSize: '13px', color: '#888', marginBottom: '20px' },
  filterBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '20px',
    padding: '16px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  },
  filterSelect: {
    padding: '6px 10px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '13px',
    backgroundColor: '#fff',
  },
  filterDate: {
    padding: '6px 8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '13px',
  },
  clearFiltersBtn: {
    padding: '6px 12px',
    fontSize: '12px',
    background: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#374151',
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fca5a5',
    color: '#b91c1c',
    padding: '12px 16px',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '13px',
  },
  loadingText: { color: '#888', fontSize: '14px', marginBottom: '16px' },
  emptyText: { color: '#888', fontSize: '14px', padding: '40px 0', textAlign: 'center' },
  card: {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '12px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '10px',
    gap: '12px',
  },
  badges: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' },
  agentName: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#111',
  },
  triggerBadge: {
    padding: '2px 8px',
    color: '#fff',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
  },
  statusBadge: {
    padding: '2px 8px',
    color: '#fff',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
  },
  traceBtn: {
    padding: '4px 12px',
    fontSize: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    flexShrink: 0,
    color: '#374151',
  },
  cardMeta: {
    display: 'flex',
    gap: '20px',
    fontSize: '12px',
    color: '#6b7280',
    marginBottom: '8px',
  },
  cardStats: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    fontSize: '12px',
    color: '#6b7280',
    borderTop: '1px solid #f3f4f6',
    paddingTop: '8px',
  },
  feedbackText: {
    fontStyle: 'italic',
    color: '#374151',
  },
  tracePanel: {
    marginTop: '16px',
    borderTop: '1px solid #e5e7eb',
    paddingTop: '16px',
  },
  traceLoading: {
    fontSize: '13px',
    color: '#6b7280',
  },
  trace: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  traceSection: {
    fontSize: '13px',
  },
  traceSectionTitle: {
    fontWeight: 600,
    color: '#374151',
    fontSize: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '6px',
  },
  queryText: {
    margin: 0,
    color: '#111',
    fontSize: '14px',
    fontStyle: 'italic',
  },
  outputText: {
    margin: 0,
    color: '#111',
    fontSize: '13px',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
  },
  provenanceRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  provenanceBadge: {
    padding: '2px 8px',
    backgroundColor: '#f0fdf4',
    color: '#15803d',
    borderRadius: '4px',
    fontSize: '11px',
    border: '1px solid #bbf7d0',
  },
  collapsibleBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    color: '#374151',
    padding: 0,
    textAlign: 'left' as const,
  },
  collapsibleContent: {
    marginTop: '8px',
    paddingLeft: '12px',
    borderLeft: '2px solid #e5e7eb',
  },
  memoryItem: {
    marginBottom: '10px',
    paddingBottom: '10px',
    borderBottom: '1px solid #f3f4f6',
  },
  memoryHeader: {
    display: 'flex',
    gap: '6px',
    marginBottom: '4px',
  },
  typeBadge: {
    padding: '2px 8px',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  levelBadge: {
    padding: '2px 8px',
    backgroundColor: '#e0e7ff',
    color: '#3730a3',
    borderRadius: '4px',
    fontSize: '11px',
  },
  memoryContent: {
    margin: 0,
    fontSize: '12px',
    color: '#374151',
    lineHeight: '1.5',
  },
  toolItem: {
    marginBottom: '8px',
  },
  toolHeader: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#374151',
    padding: 0,
    textAlign: 'left' as const,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  toolName: {
    fontWeight: 600,
    color: '#111',
  },
  toolBody: {
    marginTop: '6px',
    paddingLeft: '16px',
  },
  toolLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '4px',
    marginTop: '8px',
  },
  jsonBlock: {
    margin: 0,
    padding: '8px 10px',
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    fontSize: '11px',
    lineHeight: '1.5',
    overflow: 'auto',
    maxHeight: '300px',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginTop: '24px',
    justifyContent: 'center',
  },
  pageBtn: {
    padding: '6px 16px',
    fontSize: '13px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    backgroundColor: '#fff',
    cursor: 'pointer',
  },
  pageInfo: { fontSize: '13px', color: '#374151' },
}
