'use client'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  dangerous?: boolean
  loading?: boolean
}

export function ConfirmModal({ title, message, confirmLabel = 'Confirm', onConfirm, onCancel, dangerous = false, loading = false }: Props) {
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>{title}</h3>
        <p style={styles.message}>{message}</p>
        <div style={styles.actions}>
          <button onClick={onCancel} disabled={loading} style={styles.cancelBtn}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={dangerous ? styles.dangerBtn : styles.confirmBtn}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  modal: {
    background: '#fff',
    borderRadius: '8px',
    padding: '24px',
    width: '420px',
    maxWidth: '90vw',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
  },
  title: { margin: 0, fontSize: '16px', fontWeight: 700, color: '#111' },
  message: { margin: 0, fontSize: '14px', color: '#555', lineHeight: '1.5' },
  actions: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' },
  cancelBtn: {
    padding: '7px 16px',
    background: '#f0f0f0',
    color: '#333',
    border: '1px solid #ddd',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  confirmBtn: {
    padding: '7px 16px',
    background: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  dangerBtn: {
    padding: '7px 16px',
    background: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '13px',
  },
}
