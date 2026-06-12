'use client'

import { useState, useEffect } from 'react'

interface FailedJob {
  id: string
  job_type: string
  status: string
  started_at: string
  completed_at: string | null
  error: string | null
}

interface ConnectorStatus {
  id: string
  connector_type: string
  scope: string
  status: string
  last_synced_at: string | null
  webhook_expires_at: string | null
  ownerEmail: string | null
}

interface LlmErrorRate {
  failedLast7d: number
  totalLast7d: number
  ratePct: number
}

interface QueueDepths {
  ingestionRunning: number
  proposalPending: number
  reviewPending: number
}

interface HealthAlert {
  key: string
  message: string
  severity: 'warning' | 'critical'
}

interface HealthStats {
  failedJobs: FailedJob[]
  connectors: ConnectorStatus[]
  llmErrorRate: LlmErrorRate
  queueDepths: QueueDepths
  alerts: HealthAlert[]
}

function fmtTs(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })
}

function statusBadge(status: string): React.CSSProperties & { label: string } {
  if (status === 'active') return { ...s.badge, backgroundColor: '#dcfce7', color: '#15803d', label: 'Active' }
  if (status === 'expired') return { ...s.badge, backgroundColor: '#fef9c3', color: '#a16207', label: 'Expired' }
  if (status === 'revoked') return { ...s.badge, backgroundColor: '#f3f4f6', color: '#6b7280', label: 'Revoked' }
  return { ...s.badge, backgroundColor: '#fee2e2', color: '#b91c1c', label: 'Error' }
}

