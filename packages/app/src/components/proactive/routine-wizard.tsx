'use client'

import { useState } from 'react'
import type { AgentConfigRow, RoutineRow } from './proactive-builder-client'

interface Props {
  agentConfigs: AgentConfigRow[]
  isAdmin: boolean
  onClose: () => void
  onCreated: (routine: RoutineRow) => void
}

type TriggerType = 'cron' | 'webhook'
type OutputType = 'memory' | 'email' | 'slack' | 'dashboard_notification' | 'tool_write'

const CRON_PRESETS = [
  { label: 'Daily 8am', value: '0 8 * * *' },
  { label: 'Weekly Mon 8am', value: '0 8 * * 1' },
  { label: 'Hourly', value: '0 * * * *' },
]

const WEBHOOK_EVENTS: Record<string, { label: string; value: string }[]> = {
  gmail: [{ label: 'Email received', value: 'email.received' }],
  google_drive: [{ label: 'File changed', value: 'file.changed' }],
}

const OUTPUT_OPTIONS: { label: string; value: OutputType }[] = [
  { label: 'Save to memory', value: 'memory' },
  { label: 'Send email', value: 'email' },
  { label: 'Post to Slack', value: 'slack' },
  { label: 'Dashboard notification', value: 'dashboard_notification' },
  { label: 'Write to tool', value: 'tool_write' },
]

