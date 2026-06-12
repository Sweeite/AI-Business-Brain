'use client'

import { useState, useEffect } from 'react'
import { ConfirmModal } from '@/components/confirm-modal'

interface Connection {
  id: string
  connector_type: string
  scope: string
  status: string
  last_synced_at: string | null
  webhook_expires_at: string | null
  owner_user_id: string | null
  ownerEmail: string | null
  created_at: string
  exclusion_rules: { emails?: string[]; domains?: string[] } | null
}

interface IngestionStats {
  processed: number
  indexed: number
  proposed: number
  dropped: number
}

interface ConnectorsData {
  connections: Connection[]
  ingestionStats: Record<string, IngestionStats>
}

type Tab = 'all' | 'per-user' | 'exclusion-rules'

function fmtTs(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })
}

function statusBadge(status: string): { style: React.CSSProperties; label: string } {
  if (status === 'active') return { style: { ...s.badge, backgroundColor: '#dcfce7', color: '#15803d' }, label: 'Active' }
  if (status === 'expired') return { style: { ...s.badge, backgroundColor: '#fef9c3', color: '#a16207' }, label: 'Expired' }
  if (status === 'revoked') return { style: { ...s.badge, backgroundColor: '#f3f4f6', color: '#6b7280' }, label: 'Revoked' }
  return { style: { ...s.badge, backgroundColor: '#fee2e2', color: '#b91c1c' }, label: 'Error' }
}

