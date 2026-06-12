'use client'

import { useState, useEffect } from 'react'

interface VolumeRow {
  day: string
  connector: string
  processed: number
  indexed: number
  proposed: number
  dropped: number
}

interface ConfidenceBucket {
  bucket: string
  count: number
}

interface BacklogEntry {
  day: string
  incoming: number
  resolved: number
}

interface Stats {
  volume: VolumeRow[]
  memoryTypes: { episodic: number; semantic: number; procedural: number }
  reviewQueue: { depth: number; oldestItemAt: string | null }
  proposalQueue: { reviewDepth: number; drainDepth: number }
  drainRate: number
  confidenceDist: ConfidenceBucket[]
  backlogTrend: BacklogEntry[]
}

interface Proposal {
  id: string
  claim: string
  suggested_type: string
  confidence: number
  status: string
  created_at: string
  submittedBy: string
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const days = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export function IngestionClient() {
  const [period, setPeriod] = useState<7 | 30>(30)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectorFilter, setConnectorFilter] = useState<'All' | 'Gmail' | 'Drive'>('All')

  const [proposals, setProposals] = useState<Proposal[]>([])
  const [proposalsLoading, setProposalsLoading] = useState(false)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)

  useEffect(() => {
    void fetchStats()
    void fetchProposals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  async function fetchStats() {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/ingestion/stats?period=${period}`)
      if (!resp.ok) {
        const data = await resp.json() as { error?: string }
        setError(data.error ?? 'Failed to load stats')
        return
      }
      const data = await resp.json() as Stats
      setStats(data)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  async function fetchProposals() {
    setProposalsLoading(true)
    try {
      const resp = await fetch('/api/memory/proposals')
      if (!resp.ok) return
      const data = await resp.json() as { proposals: Proposal[] }
      setProposals(data.proposals)
    } catch {
      // non-critical — stats still render
    } finally {
      setProposalsLoading(false)
    }
  }

  async function reviewProposal(id: string, action: 'approve' | 'reject') {
    setReviewingId(id)
    setReviewError(null)
    try {
      const resp = await fetch(`/api/memory/proposals/${id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!resp.ok) {
        const data = await resp.json() as { error?: string }
        setReviewError(data.error ?? 'Review action failed')
        return
      }
      // Remove from local list immediately; refetch stats so depth card updates
      setProposals((prev) => prev.filter((p) => p.id !== id))
      void fetchStats()
    } catch {
      setReviewError('Network error')
    } finally {
      setReviewingId(null)
    }
  }

  const filteredVolume = stats?.volume.filter(
    (r) => connectorFilter === 'All' || r.connector === connectorFilter
  ) ?? []

  // Aggregate totals from visible volume rows
  const totals = filteredVolume.reduce(
    (acc, r) => ({
      processed: acc.processed + r.processed,
      indexed: acc.indexed + r.indexed,
      proposed: acc.proposed + r.proposed,
      dropped: acc.dropped + r.dropped,
    }),
    { processed: 0, indexed: 0, proposed: 0, dropped: 0 }
  )

  const maxConf = Math.max(1, ...(stats?.confidenceDist.map((b) => b.count) ?? [1]))

  return (
    <div style={s.container}>
      <div style={s.titleRow}>
        <h1 style={s.heading}>Ingestion & Queue Health</h1>
        <div style={s.periodRow}>
          {([7, 30] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{ ...s.periodBtn, ...(period === p ? s.periodBtnActive : {}) }}
            >
              Last {p} days
            </button>
          ))}
        </div>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}
      {loading && <div style={s.loadingText}>Loading…</div>}

      {stats && (
        <>
          {/* Stat cards */}
          <div style={s.cardRow}>
            <div style={s.statCard}>
              <div style={s.statLabel}>Review Queue</div>
              <div style={s.statValue}>{stats.reviewQueue.depth}</div>
              <div style={s.statSub}>
                {stats.reviewQueue.depth > 0
                  ? `Oldest: ${formatDate(stats.reviewQueue.oldestItemAt)}`
                  : 'Queue empty'}
              </div>
            </div>
            <div style={s.statCard}>
              <div style={s.statLabel}>Proposal Queue</div>
              <div style={s.statValue}>{stats.proposalQueue.reviewDepth + stats.proposalQueue.drainDepth}</div>
              <div style={s.statSub}>
                {stats.proposalQueue.reviewDepth} for review · {stats.proposalQueue.drainDepth} pending drain
              </div>
            </div>
            <div style={s.statCard}>
              <div style={s.statLabel}>Drain Rate</div>
              <div style={s.statValue}>{stats.drainRate.toFixed(1)}</div>
              <div style={s.statSub}>proposals committed/hr (24h)</div>
            </div>
          </div>

          {/* Routing outcomes */}
          <div style={s.section}>
            <h2 style={s.sectionHeading}>Routing Outcomes</h2>
            <div style={s.connectorFilter}>
              {(['All', 'Gmail', 'Drive'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setConnectorFilter(c)}
                  style={{ ...s.filterChip, ...(connectorFilter === c ? s.filterChipActive : {}) }}
                >
                  {c}
                </button>
              ))}
            </div>
            <div style={s.outcomesRow}>
              <div style={s.outcomeCard}>
                <div style={s.outcomeLabel}>Memory Writes</div>
                <div style={s.outcomeValue}>{totals.proposed}</div>
                <div style={s.outcomeSub}>routed to proposals</div>
              </div>
              <div style={s.outcomeCard}>
                <div style={s.outcomeLabel}>Index-in-place</div>
                <div style={s.outcomeValue}>{totals.indexed}</div>
                <div style={s.outcomeSub}>chunked to RAG index</div>
              </div>
              <div style={s.outcomeCard}>
                <div style={s.outcomeLabel}>Dropped</div>
                <div style={s.outcomeValue}>{totals.dropped}</div>
                <div style={s.outcomeSub}>excluded at Gate 1</div>
              </div>
              <div style={s.outcomeCard}>
                <div style={s.outcomeLabel}>Total Processed</div>
                <div style={s.outcomeValue}>{totals.processed}</div>
                <div style={s.outcomeSub}>emails / files</div>
              </div>
            </div>

            {/* Memory type distribution */}
            <div style={s.memTypeRow}>
              <span style={s.memTypeLabel}>Captured by type (active memories this period):</span>
              {(
                [
                  { key: 'episodic', label: 'Episodic', color: '#dbeafe' },
                  { key: 'semantic', label: 'Semantic', color: '#dcfce7' },
                  { key: 'procedural', label: 'Procedural', color: '#fef9c3' },
                ] as const
              ).map(({ key, label, color }) => (
                <span key={key} style={{ ...s.memTypePill, backgroundColor: color }}>
                  {label}: {stats.memoryTypes[key]}
                </span>
              ))}
            </div>
          </div>

          {/* Volume by connector */}
          <div style={s.section}>
            <h2 style={s.sectionHeading}>Volume by Connector</h2>
            {filteredVolume.length === 0 ? (
              <p style={s.emptyText}>No connector sync jobs in this period.</p>
            ) : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Date</th>
                      <th style={s.th}>Connector</th>
                      <th style={{ ...s.th, ...s.thRight }}>Processed</th>
                      <th style={{ ...s.th, ...s.thRight }}>Memory writes</th>
                      <th style={{ ...s.th, ...s.thRight }}>Indexed</th>
                      <th style={{ ...s.th, ...s.thRight }}>Dropped</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVolume.map((row, i) => (
                      <tr key={i} style={i % 2 === 0 ? s.trEven : {}}>
                        <td style={s.td}>{shortDate(row.day)}</td>
                        <td style={s.td}>
                          <span style={row.connector === 'Gmail' ? s.badgeGmail : s.badgeDrive}>
                            {row.connector}
                          </span>
                        </td>
                        <td style={{ ...s.td, ...s.tdRight }}>{row.processed}</td>
                        <td style={{ ...s.td, ...s.tdRight }}>{row.proposed}</td>
                        <td style={{ ...s.td, ...s.tdRight }}>{row.indexed}</td>
                        <td style={{ ...s.td, ...s.tdRight }}>{row.dropped}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Confidence distribution */}
          <div style={s.section}>
            <h2 style={s.sectionHeading}>Confidence Score Distribution</h2>
            <p style={s.sectionSubheading}>Memory proposals received in this period</p>
            {stats.confidenceDist.every((b) => b.count === 0) ? (
              <p style={s.emptyText}>No proposals in this period.</p>
            ) : (
              <div style={s.confGrid}>
                {stats.confidenceDist.map((b) => (
                  <div key={b.bucket} style={s.confRow}>
                    <div style={s.confLabel}>{b.bucket}</div>
                    <div style={s.confBarWrap}>
                      <div
                        style={{
                          ...s.confBar,
                          width: `${Math.round((b.count / maxConf) * 100)}%`,
                        }}
                      />
                    </div>
                    <div style={s.confCount}>{b.count}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Backlog trend */}
          <div style={s.section}>
            <h2 style={s.sectionHeading}>Review Queue Backlog — Last 14 Days</h2>
            <p style={s.sectionSubheading}>Proposals entering the human review queue vs. resolved per day</p>
            {stats.backlogTrend.every((e) => e.incoming === 0) ? (
              <p style={s.emptyText}>No review queue activity in the last 14 days.</p>
            ) : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Date</th>
                      <th style={{ ...s.th, ...s.thRight }}>Incoming</th>
                      <th style={{ ...s.th, ...s.thRight }}>Resolved</th>
                      <th style={{ ...s.th, ...s.thRight }}>Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.backlogTrend.map((row, i) => {
                      const net = row.incoming - row.resolved
                      return (
                        <tr key={i} style={i % 2 === 0 ? s.trEven : {}}>
                          <td style={s.td}>{shortDate(row.day)}</td>
                          <td style={{ ...s.td, ...s.tdRight }}>{row.incoming}</td>
                          <td style={{ ...s.td, ...s.tdRight }}>{row.resolved}</td>
                          <td
                            style={{
                              ...s.td,
                              ...s.tdRight,
                              color: net > 0 ? '#b91c1c' : net < 0 ? '#15803d' : '#6b7280',
                              fontWeight: net !== 0 ? 600 : undefined,
                            }}
                          >
                            {net > 0 ? `+${net}` : net}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Review queue — always shown, independent of stats */}
      <div style={s.section}>
        <div style={s.reviewHeader}>
          <div>
            <h2 style={s.sectionHeading}>Review Queue</h2>
            <p style={s.sectionSubheading}>Memory proposals awaiting Operator review before commit</p>
          </div>
          <button
            onClick={() => { void fetchProposals() }}
            disabled={proposalsLoading}
            style={s.refreshBtn}
          >
            {proposalsLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {reviewError && <div style={s.errorBox}>{reviewError}</div>}

        {!proposalsLoading && proposals.length === 0 && (
          <p style={s.emptyText}>Queue is empty — nothing pending review.</p>
        )}

        {proposals.map((p) => {
          const isBusy = reviewingId === p.id
          return (
            <div key={p.id} style={s.proposalCard}>
              <div style={s.proposalTop}>
                <div style={s.proposalMeta}>
                  <span style={s.typeBadge}>{p.suggested_type}</span>
                  <span style={s.confBadge}>
                    {Math.round(p.confidence * 100)}% confidence
                  </span>
                  <span style={s.proposalBy}>by {p.submittedBy}</span>
                  <span style={s.proposalAge}>{formatDate(p.created_at)}</span>
                </div>
                <div style={s.proposalActions}>
                  <button
                    onClick={() => { void reviewProposal(p.id, 'approve') }}
                    disabled={isBusy}
                    style={{ ...s.actionBtn, ...s.approveBtn }}
                  >
                    {isBusy ? '…' : 'Approve'}
                  </button>
                  <button
                    onClick={() => { void reviewProposal(p.id, 'reject') }}
                    disabled={isBusy}
                    style={{ ...s.actionBtn, ...s.rejectBtn }}
                  >
                    {isBusy ? '…' : 'Reject'}
                  </button>
                </div>
              </div>
              <p style={s.proposalClaim}>{p.claim}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { maxWidth: '960px' },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '12px',
    marginBottom: '24px',
  },
  heading: { fontSize: '22px', fontWeight: 700, color: '#111', margin: 0 },
  periodRow: { display: 'flex', gap: '6px' },
  periodBtn: {
    padding: '6px 14px',
    fontSize: '13px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    color: '#374151',
  },
  periodBtnActive: {
    backgroundColor: '#111',
    color: '#fff',
    borderColor: '#111',
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
  cardRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px',
    marginBottom: '24px',
  },
  statCard: {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '20px',
  },
  statLabel: { fontSize: '12px', color: '#6b7280', fontWeight: 500, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' },
  statValue: { fontSize: '32px', fontWeight: 700, color: '#111', lineHeight: 1, marginBottom: '6px' },
  statSub: { fontSize: '12px', color: '#9ca3af' },
  section: {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '16px',
  },
  sectionHeading: { fontSize: '15px', fontWeight: 600, color: '#111', margin: '0 0 4px' },
  sectionSubheading: { fontSize: '12px', color: '#9ca3af', margin: '0 0 16px' },
  connectorFilter: { display: 'flex', gap: '6px', marginBottom: '16px' },
  filterChip: {
    padding: '4px 12px',
    fontSize: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '12px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    color: '#374151',
  },
  filterChipActive: {
    backgroundColor: '#111',
    color: '#fff',
    borderColor: '#111',
  },
  outcomesRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px',
    marginBottom: '16px',
  },
  outcomeCard: {
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    padding: '14px',
  },
  outcomeLabel: { fontSize: '11px', color: '#6b7280', fontWeight: 500, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' },
  outcomeValue: { fontSize: '24px', fontWeight: 700, color: '#111', marginBottom: '2px' },
  outcomeSub: { fontSize: '11px', color: '#9ca3af' },
  memTypeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '8px',
    paddingTop: '12px',
    borderTop: '1px solid #f3f4f6',
    fontSize: '12px',
  },
  memTypeLabel: { color: '#6b7280' },
  memTypePill: {
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    color: '#374151',
    fontWeight: 500,
  },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: {
    padding: '8px 12px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    borderBottom: '1px solid #e5e7eb',
    whiteSpace: 'nowrap',
  },
  thRight: { textAlign: 'right' },
  td: { padding: '9px 12px', color: '#374151', borderBottom: '1px solid #f3f4f6' },
  tdRight: { textAlign: 'right' },
  trEven: { backgroundColor: '#f9fafb' },
  badgeGmail: {
    display: 'inline-block',
    padding: '2px 8px',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
  },
  badgeDrive: {
    display: 'inline-block',
    padding: '2px 8px',
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
  },
  emptyText: { color: '#9ca3af', fontSize: '13px', margin: '8px 0 0' },
  confGrid: { display: 'flex', flexDirection: 'column', gap: '10px' },
  confRow: {
    display: 'grid',
    gridTemplateColumns: '160px 1fr 48px',
    alignItems: 'center',
    gap: '12px',
  },
  confLabel: { fontSize: '13px', color: '#374151' },
  confBarWrap: {
    height: '16px',
    backgroundColor: '#f3f4f6',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  confBar: {
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: '4px',
    transition: 'width 0.3s',
    minWidth: '2px',
  },
  confCount: { fontSize: '13px', color: '#6b7280', textAlign: 'right' },
  reviewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
    gap: '12px',
  },
  refreshBtn: {
    padding: '5px 12px',
    fontSize: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    color: '#374151',
    flexShrink: 0,
  },
  proposalCard: {
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    padding: '14px 16px',
    marginBottom: '10px',
    backgroundColor: '#fafafa',
  },
  proposalTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '10px',
  },
  proposalMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '8px',
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
  confBadge: {
    padding: '2px 8px',
    backgroundColor: '#e0e7ff',
    color: '#3730a3',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500,
  },
  proposalBy: { fontSize: '12px', color: '#6b7280' },
  proposalAge: { fontSize: '12px', color: '#9ca3af' },
  proposalActions: { display: 'flex', gap: '6px', flexShrink: 0 },
  actionBtn: {
    padding: '5px 14px',
    fontSize: '12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 600,
    border: 'none',
  },
  approveBtn: {
    backgroundColor: '#16a34a',
    color: '#fff',
  },
  rejectBtn: {
    backgroundColor: '#fff',
    color: '#b91c1c',
    border: '1px solid #fca5a5',
  },
  proposalClaim: {
    margin: 0,
    fontSize: '14px',
    color: '#111',
    lineHeight: '1.5',
  },
}