export function RoutineWizard({ agentConfigs, isAdmin, onClose, onCreated }: Props) {
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1 — Trigger
  const [triggerType, setTriggerType] = useState<TriggerType>('cron')
  const [cronPreset, setCronPreset] = useState('')
  const [cronCustom, setCronCustom] = useState('')
  const [webhookConnector, setWebhookConnector] = useState('gmail')
  const [webhookEvent, setWebhookEvent] = useState('email.received')
  const [webhookFilterFrom, setWebhookFilterFrom] = useState('')

  // Step 2 — Agent
  const [agentConfigId, setAgentConfigId] = useState(agentConfigs[0]?.id ?? '')
  const [additionalContext, setAdditionalContext] = useState('')

  // Step 3 — Output + name/description
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [outputType, setOutputType] = useState<OutputType>('memory')
  const [scope, setScope] = useState<'user' | 'system'>('user')
  // email
  const [emailRecipients, setEmailRecipients] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  // slack
  const [slackChannel, setSlackChannel] = useState('')
  // dashboard_notification
  const [notifyRoles, setNotifyRoles] = useState<string[]>([])
  // tool_write
  const [toolName, setToolName] = useState('')
  const [toolParams, setToolParams] = useState('{}')

  function effectiveCron(): string {
    if (cronPreset) return cronPreset
    return cronCustom.trim()
  }

  function step1Valid(): boolean {
    if (triggerType === 'cron') return effectiveCron().length > 0
    return webhookConnector.length > 0 && webhookEvent.length > 0
  }

  function step2Valid(): boolean {
    return agentConfigId.length > 0
  }

  function step3Valid(): boolean {
    if (!name.trim()) return false
    if (outputType === 'email') return emailRecipients.trim().length > 0 && emailSubject.trim().length > 0
    if (outputType === 'slack') return slackChannel.trim().length > 0
    if (outputType === 'tool_write') {
      try { JSON.parse(toolParams); return toolName.trim().length > 0 }
      catch { return false }
    }
    return true
  }

  function buildOutputConfig(): Record<string, unknown> {
    if (outputType === 'email') return { recipients: emailRecipients.split(',').map((s) => s.trim()), subject_template: emailSubject }
    if (outputType === 'slack') return { channel: slackChannel }
    if (outputType === 'dashboard_notification') return { roles: notifyRoles }
    if (outputType === 'tool_write') return { tool: toolName, params: JSON.parse(toolParams) }
    return {}
  }

  async function handleSubmit() {
    if (!step3Valid()) return
    setSubmitting(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim(),
        trigger_type: triggerType,
        agent_config_id: agentConfigId,
        additional_context: additionalContext.trim() || null,
        output_type: outputType,
        output_config: buildOutputConfig(),
        scope,
      }

      if (triggerType === 'cron') {
        body.cron_schedule = effectiveCron()
      } else {
        body.webhook_connector = webhookConnector
        body.webhook_event = webhookEvent
        if (webhookFilterFrom.trim()) {
          body.webhook_filters = { from: webhookFilterFrom.trim() }
        }
      }

      const resp = await fetch('/api/routines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await resp.json() as { routine?: RoutineRow; error?: string }
      if (!resp.ok) {
        setError(data.error ?? 'Failed to create routine')
        return
      }
      onCreated(data.routine!)
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>New Routine</h2>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Step indicator */}
        <div style={styles.steps}>
          {[1, 2, 3].map((s) => (
            <div key={s} style={{ ...styles.stepDot, background: step >= s ? '#2563eb' : '#e5e7eb' }}>
              {s}
            </div>
          ))}
          <div style={styles.stepLabel}>
            {step === 1 ? 'Trigger' : step === 2 ? 'Agent' : 'Output'}
          </div>
        </div>

        <div style={styles.modalBody}>
          {/* ── Step 1: Trigger ── */}
          {step === 1 && (
            <div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Trigger type</label>
                <div style={styles.typeToggle}>
                  {(['cron', 'webhook'] as TriggerType[]).map((t) => (
                    <button
                      key={t}
                      style={{ ...styles.typeBtn, ...(triggerType === t ? styles.typeBtnActive : {}) }}
                      onClick={() => setTriggerType(t)}
                    >
                      {t === 'cron' ? 'Cron schedule' : 'Webhook event'}
                    </button>
                  ))}
                </div>
              </div>

              {triggerType === 'cron' && (
                <>
                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>Schedule presets</label>
                    <div style={styles.presets}>
                      {CRON_PRESETS.map((p) => (
                        <button
                          key={p.value}
                          style={{ ...styles.presetBtn, ...(cronPreset === p.value ? styles.presetBtnActive : {}) }}
                          onClick={() => { setCronPreset(p.value); setCronCustom('') }}
                        >
                          {p.label}
                          <span style={styles.presetCron}>{p.value}</span>
                        </button>
                      ))}
                      <button
                        style={{ ...styles.presetBtn, ...(cronPreset === '' && cronCustom ? styles.presetBtnActive : {}) }}
                        onClick={() => setCronPreset('')}
                      >
                        Custom
                      </button>
                    </div>
                  </div>
                  {cronPreset === '' && (
                    <div style={styles.fieldGroup}>
                      <label style={styles.label}>Custom cron expression</label>
                      <input
                        style={styles.input}
                        value={cronCustom}
                        onChange={(e) => setCronCustom(e.target.value)}
                        placeholder="0 9 * * 1-5"
                      />
                      <div style={styles.hint}>Standard 5-field cron (min hr dom mon dow)</div>
                    </div>
                  )}
                </>
              )}

              {triggerType === 'webhook' && (
                <>
                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>Connector</label>
                    <select
                      style={styles.select}
                      value={webhookConnector}
                      onChange={(e) => {
                        setWebhookConnector(e.target.value)
                        setWebhookEvent(WEBHOOK_EVENTS[e.target.value]?.[0]?.value ?? '')
                      }}
                    >
                      <option value="gmail">Gmail</option>
                      <option value="google_drive">Google Drive</option>
                    </select>
                  </div>
                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>Event</label>
                    <select
                      style={styles.select}
                      value={webhookEvent}
                      onChange={(e) => setWebhookEvent(e.target.value)}
                    >
                      {(WEBHOOK_EVENTS[webhookConnector] ?? []).map((ev) => (
                        <option key={ev.value} value={ev.value}>{ev.label}</option>
                      ))}
                    </select>
                  </div>
                  {webhookConnector === 'gmail' && (
                    <div style={styles.fieldGroup}>
                      <label style={styles.label}>Filter: from address (optional)</label>
                      <input
                        style={styles.input}
                        value={webhookFilterFrom}
                        onChange={(e) => setWebhookFilterFrom(e.target.value)}
                        placeholder="client@example.com"
                      />
                      <div style={styles.hint}>Only fire this routine when email is from this address.</div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Step 2: Agent ── */}
          {step === 2 && (
            <div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Agent config</label>
                <select
                  style={styles.select}
                  value={agentConfigId}
                  onChange={(e) => setAgentConfigId(e.target.value)}
                >
                  {agentConfigs.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.model})
                    </option>
                  ))}
                </select>
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Additional context (optional)</label>
                <textarea
                  style={styles.textarea}
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Extra instructions specific to this routine…"
                  rows={4}
                />
              </div>
            </div>
          )}

          {/* ── Step 3: Output + name ── */}
          {step === 3 && (
            <div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Routine name *</label>
                <input
                  style={styles.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Weekly digest"
                />
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Description</label>
                <input
                  style={styles.input}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Summarises last week's key decisions every Monday"
                />
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Output destination</label>
                <div style={styles.outputOptions}>
                  {OUTPUT_OPTIONS.map((o) => (
                    <label key={o.value} style={styles.radioLabel}>
                      <input
                        type="radio"
                        name="output_type"
                        value={o.value}
                        checked={outputType === o.value}
                        onChange={() => setOutputType(o.value)}
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </div>

              {outputType === 'email' && (
                <>
                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>Recipients (comma-separated) *</label>
                    <input
                      style={styles.input}
                      value={emailRecipients}
                      onChange={(e) => setEmailRecipients(e.target.value)}
                      placeholder="alice@co.com, bob@co.com"
                    />
                  </div>
                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>Subject template *</label>
                    <input
                      style={styles.input}
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Weekly Brain Digest"
                    />
                  </div>
                </>
              )}

              {outputType === 'slack' && (
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Channel or DM *</label>
                  <input
                    style={styles.input}
                    value={slackChannel}
                    onChange={(e) => setSlackChannel(e.target.value)}
                    placeholder="#general or @username"
                  />
                </div>
              )}

              {outputType === 'dashboard_notification' && (
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Notify roles</label>
                  {['Owner', 'Operator', 'Manager', 'Member'].map((role) => (
                    <label key={role} style={styles.checkLabel}>
                      <input
                        type="checkbox"
                        checked={notifyRoles.includes(role)}
                        onChange={(e) => {
                          setNotifyRoles((prev) =>
                            e.target.checked ? [...prev, role] : prev.filter((r) => r !== role)
                          )
                        }}
                      />
                      {role}
                    </label>
                  ))}
                </div>
              )}

              {outputType === 'tool_write' && (
                <>
                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>Tool name *</label>
                    <input
                      style={styles.input}
                      value={toolName}
                      onChange={(e) => setToolName(e.target.value)}
                      placeholder="create_drive_file"
                    />
                  </div>
                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>Parameters (JSON)</label>
                    <textarea
                      style={styles.textarea}
                      value={toolParams}
                      onChange={(e) => setToolParams(e.target.value)}
                      rows={3}
                    />
                  </div>
                </>
              )}

              {isAdmin && (
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Scope</label>
                  <div style={styles.typeToggle}>
                    {(['user', 'system'] as const).map((s) => (
                      <button
                        key={s}
                        style={{ ...styles.typeBtn, ...(scope === s ? styles.typeBtnActive : {}) }}
                        onClick={() => setScope(s)}
                      >
                        {s === 'user' ? 'User routine' : 'System routine'}
                      </button>
                    ))}
                  </div>
                  {scope === 'system' && (
                    <div style={styles.hint}>Runs under the system user account. Visible to admins in Mission Control.</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {error && <div style={styles.errorBanner}>{error}</div>}

        <div style={styles.modalFooter}>
          {step > 1 && (
            <button style={styles.backBtn} onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step < 3 ? (
            <button
              style={{ ...styles.nextBtn, opacity: (step === 1 ? step1Valid() : step2Valid()) ? 1 : 0.5 }}
              disabled={step === 1 ? !step1Valid() : !step2Valid()}
              onClick={() => setStep((s) => s + 1)}
            >
              Next
            </button>
          ) : (
            <button
              style={{ ...styles.nextBtn, opacity: step3Valid() ? 1 : 0.5 }}
              disabled={!step3Valid() || submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? 'Creating…' : 'Create Routine'}
            </button>
          )}
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
    zIndex: 1000,
  },
  modal: {
    background: '#fff',
    borderRadius: 10,
    width: 520,
    maxWidth: '95vw',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px 16px',
    borderBottom: '1px solid #e5e7eb',
  },
  modalTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 18,
    cursor: 'pointer',
    color: '#6b7280',
    padding: '0 4px',
  },
  steps: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 24px',
    borderBottom: '1px solid #f3f4f6',
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    marginLeft: 4,
  },
  modalBody: {
    padding: '20px 24px',
    overflowY: 'auto',
    flex: 1,
  },
  modalFooter: {
    display: 'flex',
    alignItems: 'center',
    padding: '16px 24px',
    borderTop: '1px solid #e5e7eb',
    gap: 10,
  },
  backBtn: {
    padding: '8px 16px',
    background: 'transparent',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
    color: '#374151',
  },
  nextBtn: {
    padding: '8px 20px',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
  },
  errorBanner: {
    margin: '0 24px 12px',
    padding: '10px 14px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 6,
    color: '#dc2626',
    fontSize: 13,
  },
  fieldGroup: {
    marginBottom: 18,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
    background: '#fff',
  },
  textarea: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
    resize: 'vertical',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  hint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  typeToggle: {
    display: 'flex',
    gap: 8,
  },
  typeBtn: {
    padding: '7px 14px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    color: '#374151',
  },
  typeBtnActive: {
    background: '#eff6ff',
    borderColor: '#2563eb',
    color: '#2563eb',
    fontWeight: 600,
  },
  presets: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  presetBtn: {
    padding: '6px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  presetBtnActive: {
    background: '#eff6ff',
    borderColor: '#2563eb',
    color: '#2563eb',
  },
  presetCron: {
    fontSize: 10,
    color: '#9ca3af',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  outputOptions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    cursor: 'pointer',
  },
  checkLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    cursor: 'pointer',
    marginBottom: 4,
  },
}
