'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'

type SuggestionStatus = 'pending' | 'approved' | 'rejected'

interface Suggestion {
  id: string
  category: string
  title: string
  reasoning: string
  proposed_change: Record<string, unknown>
  target_config_id: string | null
  target_config_name: string | null
  evidence: Record<string, unknown> | null
  status: SuggestionStatus
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

interface AgentConfigVersion {
  id: string
  agent_config_id: string
  version: number
  system_prompt: string
  model: string
  change_reason: string | null
  changed_by: string | null
  improvement_suggestion_id: string | null
  created_at: string
}

interface WeekTrend {
  week: string
  total_runs: number
  rated_runs: number
  avg_rating: number | null
  miss_count: number
  resolved_miss_count: number
}

const CATEGORY_COLORS: Record<string, string> = {
  agent_prompt: '#6366f1',
  memory_quality: '#0891b2',
  retrieval_settings: '#d97706',
  decay_settings: '#16a34a',
  capture_rules: '#9333ea',
}

const CHANGE_TYPE_LABELS: Record<string, string> = {
  agent_prompt_update: 'Prompt update',
  system_config_update: 'Config update',
  informational: 'Informational',
}

export function ImprovementClient() {
  const [tab, setTab] = useState<'pending' | 'history' | 'trends'>('pending')
  const [pendingSuggestions, setPendingSuggestions] = useState<Suggestion[]>([])
  const [historySuggestions, setHistorySuggestions] = useState<Suggestion[]>([])
  const [trends, setTrends] = useState<WeekTrend[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [expandedEvidence, setExpandedEvidence] = useState<Set<string>>(new Set())
  const [expandedProposedChange, setExpandedProposedChange] = useState<Set<string>>(new Set())
  const [versionsMap, setVersionsMap] = useState<Record<string, AgentConfigVersion[]>>({})
  const [rollbackTarget, setRollbackTarget] = useState<{ suggestionId: string; configId: string } | null>(null)
  const [pendingRollbackConfirm, setPendingRollbackConfirm] = useState<{ configId: string; versionId: string } | null>(null)
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({})

  const loadSuggestions = useCallback(async () => {
    setLoading(true)
    const [pendingRes, historyRes] = await Promise.all([
      fetch('/api/admin/suggestions?status=pending'),
      fetch('/api/admin/suggestions?status=approved,rejected'),
    ])
    if (pendingRes.ok) {
      const data = await pendingRes.json() as { suggestions: Suggestion[] }
      setPendingSuggestions(data.suggestions)
    }
    if (historyRes.ok) {
      const data = await historyRes.json() as { suggestions: Suggestion[] }
      setHistorySuggestions(data.suggestions)
    }
    setLoading(false)
  }, [])

  const loadTrends = useCallback(async () => {
    const res = await fetch('/api/admin/trends')
    if (res.ok) {
      const data = await res.json() as { weeks: WeekTrend[] }
      setTrends(data.weeks)
    }
  }, [])

  useEffect(() => {
    void loadSuggestions()
    void loadTrends()
  }, [loadSuggestions, loadTrends])

  async function handleApprove(id: string) {
    setActionLoading(id)
    setActionErrors((prev) => { const n = { ...prev }; delete n[id]; return n })
    const res = await fetch(`/api/admin/suggestions/${id}/approve`, { method: 'POST' })
    if (res.ok) {
      await loadSuggestions()
    } else {
      const err = await res.json() as { error?: string }
      setActionErrors((prev) => ({ ...prev, [id]: err.error ?? 'Failed to approve' }))
    }
    setActionLoading(null)
  }

  async function handleReject(id: string) {
    setActionLoading(id)
    setActionErrors((prev) => { const n = { ...prev }; delete n[id]; return n })
    const res = await fetch(`/api/admin/suggestions/${id}/reject`, { method: 'POST' })
    if (res.ok) {
      await loadSuggestions()
    } else {
      const err = await res.json() as { error?: string }
      setActionErrors((prev) => ({ ...prev, [id]: err.error ?? 'Failed to reject' }))
    }
    setActionLoading(null)
  }

  async function loadVersions(configId: string) {
    if (versionsMap[configId]) return
    const res = await fetch(`/api/admin/agent-configs/${configId}/versions`)
    if (res.ok) {
      const data = await res.json() as { versions: AgentConfigVersion[] }
      setVersionsMap((prev) => ({ ...prev, [configId]: data.versions }))
    }
  }

  async function handleRollback(configId: string, versionId: string) {
    setActionLoading(`rollback-${versionId}`)
    setActionErrors((prev) => { const n = { ...prev }; delete n[`rollback-${versionId}`]; return n })
    const res = await fetch(`/api/admin/agent-configs/${configId}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version_id: versionId }),
    })
    if (res.ok) {
      setPendingRollbackConfirm(null)
      setRollbackTarget(null)
      setVersionsMap((prev) => { const n = { ...prev }; delete n[configId]; return n })
      await loadSuggestions()
    } else {
      const err = await res.json() as { error?: string }
      setActionErrors((prev) => ({ ...prev, [`rollback-${versionId}`]: err.error ?? 'Rollback failed' }))
    }
    setActionLoading(null)
  }

  function toggleEvidence(id: string) {
    setExpandedEvidence((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function ratingTrend(weeks: WeekTrend[]): string {
    const rated = weeks.filter((w) => w.avg_rating !== null)
    if (rated.length < 2) return ''
    const last = rated[rated.length - 1].avg_rating!
    const prev = rated[rated.length - 2].avg_rating!
    return last > prev ? ' ↑' : last < prev ? ' ↓' : ''
  }

  function missTrend(weeks: WeekTrend[]): string {
    if (weeks.length < 2) return ''
    const last = weeks[weeks.length - 1].miss_count
    const prev = weeks[weeks.length - 2].miss_count
    return last > prev ? ' ↑' : last < prev ? ' ↓' : ''
  }

  return (
    <div style={styles.container}>
      <style>{`
        .si-tab { background: transparent !important; }
        .si-tab:hover { background: rgba(0,0,0,0.04) !important; }
        .si-tab:active { background: rgba(0,0,0,0.08) !important; }
        .si-tab-active { background: #f3f4f6 !important; color: #111827 !important; font-weight: 600 !important; }
        .si-tab-active:hover { background: #f3f4f6 !important; }
      `}</style>
      <h1 style={styles.heading}>Self-Improvement</h1>
      <p style={styles.subheading}>
        Weekly analysis of performance signals. Review and approve suggestions to update system configuration.
      </p>

      <div style={styles.tabs}>
        {(['pending', 'history', 'trends'] as const).map((t) => (
          <button
            key={t}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setTab(t)}
            className={tab === t ? 'si-tab si-tab-active' : 'si-tab'}
            style={styles.tabBtn}
          >
            {t === 'pending' ? `Pending (${pendingSuggestions.length})` : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading && <p style={styles.empty}>Loading…</p>}

      {!loading && tab === 'pending' && (
        <div>
          {pendingSuggestions.length === 0 ? (
            <p style={styles.empty}>No pending suggestions. The analysis cron runs Monday 6am.</p>
          ) : (
            pendingSuggestions.map((s) => (
              <div key={s.id} style={styles.card}>
                <div style={styles.cardHeader}>
                  <span style={{ ...styles.badge, backgroundColor: CATEGORY_COLORS[s.category] ?? '#555' }}>
                    {s.category.replace('_', ' ')}
                  </span>
                  {s.target_config_name && (
                    <span style={styles.configLabel}>{s.target_config_name}</span>
                  )}
                  <span style={styles.date}>{formatDate(s.created_at)}</span>
                </div>

                <h3 style={styles.cardTitle}>{s.title}</h3>
                <p style={styles.cardReasoning}>{s.reasoning}</p>

                <div style={styles.proposedChange}>
                  <span style={styles.changeType}>
                    {CHANGE_TYPE_LABELS[s.proposed_change?.type as string] ?? 'Change'}
                  </span>
                  {s.proposed_change?.type === 'system_config_update' && (
                    <span style={styles.changeDetail}>
                      {String(s.proposed_change.key)} → {JSON.stringify(s.proposed_change.value)}
                    </span>
                  )}
                  {s.proposed_change?.type === 'agent_prompt_update' && (
                    <>
                      <span style={styles.changeDetail}>Update {s.target_config_name ?? 'agent'} system prompt</span>
                      {s.proposed_change.new_system_prompt && (
                        <button
                          style={styles.evidenceToggle}
                          onClick={() => setExpandedProposedChange((prev) => {
                            const next = new Set(prev)
                            next.has(s.id) ? next.delete(s.id) : next.add(s.id)
                            return next
                          })}
                        >
                          {expandedProposedChange.has(s.id) ? '▾ Hide new prompt' : '▸ Show new prompt'}
                        </button>
                      )}
                    </>
                  )}
                </div>
                {s.proposed_change?.type === 'agent_prompt_update' && expandedProposedChange.has(s.id) && (
                  <pre style={styles.evidenceBlock}>
                    {String(s.proposed_change.new_system_prompt)}
                  </pre>
                )}

                {s.evidence && (
                  <div>
                    <button
                      style={styles.evidenceToggle}
                      onClick={() => toggleEvidence(s.id)}
                    >
                      {expandedEvidence.has(s.id) ? '▾ Hide evidence' : '▸ Show evidence'}
                    </button>
                    {expandedEvidence.has(s.id) && (
                      <pre style={styles.evidenceBlock}>
                        {JSON.stringify(s.evidence, null, 2)}
                      </pre>
                    )}
                  </div>
                )}

                {actionErrors[s.id] && (
                  <p style={styles.inlineError}>{actionErrors[s.id]}</p>
                )}
                <div style={styles.actions}>
                  <button
                    style={{ ...styles.approveBtn, opacity: actionLoading === s.id ? 0.5 : 1 }}
                    onClick={() => handleApprove(s.id)}
                    disabled={actionLoading === s.id}
                  >
                    Approve
                  </button>
                  <button
                    style={{ ...styles.rejectBtn, opacity: actionLoading === s.id ? 0.5 : 1 }}
                    onClick={() => handleReject(s.id)}
                    disabled={actionLoading === s.id}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {!loading && tab === 'history' && (
        <div>
          {historySuggestions.length === 0 ? (
            <p style={styles.empty}>No reviewed suggestions yet.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Title</th>
                  <th style={styles.th}>Category</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Reviewed</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {historySuggestions.map((s) => (
                  <Fragment key={s.id}>
                    <tr style={styles.tr}>
                      <td style={styles.td}>{s.title}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, backgroundColor: CATEGORY_COLORS[s.category] ?? '#555' }}>
                          {s.category.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.statusBadge,
                          backgroundColor: s.status === 'approved' ? '#166534' : '#7f1d1d',
                        }}>
                          {s.status}
                        </span>
                      </td>
                      <td style={styles.td}>{s.reviewed_at ? formatDate(s.reviewed_at) : '—'}</td>
                      <td style={styles.td}>
                        {s.status === 'approved' && s.target_config_id && s.proposed_change.type === 'agent_prompt_update' && (
                          <button
                            style={styles.rollbackBtn}
                            onClick={async () => {
                              await loadVersions(s.target_config_id!)
                              setRollbackTarget({ suggestionId: s.id, configId: s.target_config_id! })
                            }}
                          >
                            Rollback
                          </button>
                        )}
                      </td>
                    </tr>
                    {rollbackTarget?.suggestionId === s.id && s.target_config_id && (
                      <tr key={`${s.id}-rollback`}>
                        <td colSpan={5} style={styles.rollbackPanel}>
                          <strong style={{ display: 'block', marginBottom: 8, color: '#111827' }}>
                            Select version to restore:
                          </strong>
                          {(versionsMap[s.target_config_id] ?? []).length === 0 ? (
                            <p style={{ color: '#aaa' }}>No prior versions found.</p>
                          ) : (
                            (versionsMap[s.target_config_id] ?? []).map((v) => (
                              <div key={v.id}>
                                <div style={styles.versionRow}>
                                  <span style={{ color: '#374151', fontSize: 13 }}>
                                    v{v.version} — {v.change_reason ?? 'manual'} — {formatDate(v.created_at)}
                                  </span>
                                  {pendingRollbackConfirm?.versionId !== v.id && (
                                    <button
                                      style={styles.rollbackConfirmBtn}
                                      onClick={() => setPendingRollbackConfirm({ configId: s.target_config_id!, versionId: v.id })}
                                    >
                                      Restore this version
                                    </button>
                                  )}
                                </div>
                                {pendingRollbackConfirm?.versionId === v.id && (
                                  <div style={styles.rollbackConfirmRow}>
                                    <span style={{ color: '#b45309', fontSize: 13, fontWeight: 600 }}>
                                      Restore v{v.version}? The current config will be archived.
                                    </span>
                                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                      <button
                                        style={{
                                          ...styles.rollbackConfirmBtn,
                                          opacity: actionLoading === `rollback-${v.id}` ? 0.5 : 1,
                                        }}
                                        onClick={() => handleRollback(s.target_config_id!, v.id)}
                                        disabled={actionLoading === `rollback-${v.id}`}
                                      >
                                        {actionLoading === `rollback-${v.id}` ? 'Restoring…' : 'Confirm restore'}
                                      </button>
                                      <button
                                        style={styles.cancelBtn}
                                        onClick={() => setPendingRollbackConfirm(null)}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                    {actionErrors[`rollback-${v.id}`] && (
                                      <p style={styles.inlineError}>{actionErrors[`rollback-${v.id}`]}</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                          <button
                            style={styles.cancelBtn}
                            onClick={() => setRollbackTarget(null)}
                          >
                            Cancel
                          </button>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'trends' && (
        <div>
          <p style={{ color: '#6b7280', marginBottom: 16, fontSize: 14 }}>
            Past 8 weeks — answer quality (avg user rating) and miss rate.
          </p>
          {trends.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: 14 }}>No data yet. Trends populate as users rate answers and the brain encounters misses.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.thLight}>Week</th>
                  <th style={styles.thLight}>Total runs</th>
                  <th style={styles.thLight}>Rated runs</th>
                  <th style={styles.thLight}>Avg rating{ratingTrend(trends)}</th>
                  <th style={styles.thLight}>Misses{missTrend(trends)}</th>
                  <th style={styles.thLight}>Resolved misses</th>
                </tr>
              </thead>
              <tbody>
                {trends.map((w) => (
                  <tr key={w.week} style={styles.trLight}>
                    <td style={styles.tdLight}>{w.week}</td>
                    <td style={styles.tdLight}>{w.total_runs}</td>
                    <td style={styles.tdLight}>{w.rated_runs}</td>
                    <td style={styles.tdLight}>
                      {w.avg_rating !== null ? (
                        <span style={{ color: w.avg_rating >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                          {w.avg_rating > 0 ? '+' : ''}{w.avg_rating.toFixed(2)}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={styles.tdLight}>
                      <span style={{ color: w.miss_count > 5 ? '#dc2626' : '#111827', fontWeight: w.miss_count > 5 ? 600 : 400 }}>
                        {w.miss_count}
                      </span>
                    </td>
                    <td style={styles.tdLight}>{w.resolved_miss_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '32px',
    maxWidth: '960px',
    color: '#111827',
  },
  heading: {
    fontSize: 24,
    fontWeight: 700,
    margin: '0 0 8px',
    color: '#111827',
  },
  subheading: {
    fontSize: 14,
    color: '#6b7280',
    margin: '0 0 28px',
  },
  tabs: {
    display: 'flex',
    gap: 4,
    marginBottom: 24,
    borderBottom: '1px solid #e5e7eb',
    paddingBottom: 12,
  },
  tabBtn: {
    border: 'none',
    color: '#6b7280',
    fontSize: 14,
    cursor: 'pointer',
    padding: '6px 14px',
    borderRadius: 4,
    outline: 'none',
  },
  empty: {
    color: '#6b7280',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 4,
    color: '#fff',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  configLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontFamily: 'monospace',
  },
  date: {
    marginLeft: 'auto',
    fontSize: 12,
    color: '#9ca3af',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    margin: '0 0 8px',
    color: '#111827',
  },
  cardReasoning: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 1.6,
    margin: '0 0 12px',
  },
  proposedChange: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 4,
    padding: '8px 12px',
    marginBottom: 12,
  },
  changeType: {
    fontSize: 12,
    fontWeight: 600,
    color: '#2563eb',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    flexShrink: 0,
  },
  changeDetail: {
    fontSize: 13,
    color: '#374151',
    fontFamily: 'monospace',
  },
  evidenceToggle: {
    background: 'none',
    border: 'none',
    color: '#6b7280',
    fontSize: 13,
    cursor: 'pointer',
    padding: 0,
    marginBottom: 8,
    outline: 'none',
  },
  evidenceBlock: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 4,
    padding: 12,
    fontSize: 12,
    color: '#374151',
    overflow: 'auto',
    maxHeight: 200,
    marginBottom: 12,
  },
  actions: {
    display: 'flex',
    gap: 10,
    marginTop: 4,
  },
  approveBtn: {
    backgroundColor: '#166534',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '7px 18px',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 600,
  },
  rejectBtn: {
    backgroundColor: '#fff',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    padding: '7px 18px',
    fontSize: 13,
    cursor: 'pointer',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 14,
  },
  th: {
    textAlign: 'left' as const,
    padding: '10px 12px',
    borderBottom: '2px solid #e5e7eb',
    color: '#6b7280',
    fontWeight: 600,
    fontSize: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  tr: {
    borderBottom: '1px solid #f3f4f6',
  },
  td: {
    padding: '10px 12px',
    color: '#374151',
    verticalAlign: 'top' as const,
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 4,
    color: '#fff',
    textTransform: 'uppercase' as const,
  },
  rollbackBtn: {
    background: 'none',
    border: '1px solid #d1d5db',
    color: '#6b7280',
    borderRadius: 4,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
  },
  rollbackPanel: {
    backgroundColor: '#f8fafc',
    padding: '16px 20px',
    borderBottom: '1px solid #e5e7eb',
  },
  versionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #e5e7eb',
  },
  rollbackConfirmRow: {
    padding: '10px 0 8px',
    borderBottom: '1px solid #e5e7eb',
  },
  rollbackConfirmBtn: {
    backgroundColor: '#7c3aed',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '4px 12px',
    fontSize: 12,
    cursor: 'pointer',
  },
  cancelBtn: {
    background: 'none',
    border: 'none',
    color: '#6b7280',
    fontSize: 13,
    cursor: 'pointer',
    padding: '4px 0',
    outline: 'none',
  },
  inlineError: {
    color: '#dc2626',
    fontSize: 13,
    margin: '6px 0 4px',
    padding: '6px 10px',
    backgroundColor: '#fef2f2',
    borderRadius: 4,
    border: '1px solid #fecaca',
  },
  thLight: {
    textAlign: 'left' as const,
    padding: '10px 12px',
    borderBottom: '2px solid #e5e7eb',
    color: '#6b7280',
    fontWeight: 600,
    fontSize: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  trLight: {
    borderBottom: '1px solid #f3f4f6',
  },
  tdLight: {
    padding: '10px 12px',
    color: '#111827',
    verticalAlign: 'top' as const,
    fontSize: 14,
  },
}
