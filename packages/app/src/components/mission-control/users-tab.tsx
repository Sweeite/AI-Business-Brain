'use client'

import { useState, useCallback } from 'react'
import type { UserRow, RoleRow } from './mission-control-client'

interface RtbfMemory {
  id: string
  content: string
  type: string
  sensitivity_level: string
  created_at: string
}

interface Props {
  initialUsers: UserRow[]
  roles: RoleRow[]
}

export function UsersTab({ initialUsers, roles }: Props) {
  const [users, setUsers] = useState(initialUsers)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [error, setError] = useState('')

  // RTBF state
  const [rtbfUserId, setRtbfUserId] = useState<string | null>(null)
  const [rtbfMemories, setRtbfMemories] = useState<RtbfMemory[]>([])
  const [rtbfSelected, setRtbfSelected] = useState<Set<string>>(new Set())
  const [rtbfLoading, setRtbfLoading] = useState(false)
  const [rtbfError, setRtbfError] = useState('')

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteError('')
    setInviteSuccess(false)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim() }),
    })
    setInviting(false)
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setInviteError(data.error ?? 'Invite failed')
    } else {
      setInviteSuccess(true)
      setInviteEmail('')
    }
  }

  const handleRoleChange = useCallback(async (userId: string, roleId: string) => {
    setError('')
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: roleId }),
    })
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setError(data.error ?? 'Role change failed')
      return
    }
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== userId) return u
        const role = roles.find((r) => r.id === roleId)
        return { ...u, role_id: roleId, roles: role ? { id: role.id, name: role.name, clearance_level: role.clearance_level } : u.roles }
      })
    )
  }, [roles])

  const handleDeactivate = useCallback(async (userId: string) => {
    if (!confirm('Deactivate this user? Their sessions will be revoked immediately and their routines disabled.')) return
    setError('')
    const res = await fetch(`/api/admin/users/${userId}/deactivate`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setError(data.error ?? 'Deactivation failed')
      return
    }
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_active: false } : u))
  }, [])

  const openRtbf = useCallback(async (userId: string) => {
    setRtbfUserId(userId)
    setRtbfMemories([])
    setRtbfSelected(new Set())
    setRtbfError('')
    setRtbfLoading(true)

    // Flag memories first
    await fetch(`/api/admin/users/${userId}/rtbf`, { method: 'POST' })
    // Then load them
    const res = await fetch(`/api/admin/users/${userId}/rtbf`)
    setRtbfLoading(false)
    if (!res.ok) {
      setRtbfError('Failed to load memories')
      return
    }
    const data = await res.json() as { memories?: RtbfMemory[] }
    setRtbfMemories(data.memories ?? [])
  }, [])

  const handleRtbfInvalidate = async () => {
    if (!rtbfUserId || rtbfSelected.size === 0) return
    setRtbfLoading(true)
    setRtbfError('')
    const res = await fetch(`/api/admin/users/${rtbfUserId}/rtbf/invalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memoryIds: Array.from(rtbfSelected) }),
    })
    setRtbfLoading(false)
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setRtbfError(data.error ?? 'Invalidation failed')
      return
    }
    // Remove invalidated memories from the list
    setRtbfMemories((prev) => prev.filter((m) => !rtbfSelected.has(m.id)))
    setRtbfSelected(new Set())
  }

  return (
    <div>
      {/* Invite section */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Invite User</h3>
        <div style={styles.row}>
          <input
            type="email"
            placeholder="email@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
            style={styles.input}
          />
          <button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} style={styles.btnPrimary}>
            {inviting ? 'Sending…' : 'Send Invite'}
          </button>
        </div>
        {inviteError && <p style={styles.errText}>{inviteError}</p>}
        {inviteSuccess && <p style={styles.okText}>Invite sent.</p>}
      </div>

      {error && <p style={styles.errText}>{error}</p>}

      {/* Users table */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Users ({users.length})</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Role</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td style={styles.td}>{user.email}</td>
                <td style={styles.td}>{user.full_name ?? '—'}</td>
                <td style={styles.td}>
                  <select
                    value={user.role_id ?? ''}
                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    style={styles.select}
                    disabled={!user.is_active}
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </td>
                <td style={styles.td}>
                  {user.is_active
                    ? <span style={styles.badgeActive}>Active</span>
                    : <span style={styles.badgeInactive}>Former employee</span>}
                </td>
                <td style={styles.td}>
                  {user.is_active && (
                    <button
                      onClick={() => handleDeactivate(user.id)}
                      style={styles.btnDanger}
                    >
                      Deactivate
                    </button>
                  )}
                  {!user.is_active && (
                    <button
                      onClick={() => openRtbf(user.id)}
                      style={styles.btnSecondary}
                    >
                      RTBF Review
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* RTBF modal */}
      {rtbfUserId && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0 }}>Right to be Forgotten — Memory Review</h3>
              <button onClick={() => setRtbfUserId(null)} style={styles.closeBtn}>✕</button>
            </div>
            <p style={styles.modalNote}>
              Select which memories to invalidate. Deselected memories remain flagged but are not deleted.
              Auto-deletion without review is not supported.
            </p>

            {rtbfLoading && <p style={{ color: '#666' }}>Loading…</p>}
            {rtbfError && <p style={styles.errText}>{rtbfError}</p>}
            {!rtbfLoading && rtbfMemories.length === 0 && (
              <p style={{ color: '#666' }}>No active memories flagged for this user.</p>
            )}

            {rtbfMemories.map((m) => (
              <label key={m.id} style={styles.memRow}>
                <input
                  type="checkbox"
                  checked={rtbfSelected.has(m.id)}
                  onChange={(e) => {
                    setRtbfSelected((prev) => {
                      const next = new Set(prev)
                      e.target.checked ? next.add(m.id) : next.delete(m.id)
                      return next
                    })
                  }}
                  style={{ marginRight: '10px', flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: '13px', color: '#111' }}>{m.content}</div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                    {m.type} · {m.sensitivity_level} · {new Date(m.created_at).toLocaleDateString()}
                  </div>
                </div>
              </label>
            ))}

            {rtbfMemories.length > 0 && (
              <div style={styles.modalFooter}>
                <button
                  onClick={handleRtbfInvalidate}
                  disabled={rtbfSelected.size === 0 || rtbfLoading}
                  style={styles.btnDanger}
                >
                  Invalidate {rtbfSelected.size > 0 ? `${rtbfSelected.size} selected` : 'selected'}
                </button>
                <button onClick={() => setRtbfUserId(null)} style={styles.btnSecondary}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  section: { marginBottom: '32px' },
  sectionTitle: { fontSize: '15px', fontWeight: 600, marginBottom: '12px', color: '#333' },
  row: { display: 'flex', gap: '8px', alignItems: 'center' },
  input: { padding: '7px 10px', border: '1px solid #ddd', borderRadius: '5px', fontSize: '13px', width: '280px' },
  select: { padding: '5px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' },
  btnPrimary: { padding: '7px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px' },
  btnSecondary: { padding: '5px 12px', background: '#f0f0f0', color: '#333', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' },
  btnDanger: { padding: '5px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' },
  errText: { color: '#dc2626', fontSize: '13px', margin: '6px 0' },
  okText: { color: '#16a34a', fontSize: '13px', margin: '6px 0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { textAlign: 'left', padding: '8px 12px', borderBottom: '2px solid #e0e0e0', fontSize: '12px', color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle' },
  badgeActive: { background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' },
  badgeInactive: { background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: '#fff', borderRadius: '8px', padding: '24px', width: '640px', maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalNote: { fontSize: '13px', color: '#555', margin: 0 },
  modalFooter: { display: 'flex', gap: '8px', marginTop: '8px' },
  closeBtn: { background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#666' },
  memRow: { display: 'flex', alignItems: 'flex-start', padding: '10px', border: '1px solid #f0f0f0', borderRadius: '6px', cursor: 'pointer', gap: '4px' },
}
