'use client'

import { useState, useEffect } from 'react'

interface AbstentionDay {
  day: string
  totalQueries: number
  misses: number
  abstentionPct: number
}

interface MissDay {
  day: string
  count: number
}

interface LowRatingDay {
  day: string
  rated: number
  lowRated: number
  lowRatingPct: number
}

interface UtilityDistribution {
  totalActive: number
  retrieved: number
  unused: number
  pctRetrieved: number
  pctUnused: number
  avgUtilityRetrieved: number | null
  avgUtilityUnused: number | null
}

interface QualityAlert {
  key: string
  message: string
  severity: 'warning' | 'critical'
}

interface Thresholds {
  abstentionDropPct: number
  lowRatingPct: number
  missDailyCount: number
  unusedMemoryPct: number
}

interface CurrentPeriodStats {
  avgAbstentionPct: number
  avgLowRatingPct: number
  totalMisses: number
  unusedMemoryPct: number
}

interface QualityStats {
  abstentionByDay: AbstentionDay[]
  missByDay: MissDay[]
  lowRatingByDay: LowRatingDay[]
  utilityDistribution: UtilityDistribution
  alerts: QualityAlert[]
  thresholds: Thresholds
  currentPeriodStats: CurrentPeriodStats
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

function fmtNum(n: number): string {
  return n.toLocaleString()
}

function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export function QualityClient() {
  const [period, setPeriod] = useState<7 | 30 | 90>(30)
  const [stats, setStats] = useState<QualityStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Threshold inputs
  const [abstentionInput, setAbstentionInput] = useState('')
  const [lowRatingInput, setLowRatingInput] = useState('')
  const [missDailyInput, setMissDailyInput] = useState('')
  const [unusedInput, setUnusedInput] = useState('')
  const [savingThresholds, setSavingThresholds] = useState(false)
  const [thresholdsSaved, setThresholdsSaved] = useState(false)
  const [thresholdsError, setThresholdsError] = useState<string | null>(null)

  useEffect(() => {
    void fetchStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  async function fetchStats() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/quality/stats?period=${period}`)
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Failed to load stats')
        return
      }
      const data = await res.json() as QualityStats
      setStats(data)
      setAbstentionInput(String(data.thresholds.abstentionDropPct))
      setLowRatingInput(String(data.thresholds.lowRatingPct))
      setMissDailyInput(String(data.thresholds.missDailyCount))
      setUnusedInput(String(data.thresholds.unusedMemoryPct))
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  async function saveThresholds() {
    setSavingThresholds(true)
    setThresholdsError(null)
    setThresholdsSaved(false)

    const body = {
      abstention_drop_pct: parseFloat(abstentionInput),
      low_rating_pct: parseFloat(lowRatingInput),
      miss_daily_count: parseFloat(missDailyInput),
      unused_memory_pct: parseFloat(unusedInput),
    }

    const invalid = Object.values(body).some((v) => isNaN(v))
    if (invalid) {
      setThresholdsError('All thresholds must be valid numbers')
      setSavingThresholds(false)
      return
    }

    try {
      const res = await fetch('/api/admin/quality/thresholds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setThresholdsError(data.error ?? 'Save failed')
        return
      }
      setThresholdsSaved(true)
      void fetchStats()
    } catch {
      setThresholdsError('Network error')
    } finally {
      setSavingThresholds(false)
    }
  }

  // Only show non-zero days in tables
  const activeAbstentionDays = (stats?.abstentionByDay ?? [])
    .filter((d) => d.totalQueries > 0)
    .slice()
    .reverse()
    .slice(0, 30)

  const activeMissDays = (stats?.missByDay ?? [])
    .filter((d) => d.count > 0)
    .slice()
    .reverse()
    .slice(0, 30)

  const activeLowRatingDays = (stats?.lowRatingByDay ?? [])
    .filter((d) => d.rated > 0)
    .slice()
    .reverse()
    .slice(0, 30)

  return (
    <div style={s.container}>
      <div style={s.titleRow}>
        <h1 style={s.heading}>Quality Monitor</h1>
        <div style={s.periodRow}>
          {([7, 30, 90] as const).map((p) => (
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

      {/* Alert banners */}
      {(stats?.alerts ?? []).map((alert) => (
        <div
          key={alert.key}
          style={alert.severity === 'critical' ? s.alertCritical : s.alertWarning}
        >
          <strong>{alert.severity === 'critical' ? 'Critical alert:' : 'Warning:'}</strong>{' '}
          {alert.message}
        </div>
      ))}

      {stats && (
        <>
          {/* Stat cards */}
          <div style={s.cardRow}>
            <div style={s.statCard}>
              <div style={s.statLabel}>Avg Abstention Rate</div>
              <div style={s.statValue}>{fmtPct(stats.currentPeriodStats.avgAbstentionPct)}</div>
              <div style={s.statSub}>rising = healthy; sudden drop = suspicious</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statLabel}>Total Misses</div>
              <div style={s.statValue}>{fmtNum(stats.currentPeriodStats.totalMisses)}</div>
              <div style={s.statSub}>queries brain couldn&apos;t answer</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statLabel}>Avg Low-Rating Rate</div>
              <div style={s.statValue}>{fmtPct(stats.currentPeriodStats.avgLowRatingPct)}</div>
              <div style={s.statSub}>% of rated answers rated negative</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statLabel}>Unused Memories</div>
              <div style={s.statValue}>{fmtPct(stats.currentPeriodStats.unusedMemoryPct)}</div>
              <div style={s.statSub}>active memories never retrieved</div>
            </div>
          </div>

          {/* Abstention rate by day */}
          <div style={s.section}>
            <h2 style={s.sectionHeading}>Abstention Rate by Day</h2>
            <p style={s.sectionSubheading}>
              A rising abstention rate is healthy — the brain is being appropriately conservative.
              A sudden drop is suspicious and may indicate confabulation. Days with no queries are omitted.
            </p>
            {activeAbstentionDays.length === 0 ? (
              <p style={s.emptyText}>No user queries recorded in this period.</p>
            ) : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Date</th>
                      <th style={{ ...s.th, ...s.thRight }}>Queries</th>
                      <th style={{ ...s.th, ...s.thRight }}>Misses</th>
                      <th style={{ ...s.th, ...s.thRight }}>Abstention %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeAbstentionDays.map((row, i) => (
                      <tr key={i} style={i % 2 === 0 ? s.trEven : {}}>
                        <td style={s.td}>{shortDate(row.day)}</td>
                        <td style={{ ...s.td, ...s.tdRight }}>{fmtNum(row.totalQueries)}</td>
                        <td style={{ ...s.td, ...s.tdRight }}>{fmtNum(row.misses)}</td>
                        <td style={{ ...s.td, ...s.tdRight }}>
                          <strong>{fmtPct(row.abstentionPct)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Miss rate by day + Low-rating rate side by side */}
          <div style={s.twoCol}>
            <div style={s.section}>
              <h2 style={s.sectionHeading}>Memory Miss Rate by Day</h2>
              <p style={s.sectionSubheading}>Queries the brain couldn&apos;t answer. Days with zero misses are omitted.</p>
              {activeMissDays.length === 0 ? (
                <p style={s.emptyText}>No misses in this period.</p>
              ) : (
                <div style={s.tableWrap}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>Date</th>
                        <th style={{ ...s.th, ...s.thRight }}>Misses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeMissDays.map((row, i) => (
                        <tr key={i} style={i % 2 === 0 ? s.trEven : {}}>
                          <td style={s.td}>{shortDate(row.day)}</td>
                          <td style={{ ...s.td, ...s.tdRight }}><strong>{fmtNum(row.count)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={s.section}>
              <h2 style={s.sectionHeading}>Low-Rated Answer Rate by Day</h2>
              <p style={s.sectionSubheading}>% of rated answers rated negative (thumbs down). Days with no ratings are omitted.</p>
              {activeLowRatingDays.length === 0 ? (
                <p style={s.emptyText}>No rated answers in this period.</p>
              ) : (
                <div style={s.tableWrap}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>Date</th>
                        <th style={{ ...s.th, ...s.thRight }}>Rated</th>
                        <th style={{ ...s.th, ...s.thRight }}>Negative</th>
                        <th style={{ ...s.th, ...s.thRight }}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeLowRatingDays.map((row, i) => (
                        <tr key={i} style={i % 2 === 0 ? s.trEven : {}}>
                          <td style={s.td}>{shortDate(row.day)}</td>
                          <td style={{ ...s.td, ...s.tdRight }}>{fmtNum(row.rated)}</td>
                          <td style={{ ...s.td, ...s.tdRight }}>{fmtNum(row.lowRated)}</td>
                          <td style={{ ...s.td, ...s.tdRight }}><strong>{fmtPct(row.lowRatingPct)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Memory utility distribution */}
          <div style={s.section}>
            <h2 style={s.sectionHeading}>Memory Utility Distribution</h2>
            <p style={s.sectionSubheading}>
              Are memories being retrieved or just accumulating? Average utility score is a proxy for retrieval quality — computed by the decay cron from retrieval frequency and feedback signals.
            </p>
            <div style={s.utilityRow}>
              <div style={s.utilityCard}>
                <div style={s.statLabel}>Ever Retrieved</div>
                <div style={s.utilityValue}>{fmtNum(stats.utilityDistribution.retrieved)}</div>
                <div style={s.utilityPct}>{fmtPct(stats.utilityDistribution.pctRetrieved)} of active</div>
                {stats.utilityDistribution.avgUtilityRetrieved !== null && (
                  <div style={s.statSub}>
                    avg utility: {stats.utilityDistribution.avgUtilityRetrieved.toFixed(3)}
                  </div>
                )}
              </div>
              <div style={s.utilityCard}>
                <div style={s.statLabel}>Never Retrieved</div>
                <div style={{ ...s.utilityValue, color: stats.utilityDistribution.pctUnused > 70 ? '#b91c1c' : '#111' }}>
                  {fmtNum(stats.utilityDistribution.unused)}
                </div>
                <div style={s.utilityPct}>{fmtPct(stats.utilityDistribution.pctUnused)} of active</div>
                {stats.utilityDistribution.avgUtilityUnused !== null && (
                  <div style={s.statSub}>
                    avg utility: {stats.utilityDistribution.avgUtilityUnused.toFixed(3)}
                  </div>
                )}
              </div>
              <div style={s.utilityCard}>
                <div style={s.statLabel}>Total Active</div>
                <div style={s.utilityValue}>{fmtNum(stats.utilityDistribution.totalActive)}</div>
                <div style={s.statSub}>memories in store</div>
              </div>
            </div>
            {/* Retrieval bar */}
            {stats.utilityDistribution.totalActive > 0 && (
              <div style={s.utilityBarWrap}>
                <div style={s.utilityBarLabel}>Retrieved</div>
                <div style={s.utilityBarTrack}>
                  <div
                    style={{
                      ...s.utilityBarFill,
                      width: `${stats.utilityDistribution.pctRetrieved}%`,
                    }}
                  />
                </div>
                <div style={s.utilityBarLabel}>Unused</div>
              </div>
            )}
          </div>

          {/* Threshold configuration */}
          <div style={s.section}>
            <h2 style={s.sectionHeading}>Alert Thresholds</h2>
            <p style={s.sectionSubheading}>
              Configure when each quality alert fires. Changes take effect immediately.
            </p>
            <div style={s.thresholdGrid}>
              <div style={s.thresholdRow}>
                <label style={s.thresholdLabel}>
                  Abstention drop alert (%)
                  <span style={s.thresholdHint}>Alert if abstention rate drops this much vs. prior week</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={abstentionInput}
                  onChange={(e) => { setAbstentionInput(e.target.value); setThresholdsSaved(false) }}
                  style={s.thresholdInput}
                />
              </div>
              <div style={s.thresholdRow}>
                <label style={s.thresholdLabel}>
                  Low-rating alert (%)
                  <span style={s.thresholdHint}>Alert if this % of rated answers are negative</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={lowRatingInput}
                  onChange={(e) => { setLowRatingInput(e.target.value); setThresholdsSaved(false) }}
                  style={s.thresholdInput}
                />
              </div>
              <div style={s.thresholdRow}>
                <label style={s.thresholdLabel}>
                  Daily miss count alert
                  <span style={s.thresholdHint}>Alert if any single day exceeds this many misses</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={missDailyInput}
                  onChange={(e) => { setMissDailyInput(e.target.value); setThresholdsSaved(false) }}
                  style={s.thresholdInput}
                />
              </div>
              <div style={s.thresholdRow}>
                <label style={s.thresholdLabel}>
                  Unused memory alert (%)
                  <span style={s.thresholdHint}>Alert if this % of active memories have never been retrieved</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={unusedInput}
                  onChange={(e) => { setUnusedInput(e.target.value); setThresholdsSaved(false) }}
                  style={s.thresholdInput}
                />
              </div>
            </div>
            <div style={s.thresholdActions}>
              <button
                onClick={() => { void saveThresholds() }}
                disabled={savingThresholds}
                style={s.saveBtn}
              >
                {savingThresholds ? 'Saving…' : 'Save thresholds'}
              </button>
              {thresholdsSaved && <span style={s.savedText}>Saved</span>}
            </div>
            {thresholdsError && <div style={{ ...s.errorBox, marginTop: '8px' }}>{thresholdsError}</div>}
          </div>
        </>
      )}
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
  alertCritical: {
    backgroundColor: '#fef2f2',
    border: '1px solid #f87171',
    color: '#991b1b',
    padding: '14px 18px',
    borderRadius: '6px',
    marginBottom: '12px',
    fontSize: '14px',
    fontWeight: 500,
  },
  alertWarning: {
    backgroundColor: '#fffbeb',
    border: '1px solid #fbbf24',
    color: '#92400e',
    padding: '14px 18px',
    borderRadius: '6px',
    marginBottom: '12px',
    fontSize: '14px',
    fontWeight: 500,
  },
  cardRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
    marginBottom: '16px',
  },
  statCard: {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '20px',
  },
  statLabel: {
    fontSize: '12px',
    color: '#6b7280',
    fontWeight: 500,
    marginBottom: '6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  statValue: { fontSize: '28px', fontWeight: 700, color: '#111', lineHeight: 1, marginBottom: '6px' },
  statSub: { fontSize: '12px', color: '#9ca3af' },
  section: {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '16px',
  },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '0',
  },
  sectionHeading: { fontSize: '15px', fontWeight: 600, color: '#111', margin: '0 0 4px' },
  sectionSubheading: { fontSize: '12px', color: '#9ca3af', margin: '0 0 16px' },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
  th: {
    padding: '8px 12px',
    textAlign: 'left' as const,
    fontSize: '11px',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    borderBottom: '1px solid #e5e7eb',
    whiteSpace: 'nowrap' as const,
  },
  thRight: { textAlign: 'right' as const },
  td: { padding: '9px 12px', color: '#374151', borderBottom: '1px solid #f3f4f6' },
  tdRight: { textAlign: 'right' as const },
  trEven: { backgroundColor: '#f9fafb' },
  emptyText: { color: '#9ca3af', fontSize: '13px', margin: '8px 0 0' },
  utilityRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
    marginBottom: '16px',
  },
  utilityCard: {
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    padding: '14px',
  },
  utilityValue: { fontSize: '24px', fontWeight: 700, color: '#111', marginBottom: '2px', marginTop: '4px' },
  utilityPct: { fontSize: '13px', color: '#6b7280', marginBottom: '4px' },
  utilityBarWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '12px',
    color: '#6b7280',
  },
  utilityBarTrack: {
    flex: 1,
    height: '10px',
    backgroundColor: '#fee2e2',
    borderRadius: '5px',
    overflow: 'hidden',
  },
  utilityBarFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: '5px',
    transition: 'width 0.3s',
  },
  utilityBarLabel: { whiteSpace: 'nowrap' as const, fontSize: '12px', color: '#6b7280' },
  thresholdGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '14px',
    marginBottom: '16px',
  },
  thresholdRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
  },
  thresholdLabel: {
    fontSize: '13px',
    color: '#374151',
    fontWeight: 500,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  thresholdHint: {
    fontSize: '11px',
    color: '#9ca3af',
    fontWeight: 400,
  },
  thresholdInput: {
    padding: '7px 10px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    width: '100px',
    outline: 'none',
    textAlign: 'right' as const,
  },
  thresholdActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  saveBtn: {
    padding: '7px 16px',
    fontSize: '13px',
    backgroundColor: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  savedText: { fontSize: '13px', color: '#15803d', fontWeight: 500 },
}
