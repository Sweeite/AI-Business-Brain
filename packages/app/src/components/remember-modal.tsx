'use client'

import { useState } from 'react'

interface Props {
  isOpen: boolean
  onClose: () => void
  roleName: string
}

const OPERATOR_ROLES = new Set(['Operator', 'Manager', 'Owner', 'Admin'])

export function RememberModal({ isOpen, onClose, roleName }: Props) {
  const [claim, setClaim] = useState('')
  const [suggestedType, setSuggestedType] = useState<'episodic' | 'semantic' | 'procedural'>('semantic')
  const [entityTag, setEntityTag] = useState('')
  const [sensitivityLevel, setSensitivityLevel] = useState('internal')
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [error, setError] = useState('')

  const isMember = !OPERATOR_ROLES.has(roleName)

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!claim.trim()) return
    setSubmitting(true)
    setError('')

    try {
      const resp = await fetch('/api/memory/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim: claim.trim(),
          suggested_type: suggestedType,
          entity_refs: entityTag.trim() ? [entityTag.trim()] : [],
          sensitivity_level: sensitivityLevel,
        }),
      })
      const data = await resp.json() as { ok?: boolean; error?: string; pendingReview?: boolean }
      if (!resp.ok) {
        setError(data.error ?? 'Failed to submit')
      } else {
        setSuccessMsg(data.pendingReview ? 'Captured — pending review' : 'Captured')
        setTimeout(() => {
          setSuccessMsg('')
          setClaim('')
          setEntityTag('')
          setSuggestedType('semantic')
          setSensitivityLevel('internal')
          onClose()
        }, 2000)
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>Remember this</span>
          <button style={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {successMsg ? (
          <div style={styles.successBox}>{successMsg}</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={styles.label}>What should the brain remember?</label>
            <textarea
              style={styles.textarea}
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              placeholder="e.g. Acme Corp prefers async updates over weekly calls"
              rows={4}
              required
            />

            <label style={styles.label}>Type</label>
            <select
              style={styles.select}
              value={suggestedType}
              onChange={(e) => setSuggestedType(e.target.value as typeof suggestedType)}
            >
              <option value="semantic">Fact / Preference / Relationship</option>
              <option value="episodic">Event / What happened</option>
              <option value="procedural">SOP / How-to / Playbook</option>
            </select>

            <label style={styles.label}>Related to (optional)</label>
            <input
              style={styles.input}
              type="text"
              value={entityTag}
              onChange={(e) => setEntityTag(e.target.value)}
              placeholder="client:acme, project:q2-launch, person:jane"
            />

            {!isMember && (
              <>
                <label style={styles.label}>Sensitivity</label>
                <select
                  style={styles.select}
                  value={sensitivityLevel}
                  onChange={(e) => setSensitivityLevel(e.target.value)}
                >
                  <option value="public">Public</option>
                  <option value="internal">Internal</option>
                  <option value="management">Management</option>
                  <option value="leadership">Leadership</option>
                </select>
              </>
            )}

            {error && <div style={styles.errorBox}>{error}</div>}

            <div style={styles.actions}>
              <button type="button" style={styles.cancelBtn} onClick={onClose}>Cancel</button>
              <button type="submit" style={styles.submitBtn} disabled={submitting || !claim.trim()}>
                {submitting ? 'Saving…' : 'Remember'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '24px',
    width: '480px',
    maxWidth: '90vw',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#111',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    color: '#999',
    padding: '0 4px',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 500,
    color: '#555',
    marginBottom: '4px',
    marginTop: '14px',
  },
  textarea: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    backgroundColor: '#fff',
    boxSizing: 'border-box',
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '20px',
  },
  cancelBtn: {
    padding: '8px 16px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    background: '#fff',
    fontSize: '14px',
    cursor: 'pointer',
    color: '#555',
  },
  submitBtn: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '4px',
    background: '#111',
    fontSize: '14px',
    cursor: 'pointer',
    color: '#fff',
  },
  errorBox: {
    marginTop: '10px',
    padding: '8px 12px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '4px',
    fontSize: '13px',
    color: '#991b1b',
  },
  successBox: {
    padding: '24px',
    textAlign: 'center',
    fontSize: '15px',
    color: '#166534',
    fontWeight: 500,
  },
}
