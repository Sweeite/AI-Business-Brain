'use client'

import { useState } from 'react'
import type { RoleRow } from './mission-control-client'

const CLEARANCE_OPTIONS = ['public', 'internal', 'management', 'leadership']
const CLEARANCE_LABELS: Record<string, string> = {
  public: 'Public',
  internal: 'Internal',
  management: 'Management',
  leadership: 'Leadership',
}
const CLEARANCE_COLORS: Record<string, React.CSSProperties> = {
  public: { background: '#f3f4f6', color: '#374151' },
  internal: { background: '#dbeafe', color: '#1d4ed8' },
  management: { background: '#fef3c7', color: '#b45309' },
  leadership: { background: '#fce7f3', color: '#9d174d' },
}

interface PermEntry { key: string; value: boolean }

interface EditState {
  id: string | null  // null = creating new
  name: string
  clearance_level: string
  permissions: PermEntry[]
}

function permissionsToEntries(p: Record<string, boolean>): PermEntry[] {
  return Object.entries(p).map(([key, value]) => ({ key, value }))
}
function entriesToPermissions(entries: PermEntry[]): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const { key, value } of entries) {
    if (key.trim()) result[key.trim()] = value
  }
  return result
}

interface Props {
  initialRoles: RoleRow[]
}

export function RolesTab({ initialRoles }: Props) {
  const [roles, setRoles] = useState(initialRoles)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const openCreate = () => setEdit({ id: null, name: '', clearance_level: 'internal', permissions: [] })
  const openEdit = (role: RoleRow) => setEdit({
    id: role.id,
    name: role.name,
    clearance_level: role.clearance_level,
    permissions: permissionsToEntries(role.permissions ?? {}),
  })

  const handleSave = async () => {
    if (!edit) return
    if (!edit.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')

    const body = {
      name: edit.name.trim(),
      clearance_level: edit.clearance_level,
      permissions: entriesToPermissions(edit.permissions),
    }

    const res = edit.id
      ? await fetch(`/api/admin/roles/${edit.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/admin/roles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

    setSaving(false)
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setError(data.error ?? 'Save failed')
      return
    }

    // Refresh roles from server
    const listRes = await fetch('/api/admin/roles')
    const listData = await listRes.json() as { roles?: RoleRow[] }
    setRoles(listData.roles ?? roles)
    setEdit(null)
  }

  const handleDelete = async (roleId: string) => {
    if (!confirm('Delete this role?')) return
    setError('')
    const res = await fetch(`/api/admin/roles/${roleId}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setError(data.error ?? 'Delete failed')
      return
    }
    setRoles((prev) => prev.filter((r) => r.id !== roleId))
  }

  const addPermEntry = () => setEdit((prev) => prev ? { ...prev, permissions: [...prev.permissions, { key: '', value: true }] } : prev)
  const updatePermKey = (i: number, key: string) => setEdit((prev) => prev ? { ...prev, permissions: prev.permissions.map((e, idx) => idx === i ? { ...e, key } : e) } : prev)
  const updatePermVal = (i: number, value: boolean) => setEdit((prev) => prev ? { ...prev, permissions: prev.permissions.map((e, idx) => idx === i ? { ...e, value } : e) } : prev)
  const removePermEntry = (i: number) => setEdit((prev) => prev ? { ...prev, permissions: prev.permissions.filter((_, idx) => idx !== i) } : prev)

  return (
    <div>
      <div style={styles.header}>
        <h3 style={styles.sectionTitle}>Roles ({roles.length})</h3>
        <button onClick={openCreate} style={styles.btnPrimary}>+ New Role</button>
      </div>

      {error && <p style={styles.errText}>{error}</p>}

      <div style={styles.rolesGrid}>
        {roles.map((role) => (
          <div key={role.id} style={styles.roleCard}>
            <div style={styles.roleCardHeader}>
              <span style={styles.roleName}>{role.name}</span>
              <span style={{ ...styles.badge, ...CLEARANCE_COLORS[role.clearance_level] }}>
                {CLEARANCE_LABELS[role.clearance_level] ?? role.clearance_level}
              </span>
            </div>
            <div style={styles.permCount}>
              {Object.keys(role.permissions ?? {}).length} permission node{Object.keys(role.permissions ?? {}).length !== 1 ? 's' : ''}
            </div>
            <div style={styles.roleCardActions}>
              <button onClick={() => openEdit(role)} style={styles.btnSecondary}>Edit</button>
              <button onClick={() => handleDelete(role.id)} style={styles.btnDangerSmall}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit / Create modal */}
      {edit && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0 }}>{edit.id ? 'Edit Role' : 'New Role'}</h3>
              <button onClick={() => setEdit(null)} style={styles.closeBtn}>✕</button>
            </div>

            <label style={styles.label}>
              Name
              <input
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                style={styles.input}
              />
            </label>

            <label style={styles.label}>
              Memory Clearance
              <select
                value={edit.clearance_level}
                onChange={(e) => setEdit({ ...edit, clearance_level: e.target.value })}
                style={styles.select}
              >
                {CLEARANCE_OPTIONS.map((c) => (
                  <option key={c} value={c}>{CLEARANCE_LABELS[c]}</option>
                ))}
              </select>
            </label>

            <div>
              <div style={styles.permHeader}>
                <span style={styles.label}>Permission Nodes</span>
                <button onClick={addPermEntry} style={styles.btnSecondary}>+ Add</button>
              </div>
              {edit.permissions.length === 0 && (
                <p style={{ fontSize: '13px', color: '#888' }}>No permission nodes. Add one to grant fine-grained access.</p>
              )}
              {edit.permissions.map((entry, i) => (
                <div key={i} style={styles.permRow}>
                  <input
                    value={entry.key}
                    onChange={(e) => updatePermKey(i, e.target.value)}
                    placeholder="permission.node"
                    style={{ ...styles.input, flex: 1 }}
                  />
                  <select
                    value={entry.value ? 'true' : 'false'}
                    onChange={(e) => updatePermVal(i, e.target.value === 'true')}
                    style={{ ...styles.select, width: '90px' }}
                  >
                    <option value="true">Granted</option>
                    <option value="false">Denied</option>
                  </select>
                  <button onClick={() => removePermEntry(i)} style={styles.btnDangerSmall}>✕</button>
                </div>
              ))}
            </div>

            {error && <p style={styles.errText}>{error}</p>}

            <div style={styles.modalFooter}>
              <button onClick={handleSave} disabled={saving} style={styles.btnPrimary}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEdit(null)} style={styles.btnSecondary}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  sectionTitle: { fontSize: '15px', fontWeight: 600, color: '#333', margin: 0 },
  btnPrimary: { padding: '7px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px' },
  btnSecondary: { padding: '5px 12px', background: '#f0f0f0', color: '#333', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' },
  btnDangerSmall: { padding: '5px 10px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
  errText: { color: '#dc2626', fontSize: '13px', margin: '6px 0' },
  rolesGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' },
  roleCard: { border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px', background: '#fff' },
  roleCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  roleName: { fontWeight: 600, fontSize: '14px', color: '#111' },
  badge: { padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 500 },
  permCount: { fontSize: '12px', color: '#888', marginBottom: '12px' },
  roleCardActions: { display: 'flex', gap: '8px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: '#fff', borderRadius: '8px', padding: '24px', width: '520px', maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalFooter: { display: 'flex', gap: '8px' },
  closeBtn: { background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#666' },
  label: { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 500, color: '#333' },
  input: { padding: '7px 10px', border: '1px solid #ddd', borderRadius: '5px', fontSize: '13px', marginTop: '4px' },
  select: { padding: '7px 10px', border: '1px solid #ddd', borderRadius: '5px', fontSize: '13px', marginTop: '4px' },
  permHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  permRow: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' },
}
