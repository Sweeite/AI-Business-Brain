'use client'

import { useState, useEffect, useCallback } from 'react'

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
  const [versionsMap, setVersionsMap] = useState<Record<string, AgentConfigVersion[]>>({})
  const [rollbackTarget, setRollbackTarget] = useState<{ suggestionId: string; configId: string } | null>(null)

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
    const res = await fetch(`/api/admin/suggestions/${id}/approve`, { method: 'POST' })
    if (res.ok) {
      await loadSuggestions()
    } else {
      const err = await res.json() as { error?: string }
      alert(err.error ?? 'Failed to approve')
    }
    setActionLoading(null)
  }

  async function handleReject(id: string) {
    setActionLoading(id)
    const res = await fetch(`/api/admin/suggestions/${id}/reject`, { method: 'POST' })
    if (res.ok) {
      await loadSuggestions()
    } else {
      const err = await res.json() as { error?: string }
      alert(err.error ?? 'Failed to reject')
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
    if (!confirm('Restore this version? The current config will be archived.')) return
    setActionLoading(`rollback-${versionId}`)
    const res = await fetch(`/api/admin/agent-configs/${configId}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version_id: versionId }),
    })
    if (res.ok) {
      setRollbackTarget(null)
      await loadSuggestions()
    } else {
      const err = await res.json() as { error?: string }
      alert(err.error ?? 'Rollback failed')
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
      <h1 style={styles.heading}>Self-Improvement</h1>
      <p style={styles.subheading}>
        Weekly analysis of performance signals. Review and approve suggestions to update system configuration.
      </p>

      <div style={styles.tabs}>
        {(['pending', 'history', 'trends'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ ...styles.tabBtn, ...(tab === t ? styles.tabBtnActive : {}) }}
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
                    <span style={styles.changeDetail}>Update {s.target_config_name ?? 'agent'} system prompt</span>
                  )}
                </div>

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
                  <>
                    <tr key={s.id} style={styles.tr}>
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
                        {s.status === 'approved' && s.target_config_id && (
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
                          <strong style={{ display: 'block', marginBottom: 8, color: '#fff' }}>
                            Select version to restore:
                          </strong>
                          {(versionsMap[s.target_config_id] ?? []).length === 0 ? (
                            <p style={{ color: '#aaa' }}>No prior versions found.</p>
                          ) : (
                            (versionsMap[s.target_config_id] ?? []).map((v) => (
                              <div key={v.id} style={styles.versionRow}>
                                <span style={{ color: '#ccc', fontSize: 13 }}>
                                  v{v.version} — {v.change_reason ?? 'manual'} — {formatDate(v.created_at)}
                                </span>
                                <button
                                  style={{
                                    ...styles.rollbackConfirmBtn,
                                    opacity: actionLoading === `rollback-${v.id}` ? 0.5 : 1,
                                  }}
                                  onClick={() => handleRollback(s.target_config_id!, v.id)}
                                  disabled={actionLoading === `rollback-${v.id}`}
                                >
                                  Restore this version
                                </button>
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
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'trends' && (
        <div>
          <p style={{ color: '#aaa', marginBottom: 16, fontSize: 14 }}>
            Past 8 weeks — answer quality (avg user rating) and miss rate.
          </p>
          {trends.length === 0 ? (
            <p style={styles.empty}>No data yet. Trends populate as users rate answers and the brain encounters misses.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Week</th>
                  <th style={styles.th}>Total runs</th>
                  <th style={styles.th}>Rated runs</th>
                  <th style={styles.th}>Avg rating{ratingTrend(trends)}</th>
                  <th style={styles.th}>Misses{missTrend(trends)}</th>
                  <th style={styles.th}>Resolved misses</th>
                </tr>
              </thead>
              <tbody>
                {trends.map((w) => (
                  <tr key={w.week} style={styles.tr}>
                    <td style={styles.td}>{w.week}</td>
                    <td style={styles.td}>{w.total_runs}</td>
                    <td style={styles.td}>{w.rated_runs}</td>
                    <td style={styles.td}>
                      {w.avg_rating !== null ? (
                        <span style={{ color: w.avg_rating >= 0 ? '#4ade80' : '#f87171' }}>
                          {w.avg_rating > 0 ? '+' : ''}{w.avg_rating.toFixed(2)}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={styles.td}>
                      <span style={{ color: w.miss_count > 5 ? '#f87171' : '#e5e7eb' }}>
                        {w.miss_count}
                      </span>
                    </td>
                    <td style={styles.td}>{w.resolved_miss_count}</td>
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
    color: '#e5e7eb',
  },
  heading: {
    fontSize: 24,
    fontWeight: 700,
    margin: '0 0 8px',
    color: '#fff',
  },
  subheading: {
    fontSize: 14,
    color: '#9ca3af',
    margin: '0 0 28px',
  },
  tabs: {
    display: 'flex',
    gap: 8,
    marginBottom: 24,
    borderBottom: '1px solid #374151',
    paddingBottom: 12,
  },
  tabBtn: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    fontSize: 14,
    cursor: 'pointer',
    padding: '6px 14px',
    borderRadius: 4,
  },
  tabBtnActive: {
    backgroundColor: '#1f2937',
    color: '#fff',
  },
  empty: {
    color: '#6b7280',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#1a1a2e',
    border: '1px solid #374151',
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
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
    color: '#9ca3af',
    fontFamily: 'monospace',
  },
  date: {
    marginLeft: 'auto',
    fontSize: 12,
    color: '#6b7280',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    margin: '0 0 8px',
    color: '#f9fafb',
  },
  cardReasoning: {
    fontSize: 14,
    color: '#d1d5db',
    lineHeight: 1.6,
    margin: '0 0 12px',
  },
  proposedChange: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#111827',
    borderRadius: 4,
    padding: '8px 12px',
    marginBottom: 12,
  },
  changeType: {
    fontSize: 12,
    fontWeight: 600,
    color: '#60a5fa',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    flexShrink: 0,
  },
  changeDetail: {
    fontSize: 13,
    color: '#9ca3af',
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
  },
  evidenceBlock: {
    backgroundColor: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 4,
    padding: 12,
    fontSize: 12,
    color: '#94a3b8',
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
    backgroundColor: '#1f2937',
    color: '#e5e7eb',
    border: '1px solid #374151',
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
    borderBottom: '1px solid #374151',
    color: '#9ca3af',
    fontWeight: 600,
    fontSize: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  tr: {
    borderBottom: '1px solid #1f2937',
  },
  td: {
    padding: '10px 12px',
    color: '#d1d5db',
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
    border: '1px solid #374151',
    color: '#9ca3af',
    borderRadius: 4,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
  },
  rollbackPanel: {
    backgroundColor: '#0f172a',
    padding: '16px 20px',
    borderBottom: '1px solid #374151',
  },
  versionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #1e293b',
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
    marginTop: 12,
    padding: 0,
  },
}
