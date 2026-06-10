'use client'

import { useState } from 'react'
import type { ConfigRow, JobRunRow } from './mission-control-client'

interface JobDef {
  jobType: string
  label: string
  scheduleKey: string
  activeKey: string
}

const SYSTEM_JOBS: JobDef[] = [
  { jobType: 'memory.proposal.drain', label: 'Memory Proposal Drain', scheduleKey: 'memory_proposal_drain_schedule', activeKey: 'memory_proposal_drain_active' },
  { jobType: 'connector.sync',        label: 'Connector Sync',         scheduleKey: 'connector_sync_schedule',        activeKey: 'connector_sync_active' },
  { jobType: 'token.refresh',         label: 'Token Refresh',          scheduleKey: 'token_refresh_schedule',         activeKey: 'token_refresh_active' },
  { jobType: 'drive.webhook.renew',   label: 'Drive Webhook Renewal',  scheduleKey: 'drive_webhook_renew_schedule',   activeKey: 'drive_webhook_renew_active' },
  { jobType: 'memory.decay',          label: 'Memory Decay',           scheduleKey: 'decay_cron_schedule',            activeKey: 'memory_decay_active' },
]

interface RunHistoryRun {
  id: string
  status: string
  started_at: string
  completed_at: string | null
  error: string | null
}

interface Props {
  initialConfigs: ConfigRow[]
  lastRunByType: Record<string, JobRunRow>
}

