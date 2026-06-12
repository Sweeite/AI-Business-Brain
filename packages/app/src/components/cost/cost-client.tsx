'use client'

import { useState, useEffect } from 'react'

interface SpendDay {
  day: string
  cost_usd: number
}

interface SpendUser {
  userId: string
  email: string
  cost_usd: number
  tokensIn: number
  tokensOut: number
}

interface SpendBreakdown {
  eventType?: string
  model?: string
  cost_usd: number
}

interface ToolCall {
  toolName: string
  count: number
}

interface CostStats {
  spendByDay: SpendDay[]
  spendByUser: SpendUser[]
  spendByEventType: SpendBreakdown[]
  spendByModel: SpendBreakdown[]
  toolCallVolume: ToolCall[]
  totalCost: number
  totalTokensIn: number
  totalTokensOut: number
  avgCostPerDay: number
  storageStats: { memoryCount: number; proposalCount: number; chunkCount: number }
  budgetUsd: number | null
  alertThresholdPct: number
}

function fmtCost(n: number): string {
  if (n === 0) return '$0.00'
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

function fmtNum(n: number): string {
  return n.toLocaleString()
}

function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function BarChart({ items, labelKey, valueKey }: {
  items: Record<string, unknown>[]
  labelKey: string
  valueKey: string
}) {
  const max = Math.max(1, ...items.map((i) => i[valueKey] as number))
  return (
    <div style={s.barGrid}>
      {items.map((item, i) => {
        const val = item[valueKey] as number
        const label = item[labelKey] as string
        const pct = Math.round((val / max) * 100)
        return (
          <div key={i} style={s.barRow}>
            <div style={s.barLabel} title={label}>{label}</div>
            <div style={s.barWrap}>
              <div style={{ ...s.barFill, width: `${pct}%` }} />
            </div>
            <div style={s.barValue}>{fmtCost(val)}</div>
          </div>
        )
      })}
    </div>
  )
}

function ToolBarChart({ items }: { items: ToolCall[] }) {
  const max = Math.max(1, ...items.map((i) => i.count))
  return (
    <div style={s.barGrid}>
      {items.map((item, i) => {
        const pct = Math.round((item.count / max) * 100)
        return (
          <div key={i} style={s.barRow}>
            <div style={s.barLabel}>{item.toolName}</div>
            <div style={s.barWrap}>
              <div style={{ ...s.barFill, width: `${pct}%`, backgroundColor: '#6366f1' }} />
            </div>
            <div style={s.barValue}>{fmtNum(item.count)}</div>
          </div>
        )
      })}
    </div>
  )
}

export function CostClient() {
  const [period, setPeriod] = useState<7 | 30 | 90>(30)
  const [stats, setStats] = useState<CostStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [budgetInput, setBudgetInput] = useState('')
  const [savingBudget, setSavingBudget] = useState(false)
  const [budgetSaved, setBudgetSaved] = useState(false)
  const [budgetError, setBudgetError] = useState<string | null>(null)

  useEffect(() => {
    void fetchStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  async function fetchStats() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/cost/stats?period=${period}`)
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Failed to load stats')
        return
      }
      const data = await res.json() as CostStats
      setStats(data)
      setBudgetInput(data.budgetUsd != null ? String(data.budgetUsd) : '')
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  async function saveBudget() {
    setSavingBudget(true)
    setBudgetError(null)
    setBudgetSaved(false)
    const raw = budgetInput.trim()
    const budget_usd = raw === '' ? null : parseFloat(raw)
    if (budget_usd !== null && (isNaN(budget_usd) || budget_usd <= 0)) {
      setBudgetError('Enter a positive number or leave blank to disable')
      setSavingBudget(false)
      return
    }
    try {
      const res = await fetch('/api/admin/cost/budget', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget_usd }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setBudgetError(data.error ?? 'Save failed')
        return
      }
      setBudgetSaved(true)
      void fetchStats()
    } catch {
      setBudgetError('Network error')
    } finally {
      setSavingBudget(false)
    }
  }

  const isOverBudget =
    stats?.budgetUsd != null &&
    stats.totalCost >= stats.budgetUsd * (stats.alertThresholdPct / 100)

  const budgetPct =
    stats?.budgetUsd != null && stats.budgetUsd > 0
      ? Math.round((stats.totalCost / stats.budgetUsd) * 100)
      : null

  // Only show days that have any spend in the table, most recent first
  const nonZeroDays = (stats?.spendByDay ?? [])
    .filter((r) => r.cost_usd > 0)
    .slice()
    .reverse()
    .slice(0, 30)

  return (
    <div style={s.container}>
      <div style={s.titleRow}>
        <h1 style={s.heading}>Cost Monitor</h1>
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

      {isOverBudget && stats && (
        <div style={s.alertBanner}>
          <strong>Budget alert:</strong> Spend is at {budgetPct}% of your ${stats.budgetUsd?.toFixed(2)} budget.
          Current period: {fmtCost(stats.totalCost)}. Review usage below.
        </div>
      )}

      {stats && !isOverBudget && budgetPct !== null && (
        <div style={s.budgetBar}>
          Budget: {fmtCost(stats.totalCost)} / ${stats.budgetUsd?.toFixed(2)} ({budgetPct}%)
          <div style={s.budgetTrack}>
            <div style={{ ...s.budgetFill, width: `${Math.min(100, budgetPct)}%` }} />
          </div>
        </div>
      )}

      {stats && (
        <>
          {/* Stat cards */}
          <div style={s.cardRow}>
            <div style={s.statCard}>
              <div style={s.statLabel}>Total Spend</div>
              <div style={s.statValue}>{fmtCost(stats.totalCost)}</div>
              <div style={s.statSub}>last {period} days</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statLabel}>Input Tokens</div>
              <div style={s.statValue}>{fmtNum(stats.totalTokensIn)}</div>
              <div style={s.statSub}>prompt tokens</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statLabel}>Output Tokens</div>
              <div style={s.statValue}>{fmtNum(stats.totalTokensOut)}</div>
              <div style={s.statSub}>completion tokens</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statLabel}>Avg / Day</div>
              <div style={s.statValue}>{fmtCost(stats.avgCostPerDay)}</div>
              <div style={s.statSub}>average daily spend</div>
            </div>
          </div>

          {/* Spend by day */}
          <div style={s.section}>
            <h2 style={s.sectionHeading}>Spend by Day</h2>
            <p style={s.sectionSubheading}>Days with no spend are omitted. Showing up to last 30 active days.</p>
            {nonZeroDays.length === 0 ? (
              <p style={s.emptyText}>No spend recorded in this period.</p>
            ) : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Date</th>
                      <th style={{ ...s.th, ...s.thRight }}>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nonZeroDays.map((row, i) => (
                      <tr key={i} style={i % 2 === 0 ? s.trEven : {}}>
                        <td style={s.td}>{shortDate(row.day)}</td>
                        <td style={{ ...s.td, ...s.tdRight }}>{fmtCost(row.cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Spend breakdown */}
          <div style={s.twoCol}>
            <div style={s.section}>
              <h2 style={s.sectionHeading}>By Event Type</h2>
              {stats.spendByEventType.length === 0 ? (
                <p style={s.emptyText}>No events in this period.</p>
              ) : (
                <BarChart
                  items={stats.spendByEventType as unknown as Record<string, unknown>[]}
                  labelKey="eventType"
                  valueKey="cost_usd"
                />
              )}
            </div>
            <div style={s.section}>
              <h2 style={s.sectionHeading}>By Model</h2>
              {stats.spendByModel.length === 0 ? (
                <p style={s.emptyText}>No model usage in this period.</p>
              ) : (
                <BarChart
                  items={stats.spendByModel as unknown as Record<string, unknown>[]}
                  labelKey="model"
                  valueKey="cost_usd"
                />
              )}
            </div>
          </div>

          {/* Per-user cost */}
          <div style={s.section}>
            <h2 style={s.sectionHeading}>Per-User Cost</h2>
            <p style={s.sectionSubheading}>Sorted by spend descending. System includes all cron and ingestion jobs.</p>
            {stats.spendByUser.length === 0 ? (
              <p style={s.emptyText}>No spend recorded in this period.</p>
            ) : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>User</th>
                      <th style={{ ...s.th, ...s.thRight }}>Input tokens</th>
                      <th style={{ ...s.th, ...s.thRight }}>Output tokens</th>
                      <th style={{ ...s.th, ...s.thRight }}>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.spendByUser.map((row, i) => (
                      <tr key={i} style={i % 2 === 0 ? s.trEven : {}}>
                        <td style={s.td}>{row.email}</td>
                        <td style={{ ...s.td, ...s.tdRight }}>{fmtNum(row.tokensIn)}</td>
                        <td style={{ ...s.td, ...s.tdRight }}>{fmtNum(row.tokensOut)}</td>
                        <td style={{ ...s.td, ...s.tdRight }}><strong>{fmtCost(row.cost_usd)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Tool call volume */}
          <div style={s.section}>
            <h2 style={s.sectionHeading}>Tool Call Volume</h2>
            <p style={s.sectionSubheading}>Tool calls made by agents in this period (sampled from last 500 runs)</p>
            {stats.toolCallVolume.length === 0 ? (
              <p style={s.emptyText}>No tool calls recorded in this period.</p>
            ) : (
              <ToolBarChart items={stats.toolCallVolume} />
            )}
          </div>

          {/* Storage stats */}
          <div style={s.section}>
            <h2 style={s.sectionHeading}>Storage</h2>
            <div style={s.storageRow}>
              <div style={s.storageCard}>
                <div style={s.statLabel}>Active Memories</div>
                <div style={s.storageValue}>{fmtNum(stats.storageStats.memoryCount)}</div>
                <div style={s.statSub}>in memories table</div>
              </div>
              <div style={s.storageCard}>
                <div style={s.statLabel}>Pending Proposals</div>
                <div style={s.storageValue}>{fmtNum(stats.storageStats.proposalCount)}</div>
                <div style={s.statSub}>pending + pending_review</div>
              </div>
              <div style={s.storageCard}>
                <div style={s.statLabel}>Chunks</div>
                <div style={s.storageValue}>{fmtNum(stats.storageStats.chunkCount)}</div>
                <div style={s.statSub}>index-in-place content</div>
              </div>
            </div>
          </div>

          {/* Budget configuration */}
          <div style={s.section}>
            <h2 style={s.sectionHeading}>Budget Alert</h2>
            <p style={s.sectionSubheading}>
              Alert fires when spend reaches {stats.alertThresholdPct}% of your monthly budget.
              Leave blank to disable.
            </p>
            <div style={s.budgetForm}>
              <span style={s.budgetPrefix}>$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 100"
                value={budgetInput}
                onChange={(e) => { setBudgetInput(e.target.value); setBudgetSaved(false) }}
                style={s.budgetInput}
              />
              <button
                onClick={() => { void saveBudget() }}
                disabled={savingBudget}
                style={s.saveBtn}
              >
                {savingBudget ? 'Saving…' : 'Save'}
              </button>
              {budgetSaved && <span style={s.savedText}>Saved</span>}
            </div>
            {budgetError && <div style={{ ...s.errorBox, marginTop: '8px' }}>{budgetError}</div>}
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
  alertBanner: {
    backgroundColor: '#fef2f2',
    border: '1px solid #f87171',
    color: '#991b1b',
    padding: '14px 18px',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '14px',
    fontWeight: 500,
  },
  budgetBar: {
    fontSize: '13px',
    color: '#374151',
    marginBottom: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  budgetTrack: {
    height: '8px',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  budgetFill: {
    height: '100%',
    backgroundColor: '#f59e0b',
    borderRadius: '4px',
    transition: 'width 0.3s',
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
  statLabel: { fontSize: '12px', color: '#6b7280', fontWeight: 500, marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
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
  barGrid: { display: 'flex', flexDirection: 'column' as const, gap: '10px' },
  barRow: {
    display: 'grid',
    gridTemplateColumns: '160px 1fr 72px',
    alignItems: 'center',
    gap: '12px',
  },
  barLabel: {
    fontSize: '13px',
    color: '#374151',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  barWrap: {
    height: '16px',
    backgroundColor: '#f3f4f6',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: '4px',
    transition: 'width 0.3s',
    minWidth: '2px',
  },
  barValue: { fontSize: '13px', color: '#6b7280', textAlign: 'right' as const },
  storageRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  },
  storageCard: {
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    padding: '14px',
  },
  storageValue: { fontSize: '24px', fontWeight: 700, color: '#111', marginBottom: '2px', marginTop: '4px' },
  budgetForm: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  budgetPrefix: { fontSize: '16px', color: '#374151', fontWeight: 600 },
  budgetInput: {
    padding: '7px 10px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    width: '140px',
    outline: 'none',
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
