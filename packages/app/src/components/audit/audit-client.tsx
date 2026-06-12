'use client'

import { useState, useEffect } from 'react'

interface AuditEvent {
  id: string
  action_type: string
  actor_id: string
  actor_email: string
  actor_type: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown> | null
  ip_address: unknown
  created_at: string
}

interface AuditResponse {
  events: AuditEvent[]
  total: number
  actionTypes: string[]
}

interface User {
  id: string
  email: string
}

const PAGE_SIZE = 50

function fmtTs(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return '—'
  return s.length > n ? s.slice(0, n) + '…' : s
}

export function AuditClient() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [total, setTotal] = useState(0)
  const [actionTypes, setActionTypes] = useState<string[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)

  // Filter state
  const [userId, setUserId] = useState('')
  const [actionType, setActionType] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    void fetchUsers()
    void fetchEvents(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchUsers() {
    try {
      const res = await fetch('/api/admin/users?limit=500')
      if (!res.ok) return
      const data = await res.json() as { users?: User[] }
      setUsers(data.users ?? [])
    } catch {
      // non-fatal
    }
  }

  async function fetchEvents(newOffset: number) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(newOffset) })
      if (userId) params.set('userId', userId)
      if (actionType) params.set('actionType', actionType)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      const res = await fetch(`/api/admin/audit?${params.toString()}`)
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Failed to load audit log')
        return
      }
      const data = await res.json() as AuditResponse
      setEvents(data.events)
      setTotal(data.total)
      if (data.actionTypes.length > 0) setActionTypes(data.actionTypes)
      setOffset(newOffset)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  function applyFilters() {
    void fetchEvents(0)
  }

  function clearFilters() {
    setUserId('')
    setActionType('')
    setStartDate('')
    setEndDate('')
    // Fetch with empty params by passing state directly won't work due to closure, so re-fetch after state settles
    setTimeout(() => { void fetchEvents(0) }, 0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1
  const showingStart = total === 0 ? 0 : offset + 1
  const showingEnd = Math.min(offset + PAGE_SIZE, total)

  return (
    <div style={s.container}>
      <div style={s.titleRow}>
        <h1 style={s.heading}>Audit Log</h1>
        <div style={s.badge}>{total.toLocaleString()} total events</div>
      </div>

      {/* Filters */}
      <div style={s.filterBar}>
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          style={s.filterSelect}
        >
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.email}</option>
          ))}
        </select>

        <select
          value={actionType}
          onChange={(e) => setActionType(e.target.value)}
          style={s.filterSelect}
        >
          <option value="">All action types</option>
          {actionTypes.map((at) => (
            <option key={at} value={at}>{at}</option>
          ))}
        </select>

        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={s.filterInput}
          placeholder="Start date"
        />

        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          style={s.filterInput}
          placeholder="End date"
        />

        <button onClick={applyFilters} disabled={loading} style={s.applyBtn}>
          Apply
        </button>
        <button onClick={clearFilters} disabled={loading} style={s.clearBtn}>
          Clear
        </button>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}
      {loading && <div style={s.loadingText}>Loading…</div>}

      {/* Table */}
      <div style={s.section}>
        {events.length === 0 && !loading ? (
          <p style={s.emptyText}>No audit events match the current filters.</p>
        ) : (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Timestamp</th>
                  <th style={s.th}>Actor</th>
                  <th style={s.th}>Actor Type</th>
                  <th style={s.th}>Action</th>
                  <th style={s.th}>Target Type</th>
                  <th style={s.th}>Target ID</th>
                  <th style={s.th}>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev, i) => (
                  <tr key={ev.id} style={i % 2 === 0 ? s.trEven : {}}>
                    <td style={{ ...s.td, whiteSpace: 'nowrap' as const }}>{fmtTs(ev.created_at)}</td>
                    <td style={s.td}>{truncate(ev.actor_email, 40)}</td>
                    <td style={s.td}>{ev.actor_type}</td>
                    <td style={s.td}><code style={s.code}>{ev.action_type}</code></td>
                    <td style={s.td}>{ev.target_type ?? '—'}</td>
                    <td style={{ ...s.td, fontFamily: 'monospace', fontSize: '11px' }}>
                      {ev.target_id ? truncate(ev.target_id, 20) : '—'}
                    </td>
                    <td style={{ ...s.td, fontFamily: 'monospace', fontSize: '11px', color: '#6b7280' }}>
                      {ev.metadata ? truncate(JSON.stringify(ev.metadata), 80) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > 0 && (
          <div style={s.paginationRow}>
            <span style={s.paginationInfo}>
              Showing {showingStart}–{showingEnd} of {total.toLocaleString()}
            </span>
            <div style={s.paginationBtns}>
              <button
                onClick={() => { void fetchEvents(offset - PAGE_SIZE) }}
                disabled={offset === 0 || loading}
                style={s.pageBtn}
              >
                Previous
              </button>
              <span style={s.pageIndicator}>Page {currentPage} of {totalPages}</span>
              <button
                onClick={() => { void fetchEvents(offset + PAGE_SIZE) }}
                disabled={offset + PAGE_SIZE >= total || loading}
                style={s.pageBtn}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <p style={s.footerNote}>
        Audit log is append-only. Each event records references and action metadata only — never raw content.
        Query text and agent reasoning are stored in Agent Activity (permission-gated to Manager+).
      </p>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { maxWidth: '1100px' },
  titleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' },
  heading: { fontSize: '22px', fontWeight: 700, color: '#111', margin: 0 },
  badge: {
    backgroundColor: '#f3f4f6', color: '#374151', fontSize: '13px',
    fontWeight: 500, padding: '4px 10px', borderRadius: '12px',
  },
  filterBar: {
    display: 'flex', gap: '8px', flexWrap: 'wrap' as const, alignItems: 'center',
    marginBottom: '16px', padding: '14px 16px',
    backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
  },
  filterSelect: {
    padding: '7px 10px', fontSize: '13px', border: '1px solid #d1d5db',
    borderRadius: '4px', backgroundColor: '#fff', color: '#374151', minWidth: '160px',
  },
  filterInput: {
    padding: '7px 10px', fontSize: '13px', border: '1px solid #d1d5db',
    borderRadius: '4px', color: '#374151',
  },
  applyBtn: {
    padding: '7px 16px', fontSize: '13px', backgroundColor: '#111', color: '#fff',
    border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600,
  },
  clearBtn: {
    padding: '7px 14px', fontSize: '13px', backgroundColor: '#fff', color: '#374151',
    border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer',
  },
  errorBox: {
    backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
    padding: '12px 16px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px',
  },
  loadingText: { color: '#888', fontSize: '14px', marginBottom: '16px' },
  section: {
    backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
    padding: '20px', marginBottom: '16px',
  },
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
  code: {
    fontFamily: 'monospace', fontSize: '12px',
    backgroundColor: '#f3f4f6', padding: '1px 4px', borderRadius: '3px',
  },
  paginationRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb',
  },
  paginationInfo: { fontSize: '13px', color: '#6b7280' },
  paginationBtns: { display: 'flex', gap: '8px', alignItems: 'center' },
  pageBtn: {
    padding: '6px 14px', fontSize: '13px', border: '1px solid #d1d5db',
    borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer', color: '#374151',
  },
  pageIndicator: { fontSize: '13px', color: '#374151' },
  footerNote: { fontSize: '12px', color: '#9ca3af', marginTop: '8px' },
}