export function CronsTab({ initialConfigs, lastRunByType }: Props) {
  const configMap = Object.fromEntries(initialConfigs.map((c) => [c.key, c.value]))

  const [schedules, setSchedules] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const job of SYSTEM_JOBS) {
      m[job.scheduleKey] = typeof configMap[job.scheduleKey] === 'string' ? configMap[job.scheduleKey] as string : ''
    }
    return m
  })

  const [actives, setActives] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {}
    for (const job of SYSTEM_JOBS) {
      m[job.activeKey] = configMap[job.activeKey] !== false
    }
    return m
  })

  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')

  const [historyJobType, setHistoryJobType] = useState<string | null>(null)
  const [historyRuns, setHistoryRuns] = useState<RunHistoryRun[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const patchConfig = async (key: string, value: unknown) => {
    const res = await fetch(`/api/admin/system-config/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    })
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      throw new Error(data.error ?? 'Save failed')
    }
  }

  const handleScheduleSave = async (job: JobDef) => {
    setSaving(job.scheduleKey)
    setError('')
    try {
      await patchConfig(job.scheduleKey, schedules[job.scheduleKey])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(null)
    }
  }

  const handleActiveToggle = async (job: JobDef) => {
    const newVal = !actives[job.activeKey]
    setActives((prev) => ({ ...prev, [job.activeKey]: newVal }))
    setError('')
    try {
      await patchConfig(job.activeKey, newVal)
    } catch (e) {
      // Revert
      setActives((prev) => ({ ...prev, [job.activeKey]: !newVal }))
      setError(e instanceof Error ? e.message : 'Toggle failed')
    }
  }

  const openHistory = async (jobType: string) => {
    setHistoryJobType(jobType)
    setHistoryRuns([])
    setHistoryLoading(true)
    const res = await fetch(`/api/admin/job-runs?jobType=${encodeURIComponent(jobType)}&limit=20`)
    setHistoryLoading(false)
    if (!res.ok) return
    const data = await res.json() as { runs?: RunHistoryRun[] }
    setHistoryRuns(data.runs ?? [])
  }

  return (
    <div>
      <p style={styles.note}>
        Schedule changes take effect on the next worker restart.
      </p>

      {error && <p style={styles.errText}>{error}</p>}

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Job</th>
            <th style={styles.th}>Schedule (cron)</th>
            <th style={styles.th}>Active</th>
            <th style={styles.th}>Last Run</th>
            <th style={styles.th}>History</th>
          </tr>
        </thead>
        <tbody>
          {SYSTEM_JOBS.map((job) => {
            const lastRun = lastRunByType[job.jobType]
            return (
              <tr key={job.jobType}>
                <td style={styles.td}><strong>{job.label}</strong></td>
                <td style={styles.td}>
                  <div style={styles.scheduleCell}>
                    <input
                      value={schedules[job.scheduleKey]}
                      onChange={(e) => setSchedules((prev) => ({ ...prev, [job.scheduleKey]: e.target.value }))}
                      style={styles.scheduleInput}
                    />
                    <button
                      onClick={() => handleScheduleSave(job)}
                      disabled={saving === job.scheduleKey}
                      style={styles.btnSmall}
                    >
                      {saving === job.scheduleKey ? '…' : 'Save'}
                    </button>
                  </div>
                </td>
                <td style={styles.td}>
                  <button
                    onClick={() => handleActiveToggle(job)}
                    style={actives[job.activeKey] ? styles.toggleOn : styles.toggleOff}
                  >
                    {actives[job.activeKey] ? 'On' : 'Off'}
                  </button>
                </td>
                <td style={styles.td}>
                  {lastRun ? (
                    <div>
                      <span style={lastRun.status === 'completed' ? styles.statusOk : lastRun.status === 'failed' ? styles.statusErr : styles.statusPending}>
                        {lastRun.status}
                      </span>
                      <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                        {new Date(lastRun.started_at).toLocaleString()}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: '#aaa', fontSize: '12px' }}>Never run</span>
                  )}
                </td>
                <td style={styles.td}>
                  <button onClick={() => openHistory(job.jobType)} style={styles.btnSecondary}>
                    View
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Run history modal */}
      {historyJobType && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0 }}>
                Run History — {SYSTEM_JOBS.find((j) => j.jobType === historyJobType)?.label ?? historyJobType}
              </h3>
              <button onClick={() => setHistoryJobType(null)} style={styles.closeBtn}>✕</button>
            </div>
            {historyLoading && <p style={{ color: '#666' }}>Loading…</p>}
            {!historyLoading && historyRuns.length === 0 && (
              <p style={{ color: '#666', fontSize: '13px' }}>No runs recorded yet.</p>
            )}
            {historyRuns.map((run) => (
              <div key={run.id} style={styles.runRow}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={run.status === 'completed' ? styles.statusOk : run.status === 'failed' ? styles.statusErr : styles.statusPending}>
                    {run.status}
                  </span>
                  <span style={{ fontSize: '12px', color: '#888' }}>
                    {new Date(run.started_at).toLocaleString()}
                  </span>
                </div>
                {run.error && <p style={{ fontSize: '12px', color: '#dc2626', margin: '4px 0 0' }}>{run.error}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  note: { fontSize: '13px', color: '#666', marginBottom: '20px', padding: '10px 14px', background: '#f8f8f8', borderRadius: '6px', border: '1px solid #e8e8e8' },
  errText: { color: '#dc2626', fontSize: '13px', margin: '0 0 12px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { textAlign: 'left', padding: '8px 12px', borderBottom: '2px solid #e0e0e0', fontSize: '12px', color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' },
  td: { padding: '12px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle' },
  scheduleCell: { display: 'flex', gap: '6px', alignItems: 'center' },
  scheduleInput: { padding: '5px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px', width: '140px', fontFamily: 'monospace' },
  btnSmall: { padding: '4px 10px', background: '#111', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
  btnSecondary: { padding: '5px 12px', background: '#f0f0f0', color: '#333', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' },
  toggleOn: { padding: '4px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
  toggleOff: { padding: '4px 12px', background: '#d1d5db', color: '#374151', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
  statusOk: { background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' },
  statusErr: { background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' },
  statusPending: { background: '#fef9c3', color: '#a16207', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: '#fff', borderRadius: '8px', padding: '24px', width: '540px', maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  closeBtn: { background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#666' },
  runRow: { padding: '10px', border: '1px solid #f0f0f0', borderRadius: '6px' },
}