export function ConnectorsClient() {
  const [data, setData] = useState<ConnectorsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('all')

  // Revoke confirm modal state
  const [revokeTarget, setRevokeTarget] = useState<Connection | null>(null)
  const [revoking, setRevoking] = useState(false)

  // Exclusion rule edit state: map of connId → { emailsText, domainsText, saving, saved, error }
  const [exclusionEdits, setExclusionEdits] = useState<Record<string, {
    emailsText: string
    domainsText: string
    saving: boolean
    saved: boolean
    error: string | null
  }>>({})

  useEffect(() => {
    void fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/connectors')
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setError(d.error ?? 'Failed to load connectors')
        return
      }
      const d = await res.json() as ConnectorsData
      setData(d)
      // Init exclusion edits
      const edits: typeof exclusionEdits = {}
      for (const c of d.connections) {
        edits[c.id] = {
          emailsText: (c.exclusion_rules?.emails ?? []).join(', '),
          domainsText: (c.exclusion_rules?.domains ?? []).join(', '),
          saving: false,
          saved: false,
          error: null,
        }
      }
      setExclusionEdits(edits)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  async function revokeConnection(conn: Connection) {
    setRevoking(true)
    try {
      const res = await fetch(`/api/admin/connectors/${conn.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setError(d.error ?? 'Revoke failed')
        return
      }
      setRevokeTarget(null)
      void fetchData()
    } catch {
      setError('Network error')
    } finally {
      setRevoking(false)
    }
  }

  async function saveExclusionRules(connId: string) {
    const edit = exclusionEdits[connId]
    if (!edit) return
    setExclusionEdits((prev) => ({ ...prev, [connId]: { ...prev[connId], saving: true, error: null, saved: false } }))
    try {
      const emails = edit.emailsText.split(',').map((e) => e.trim()).filter(Boolean)
      const domains = edit.domainsText.split(',').map((d) => d.trim()).filter(Boolean)
      const exclusion_rules = emails.length === 0 && domains.length === 0
        ? null
        : { ...(emails.length ? { emails } : {}), ...(domains.length ? { domains } : {}) }

      const res = await fetch(`/api/admin/connectors/${connId}/exclusion-rules`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exclusion_rules }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setExclusionEdits((prev) => ({ ...prev, [connId]: { ...prev[connId], saving: false, error: d.error ?? 'Save failed' } }))
        return
      }
      setExclusionEdits((prev) => ({ ...prev, [connId]: { ...prev[connId], saving: false, saved: true } }))
    } catch {
      setExclusionEdits((prev) => ({ ...prev, [connId]: { ...prev[connId], saving: false, error: 'Network error' } }))
    }
  }

  const connections = data?.connections ?? []

  // Per-user grouping
  const perUserMap = new Map<string, Connection[]>()
  const orgConnections: Connection[] = []
  for (const c of connections) {
    if (c.scope === 'per-user' && c.owner_user_id) {
      const key = c.ownerEmail ?? c.owner_user_id
      perUserMap.set(key, [...(perUserMap.get(key) ?? []), c])
    } else {
      orgConnections.push(c)
    }
  }

  return (
    <div style={s.container}>
      <div style={s.titleRow}>
        <h1 style={s.heading}>Connector Management</h1>
        <button onClick={() => { void fetchData() }} disabled={loading} style={s.refreshBtn}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}
      {loading && !data && <div style={s.loadingText}>Loading…</div>}

      {/* Ingestion stats */}
      {data && (
        <div style={s.statsRow}>
          {Object.entries(data.ingestionStats).map(([connType, stats]) => (
            <div key={connType} style={s.statsCard}>
              <div style={s.statsLabel}>{connType === 'gmail' ? 'Gmail' : 'Google Drive'} (30d)</div>
              <div style={s.statsGrid}>
                <div style={s.statsItem}><span style={s.statNum}>{stats.processed}</span><br /><span style={s.statSub}>Processed</span></div>
                <div style={s.statsItem}><span style={s.statNum}>{stats.indexed}</span><br /><span style={s.statSub}>Indexed</span></div>
                <div style={s.statsItem}><span style={s.statNum}>{stats.proposed}</span><br /><span style={s.statSub}>Proposed</span></div>
                <div style={s.statsItem}><span style={s.statNum}>{stats.dropped}</span><br /><span style={s.statSub}>Dropped</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={s.tabBar}>
        {(['all', 'per-user', 'exclusion-rules'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ ...s.tabBtn, ...(tab === t ? s.tabBtnActive : {}) }}
          >
            {t === 'all' ? 'All Connectors' : t === 'per-user' ? 'Per-User Status' : 'Exclusion Rules'}
          </button>
        ))}
      </div>

      {/* All Connectors tab */}
      {tab === 'all' && (
        <div style={s.section}>
          <div style={s.addRow}>
            <p style={{ ...s.sectionSub, margin: 0, flex: 1 }}>All company-wide and per-user connector connections.</p>
            <div style={s.addBtns}>
              <a href="/api/connectors/gmail/connect" style={s.addBtn}>+ Connect Gmail</a>
              <a href="/api/connectors/drive/connect" style={s.addBtn}>+ Connect Drive</a>
            </div>
          </div>
          <p style={s.addNote}>
            Each connector is per-user — these buttons connect <strong>your</strong> Google account.
            Other users connect via their onboarding flow or account settings.
          </p>
          {connections.length === 0 && !loading ? (
            <p style={s.emptyText}>No connections yet. Use the buttons above to add your first connector.</p>
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
                    <th style={s.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {connections.map((c, i) => {
                    const { style: badgeStyle, label } = statusBadge(c.status)
                    return (
                      <tr key={c.id} style={i % 2 === 0 ? s.trEven : {}}>
                        <td style={s.td}>{c.connector_type}</td>
                        <td style={s.td}>{c.scope}</td>
                        <td style={s.td}>{c.ownerEmail ?? '—'}</td>
                        <td style={s.td}><span style={badgeStyle}>{label}</span></td>
                        <td style={s.td}>{c.last_synced_at ? fmtTs(c.last_synced_at) : '—'}</td>
                        <td style={s.td}>{c.webhook_expires_at ? fmtTs(c.webhook_expires_at) : '—'}</td>
                        <td style={s.td}>
                          {c.status !== 'revoked' && (
                            <button
                              onClick={() => setRevokeTarget(c)}
                              style={s.revokeBtn}
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Per-User Status tab */}
      {tab === 'per-user' && (
        <div style={s.section}>
          <p style={s.sectionSub}>
            Connection status grouped by user. Users with expired or errored connections need to reconnect.
          </p>

          {orgConnections.length > 0 && (
            <div style={s.userGroup}>
              <div style={s.userGroupHeader}>Company-wide (org scope)</div>
              {orgConnections.map((c) => {
                const { style: badgeStyle, label } = statusBadge(c.status)
                return (
                  <div key={c.id} style={s.connRow}>
                    <span style={s.connType}>{c.connector_type}</span>
                    <span style={badgeStyle}>{label}</span>
                    <span style={s.connMeta}>{c.last_synced_at ? `Last sync: ${fmtTs(c.last_synced_at)}` : 'Never synced'}</span>
                  </div>
                )
              })}
            </div>
          )}

          {perUserMap.size === 0 && orgConnections.length === 0 && (
            <p style={s.emptyText}>No connections found.</p>
          )}

          {Array.from(perUserMap.entries()).map(([email, conns]) => (
            <div key={email} style={s.userGroup}>
              <div style={s.userGroupHeader}>{email}</div>
              {conns.map((c) => {
                const { style: badgeStyle, label } = statusBadge(c.status)
                return (
                  <div key={c.id} style={s.connRow}>
                    <span style={s.connType}>{c.connector_type}</span>
                    <span style={badgeStyle}>{label}</span>
                    {(c.status === 'expired' || c.status === 'error') && (
                      <span style={s.reconnectNote}>Needs reconnect</span>
                    )}
                    <span style={s.connMeta}>{c.last_synced_at ? `Last sync: ${fmtTs(c.last_synced_at)}` : 'Never synced'}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* Exclusion Rules tab */}
      {tab === 'exclusion-rules' && (
        <div>
          <p style={s.sectionSubStandalone}>
            Configure do-not-ingest rules per connector. Emails and domains listed here will be excluded from ingestion at Gate 1.
          </p>
          {connections.filter((c) => c.status !== 'revoked').length === 0 && !loading && (
            <div style={s.section}>
              <p style={s.emptyText}>No active connections to configure.</p>
              <p style={{ ...s.emptyText, marginTop: '4px' }}>
                Connect Gmail or Drive first (All Connectors tab), then return here to set exclusion rules.
              </p>
            </div>
          )}
          {connections.filter((c) => c.status !== 'revoked').map((c) => {
            const edit = exclusionEdits[c.id]
            if (!edit) return null
            return (
              <div key={c.id} style={s.exclusionCard}>
                <div style={s.exclusionHeader}>
                  <strong>{c.connector_type}</strong>
                  {c.ownerEmail && <span style={s.exclusionOwner}>{c.ownerEmail}</span>}
                  <span style={s.exclusionScope}>{c.scope}</span>
                </div>
                <div style={s.exclusionFields}>
                  <div style={s.exclusionField}>
                    <label style={s.fieldLabel}>
                      Excluded emails
                      <span style={s.fieldHint}>Comma-separated. e.g. hr@company.com, legal@company.com</span>
                    </label>
                    <textarea
                      value={edit.emailsText}
                      onChange={(e) => {
                        setExclusionEdits((prev) => ({ ...prev, [c.id]: { ...prev[c.id], emailsText: e.target.value, saved: false } }))
                      }}
                      style={s.textarea}
                      rows={2}
                    />
                  </div>
                  <div style={s.exclusionField}>
                    <label style={s.fieldLabel}>
                      Excluded domains
                      <span style={s.fieldHint}>Comma-separated. e.g. personal.com, competitor.com</span>
                    </label>
                    <textarea
                      value={edit.domainsText}
                      onChange={(e) => {
                        setExclusionEdits((prev) => ({ ...prev, [c.id]: { ...prev[c.id], domainsText: e.target.value, saved: false } }))
                      }}
                      style={s.textarea}
                      rows={2}
                    />
                  </div>
                </div>
                <div style={s.exclusionActions}>
                  <button
                    onClick={() => { void saveExclusionRules(c.id) }}
                    disabled={edit.saving}
                    style={s.saveBtn}
                  >
                    {edit.saving ? 'Saving…' : 'Save rules'}
                  </button>
                  {edit.saved && <span style={s.savedText}>Saved</span>}
                  {edit.error && <span style={s.saveError}>{edit.error}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Revoke confirm modal */}
      {revokeTarget && (
        <ConfirmModal
          title="Revoke connector?"
          message={`This will revoke the ${revokeTarget.connector_type} connection${revokeTarget.ownerEmail ? ` for ${revokeTarget.ownerEmail}` : ''}. The connection will stop syncing immediately.`}
          confirmLabel="Revoke"
          dangerous
          loading={revoking}
          onConfirm={() => { void revokeConnection(revokeTarget) }}
          onCancel={() => setRevokeTarget(null)}
        />
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { maxWidth: '960px' },
  titleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' },
  heading: { fontSize: '22px', fontWeight: 700, color: '#111', margin: 0 },
  refreshBtn: {
    padding: '6px 14px', fontSize: '13px', border: '1px solid #d1d5db',
    borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer', color: '#374151',
  },
  errorBox: {
    backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
    padding: '12px 16px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px',
  },
  loadingText: { color: '#888', fontSize: '14px', marginBottom: '16px' },
  statsRow: { display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' as const },
  statsCard: {
    backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
    padding: '16px', flex: '1', minWidth: '200px',
  },
  statsLabel: { fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '12px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' },
  statsItem: { textAlign: 'center' as const },
  statNum: { fontSize: '20px', fontWeight: 700, color: '#111' },
  statSub: { fontSize: '11px', color: '#9ca3af' },
  tabBar: { display: 'flex', gap: '0', marginBottom: '0', borderBottom: '1px solid #e5e7eb' },
  tabBtn: {
    padding: '10px 18px', fontSize: '13px', border: 'none', borderBottom: '2px solid transparent',
    backgroundColor: 'transparent', cursor: 'pointer', color: '#6b7280', fontWeight: 500,
  },
  tabBtnActive: { color: '#111', borderBottomColor: '#111' },
  section: {
    backgroundColor: '#fff', border: '1px solid #e5e7eb', borderTop: 'none',
    borderRadius: '0 0 8px 8px', padding: '20px', marginBottom: '16px',
  },
  sectionSub: { fontSize: '12px', color: '#9ca3af', margin: '0 0 16px' },
  sectionSubStandalone: { fontSize: '13px', color: '#6b7280', margin: '12px 0 16px' },
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
  revokeBtn: {
    padding: '4px 10px', fontSize: '12px', backgroundColor: '#fef2f2', color: '#b91c1c',
    border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer', fontWeight: 500,
  },
  userGroup: {
    marginBottom: '20px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden',
  },
  userGroupHeader: {
    backgroundColor: '#f9fafb', padding: '10px 14px', fontSize: '13px',
    fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb',
  },
  connRow: {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
    borderBottom: '1px solid #f3f4f6', fontSize: '13px',
  },
  connType: { fontWeight: 500, color: '#111', minWidth: '120px' },
  connMeta: { fontSize: '12px', color: '#9ca3af', marginLeft: 'auto' },
  reconnectNote: { fontSize: '12px', color: '#b45309', fontStyle: 'italic' },
  exclusionCard: {
    backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
    padding: '20px', marginBottom: '16px',
  },
  exclusionHeader: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' },
  exclusionOwner: { fontSize: '13px', color: '#6b7280' },
  exclusionScope: {
    fontSize: '11px', color: '#6b7280', backgroundColor: '#f3f4f6',
    padding: '2px 6px', borderRadius: '4px',
  },
  exclusionFields: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' },
  exclusionField: { display: 'flex', flexDirection: 'column' as const, gap: '6px' },
  fieldLabel: {
    fontSize: '13px', color: '#374151', fontWeight: 500,
    display: 'flex', flexDirection: 'column' as const, gap: '2px',
  },
  fieldHint: { fontSize: '11px', color: '#9ca3af', fontWeight: 400 },
  textarea: {
    padding: '8px 10px', fontSize: '13px', border: '1px solid #d1d5db',
    borderRadius: '4px', resize: 'vertical' as const, fontFamily: 'monospace', color: '#374151',
  },
  exclusionActions: { display: 'flex', alignItems: 'center', gap: '10px' },
  saveBtn: {
    padding: '7px 16px', fontSize: '13px', backgroundColor: '#111', color: '#fff',
    border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600,
  },
  savedText: { fontSize: '13px', color: '#15803d', fontWeight: 500 },
  saveError: { fontSize: '13px', color: '#b91c1c' },
  addRow: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' as const },
  addBtns: { display: 'flex', gap: '8px', flexShrink: 0 },
  addBtn: {
    padding: '6px 14px', fontSize: '13px', backgroundColor: '#111', color: '#fff',
    borderRadius: '4px', textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap' as const,
  },
  addNote: { fontSize: '12px', color: '#9ca3af', margin: '0 0 16px' },
}
