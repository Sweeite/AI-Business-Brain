'use client'

import { useState } from 'react'
import type { ConfigRow } from './mission-control-client'

interface SettingDef {
  key: string
  label: string
  description: string
  type: 'number' | 'string'
  min?: number
  max?: number
  step?: number
}

const SETTINGS_GROUPS: { title: string; settings: SettingDef[] }[] = [
  {
    title: 'Retrieval',
    settings: [
      { key: 'retrieval_min_relevance', label: 'Relevance Floor', description: 'Cosine similarity minimum. Memories below this score are never injected.', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'retrieval_max_results', label: 'Max Results', description: 'Hard cap on memories injected per query.', type: 'number', min: 1, max: 100, step: 1 },
    ],
  },
  {
    title: 'Memory Proposals',
    settings: [
      { key: 'memory_proposal_min_confidence', label: 'Confidence Threshold', description: 'Proposals below this confidence are routed to the human review queue.', type: 'number', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'Decay',
    settings: [
      { key: 'decay_min_utility_score', label: 'Min Utility Score', description: 'Memories below this utility score are invalidated.', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'decay_min_age_days', label: 'Min Age (days)', description: 'Only decay memories older than this.', type: 'number', min: 1, max: 365, step: 1 },
      { key: 'decay_cron_schedule', label: 'Cron Schedule', description: 'When the decay job runs.', type: 'string' },
    ],
  },
  {
    title: 'Consolidation',
    settings: [
      { key: 'consolidation_dedup_similarity_threshold', label: 'Dedup Similarity Threshold', description: 'Candidates above this cosine similarity are treated as near-duplicates and routed to review.', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'consolidation_cron_schedule', label: 'Cron Schedule', description: 'When the episodic → semantic consolidation job runs.', type: 'string' },
    ],
  },
  {
    title: 'Chunks',
    settings: [
      { key: 'chunk_ttl_days', label: 'TTL (days)', description: 'Index-in-place chunks older than this are pruned.', type: 'number', min: 1, max: 365, step: 1 },
    ],
  },
]

interface Props {
  initialConfigs: ConfigRow[]
}

export function SettingsTab({ initialConfigs }: Props) {
  const configMap = Object.fromEntries(initialConfigs.map((c) => [c.key, c.value]))

  const [values, setValues] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const group of SETTINGS_GROUPS) {
      for (const s of group.settings) {
        const raw = configMap[s.key]
        m[s.key] = raw !== undefined ? String(raw) : ''
      }
    }
    return m
  })

  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleSave = async (def: SettingDef) => {
    setSaving(def.key)
    setErrors((prev) => ({ ...prev, [def.key]: '' }))
    setSaved(null)

    const raw = values[def.key]
    const value = def.type === 'number' ? parseFloat(raw) : raw

    if (def.type === 'number' && isNaN(value as number)) {
      setErrors((prev) => ({ ...prev, [def.key]: 'Must be a number' }))
      setSaving(null)
      return
    }

    const res = await fetch(`/api/admin/system-config/${encodeURIComponent(def.key)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    })
    setSaving(null)
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setErrors((prev) => ({ ...prev, [def.key]: data.error ?? 'Save failed' }))
    } else {
      setSaved(def.key)
      setTimeout(() => setSaved(null), 2000)
    }
  }

  return (
    <div style={styles.container}>
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.title} style={styles.group}>
          <h3 style={styles.groupTitle}>{group.title}</h3>
          {group.settings.map((def) => (
            <div key={def.key} style={styles.settingRow}>
              <div style={styles.settingMeta}>
                <div style={styles.settingLabel}>{def.label}</div>
                <div style={styles.settingDesc}>{def.description}</div>
                {errors[def.key] && <div style={styles.errText}>{errors[def.key]}</div>}
              </div>
              <div style={styles.settingControl}>
                <input
                  type={def.type === 'number' ? 'number' : 'text'}
                  value={values[def.key]}
                  min={def.min}
                  max={def.max}
                  step={def.step}
                  onChange={(e) => setValues((prev) => ({ ...prev, [def.key]: e.target.value }))}
                  style={styles.input}
                />
                <button
                  onClick={() => handleSave(def)}
                  disabled={saving === def.key}
                  style={styles.btnSave}
                >
                  {saving === def.key ? '…' : saved === def.key ? 'Saved!' : 'Save'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: '28px' },
  group: { border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden' },
  groupTitle: { margin: 0, padding: '12px 16px', background: '#f8f8f8', borderBottom: '1px solid #e0e0e0', fontSize: '13px', fontWeight: 700, color: '#333', textTransform: 'uppercase', letterSpacing: '0.05em' },
  settingRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 16px', borderBottom: '1px solid #f0f0f0' },
  settingMeta: { flex: 1, marginRight: '24px' },
  settingLabel: { fontSize: '13px', fontWeight: 600, color: '#111', marginBottom: '2px' },
  settingDesc: { fontSize: '12px', color: '#888' },
  settingControl: { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 },
  input: { padding: '6px 10px', border: '1px solid #ddd', borderRadius: '5px', fontSize: '13px', width: '120px', fontFamily: 'monospace' },
  btnSave: { padding: '6px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', minWidth: '56px' },
  errText: { color: '#dc2626', fontSize: '12px', marginTop: '3px' },
}