export function HealthClient() {
  const [stats, setStats] = useState<HealthStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchStats()
  }, [])

  async function fetchStats() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/health/stats')
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Failed to load stats')
        return
      }
      setStats(await res.json() as HealthStats)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.container}>
      <div style={s.titleRow}>
        <h1 style={s.heading}>System Health</h1>
        <button onClick={() => { void fetchStats() }} disabled={loading} style={s.refreshBtn}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}
      {loading && !stats && <div style={s.loadingText}>Loading…</div>}

      {stats && (
        <>
          {/* Active alerts */}
          {stats.alerts.length === 0 && (
            <div style={s.allClearBox}>All systems operational — no active alerts.</div>
          )}
          {stats.alerts.map((alert) => (
            <div key={alert.key} style={alert.severity === 'critical' ? s.alertCritical : s.alertWarning}>
              <strong>{alert.severity === 'critical' ? 'Critical:' : 'Warning:'}</strong> {alert.message}
            </div>
          ))}

          {/* Stat cards */}
          <div style={s.cardRow}>
            <div style={s.statCard}>
              <div style={s.statLabel}>Failed Jobs</div>
              <div style={{ ...s.statValue, color: stats.failedJobs.length > 0 ? '#b91c1c' : '#111' }}>
                {stats.failedJobs.length}
              </div>
              <div style={s.statSub}>all time, last 50 shown</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statLabel}>LLM Error Rate (7d)</div>
              <div style={{ ...s.statValue, color: stats.llmErrorRate.ratePct >= 10 ? '#b91c1c' : '#111' }}>
                {stats.llmErrorRate.ratePct}%
              </div>
              <div style={s.statSub}>{stats.llmErrorRate.failedLast7d} of {stats.llmErrorRate.totalLast7d} runs failed</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statLabel}>Proposal Queue</div>
              <div style={s.statValue}>{stats.queueDepths.proposalPending}</div>
              <div style={s.statSub}>pending proposals</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statLabel}>Review Queue</div>
              <div style={{ ...s.statValue, color: stats.queueDepths.reviewPending > 20 ? '#a16207' : '#111' }}>
                {stats.queueDepths.reviewPending}
              </div>
              <div style={s.statSub}>awaiting human review</div>
            </div>
          </div>

          {/* Ingestion running */}
          {stats.queueDepths.ingestionRunning > 0 && (
            <div style={s.infoBox}>
              {stats.queueDepths.ingestionRunning} ingestion job(s) currently running.
            </div>
          )}

          {/* Connector status */}
          <div style={s.section}>
            <h2 style={s.sectionHeading}>Connector Status</h2>
            <p style={s.sectionSub}>All active connections and their current health.</p>
            {stats.connectors.length === 0 ? (
              <p style={s.emptyText}>No connectors configured.</p>
            ) : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Connector</th>
                      <th style={s.th}>Scope</th>
                      <th style={s.th}>Owner</th>
                      <th style={s.th}>Status</th>
                      <th style={s.th}>Last Sync</th>
                      <th style={s.th}>Webhook Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.connectors.map((c, i) => {
                      const badge = statusBadge(c.status)
                      return (
                        <tr key={c.id} style={i % 2 === 0 ? s.trEven : {}}>
                          <td style={s.td}>{c.connector_type}</td>
                          <td style={s.td}>{c.scope}</td>
                          <td style={s.td}>{c.ownerEmail ?? '—'}</td>
                          <td style={s.td}>
                            <span style={badge}>{badge.label}</span>
                          </td>
                          <td style={s.td}>{c.last_synced_at ? fmtTs(c.last_synced_at) : '—'}</td>
                          <td style={s.td}>{c.webhook_expires_at ? fmtTs(c.webhook_expires_at) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Failed jobs */}
          <div style={s.section}>
            <h2 style={s.sectionHeading}>Failed Jobs</h2>
            <p style={s.sectionSub}>Last 50 failed job runs across all job types.</p>
            {stats.failedJobs.length === 0 ? (
              <p style={s.emptyText}>No failed jobs.</p>
            ) : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Job Type</th>
                      <th style={s.th}>Started</th>
                      <th style={s.th}>Completed</th>
                      <th style={s.th}>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.failedJobs.map((job, i) => (
                      <tr key={job.id} style={i % 2 === 0 ? s.trEven : {}}>
                        <td style={s.td}><code style={s.code}>{job.job_type}</code></td>
                        <td style={s.td}>{fmtTs(job.started_at)}</td>
                        <td style={s.td}>{job.completed_at ? fmtTs(job.completed_at) : '—'}</td>
                        <td style={{ ...s.td, ...s.errorCell }}>
                          {job.error ? job.error.slice(0, 120) + (job.error.length > 120 ? '…' : '') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { maxWidth: '960px' },
  titleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' },
  heading: { fontSize: '22px', fontWeight: 700, color: '#111', margin: 0 },
  refreshBtn: {
    padding: '6px 14px',
    fontSize: '13px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    color: '#374151',
  },
  errorBox: {
    backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
    padding: '12px 16px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px',
  },
  loadingText: { color: '#888', fontSize: '14px', marginBottom: '16px' },
  allClearBox: {
    backgroundColor: '#f0fdf4', border: '1px solid #86efac', color: '#15803d',
    padding: '14px 18px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px', fontWeight: 500,
  },
  infoBox: {
    backgroundColor: '#eff6ff', border: '1px solid #93c5fd', color: '#1d4ed8',
    padding: '12px 18px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px',
  },
  alertCritical: {
    backgroundColor: '#fef2f2', border: '1px solid #f87171', color: '#991b1b',
    padding: '14px 18px', borderRadius: '6px', marginBottom: '12px', fontSize: '14px', fontWeight: 500,
  },
  alertWarning: {
    backgroundColor: '#fffbeb', border: '1px solid #fbbf24', color: '#92400e',
    padding: '14px 18px', borderRadius: '6px', marginBottom: '12px', fontSize: '14px', fontWeight: 500,
  },
  cardRow: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px',
  },
  statCard: { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px' },
  statLabel: {
    fontSize: '12px', color: '#6b7280', fontWeight: 500, marginBottom: '6px',
    textTransform: 'uppercase' as const, letterSpacing: '0.04em',
  },
  statValue: { fontSize: '28px', fontWeight: 700, color: '#111', lineHeight: 1, marginBottom: '6px' },
  statSub: { fontSize: '12px', color: '#9ca3af' },
  section: {
    backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
    padding: '20px', marginBottom: '16px',
  },
  sectionHeading: { fontSize: '15px', fontWeight: 600, color: '#111', margin: '0 0 4px' },
  sectionSub: { fontSize: '12px', color: '#9ca3af', margin: '0 0 16px' },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
  th: {
    padding: '8px 12px', textAlign: 'left' as const, fontSize: '11px', fontWeight: 600,
    color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.04em',
    borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' as const,
  },
  td: { padding: '9px 12px', color: '#374151', borderBottom: '1px solid #f3f4f6' },
  trEven: { backgroundColor: '#f9fafb' },
  emptyText: { color: '#9ca3af', fontSize: '13px', margin: '8px 0 0' },
  badge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
    fontSize: '11px', fontWeight: 600,
  },
  code: { fontFamily: 'monospace', fontSize: '12px', backgroundColor: '#f3f4f6', padding: '1px 4px', borderRadius: '3px' },
  errorCell: { color: '#6b7280', fontFamily: 'monospace', fontSize: '12px', maxWidth: '400px' },
}
