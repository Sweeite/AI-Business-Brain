'use client'

import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { RememberModal } from './remember-modal'

interface ProvenanceLabel {
  type: 'memory' | 'live' | 'source_unavailable' | 'inference'
  source_ref?: string
  as_of?: string
}

interface Message {
  role: 'user' | 'brain'
  text: string
  provenanceLabels?: ProvenanceLabel[]
  agentRunId?: string
  rating?: number | null
  isAbstention?: boolean
}

interface HistoryRun {
  id: string
  output: string | null
  trigger_context: Record<string, unknown>
  created_at: string
  user_rating: number | null
}

interface Props {
  userId: string
  userEmail: string
  roleName: string
}

export function QueryInterface({ roleName }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [history, setHistory] = useState<HistoryRun[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [correctionFor, setCorrectionFor] = useState<string | null>(null)
  const [correctionText, setCorrectionText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadHistory()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadHistory() {
    try {
      const resp = await fetch('/api/query')
      if (resp.ok) {
        const data = await resp.json() as { history: HistoryRun[] }
        setHistory(data.history)
      }
    } catch {
      // non-fatal
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim() || loading) return

    const q = query.trim()
    setQuery('')
    setMessages((prev) => [...prev, { role: 'user', text: q }])
    setLoading(true)

    try {
      const resp = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      const data = await resp.json() as {
        output?: string
        provenanceLabels?: ProvenanceLabel[]
        agentRunId?: string
        isAbstention?: boolean
        error?: string
      }
      setMessages((prev) => [
        ...prev,
        {
          role: 'brain',
          text: data.output ?? data.error ?? 'Something went wrong.',
          provenanceLabels: data.provenanceLabels ?? [],
          agentRunId: data.agentRunId,
          isAbstention: data.isAbstention,
          rating: null,
        },
      ])
      loadHistory()
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'brain', text: "I'm having trouble reaching my reasoning engine right now. Please try again in a moment." },
      ])
    } finally {
      setLoading(false)
    }
  }

  async function sendRating(agentRunId: string, rating: number) {
    await fetch(`/api/query/${agentRunId}/feedback`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating }),
    })
    setMessages((prev) =>
      prev.map((m) => (m.agentRunId === agentRunId ? { ...m, rating } : m))
    )
  }

  async function sendCorrection(agentRunId: string) {
    if (!correctionText.trim()) return
    await fetch(`/api/query/${agentRunId}/feedback`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: correctionText.trim(), rating: -1 }),
    })
    setMessages((prev) =>
      prev.map((m) => (m.agentRunId === agentRunId ? { ...m, rating: -1 } : m))
    )
    setCorrectionFor(null)
    setCorrectionText('')
  }

  function replayQuery(run: HistoryRun) {
    const q = (run.trigger_context?.query as string) ?? ''
    if (q) setQuery(q)
    setShowHistory(false)
  }

  return (
    <div style={styles.container}>
      <style>{`
        .brain-bubble-text p { margin: 0 0 8px; }
        .brain-bubble-text p:last-child { margin-bottom: 0; }
        .brain-bubble-text ul, .brain-bubble-text ol { margin: 4px 0 8px; padding-left: 20px; }
        .brain-bubble-text li { margin: 2px 0; }
        .brain-bubble-text h1, .brain-bubble-text h2, .brain-bubble-text h3 { margin: 8px 0 4px; font-size: 14px; font-weight: 600; }
        .brain-bubble-text code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
        .brain-bubble-text pre { background: #f3f4f6; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px; margin: 6px 0; }
        .brain-bubble-text strong { font-weight: 600; }
      `}</style>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>Query Interface</span>
        <button style={styles.rememberBtn} onClick={() => setShowModal(true)}>
          + Remember this
        </button>
      </div>

      {/* Messages */}
      <div style={styles.messages}>
        {messages.length === 0 && (
          <div style={styles.emptyState}>
            Ask anything about what the business knows — decisions, preferences, SOPs, client context.
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={msg.role === 'user' ? styles.userBubble : styles.brainBubble}>
            <div style={styles.roleLabel}>{msg.role === 'user' ? 'You' : 'Brain'}</div>
            <div
              className={msg.role === 'brain' ? 'brain-bubble-text' : undefined}
              style={
                msg.isAbstention
                  ? { ...styles.messageText, ...styles.abstentionBox }
                  : styles.messageText
              }
            >
              {msg.role === 'brain' ? (
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              ) : (
                msg.text
              )}
            </div>

            {/* Provenance labels */}
            {msg.provenanceLabels && msg.provenanceLabels.length > 0 && (
              <div style={styles.labelsRow}>
                {msg.provenanceLabels.map((label, li) => (
                  <ProvenanceBadge key={li} label={label} />
                ))}
              </div>
            )}

            {/* Feedback row */}
            {msg.agentRunId && (
              <div style={styles.feedbackRow}>
                <button
                  style={{
                    ...styles.feedbackBtn,
                    ...(msg.rating === 1 ? styles.feedbackActive : {}),
                  }}
                  onClick={() => sendRating(msg.agentRunId!, 1)}
                  title="Helpful"
                >
                  👍
                </button>
                <button
                  style={{
                    ...styles.feedbackBtn,
                    ...(msg.rating === -1 ? styles.feedbackActive : {}),
                  }}
                  onClick={() => sendRating(msg.agentRunId!, -1)}
                  title="Not helpful"
                >
                  👎
                </button>
                <button
                  style={styles.correctionBtn}
                  onClick={() =>
                    setCorrectionFor(correctionFor === msg.agentRunId ? null : msg.agentRunId!)
                  }
                >
                  ✏ This is wrong
                </button>
                {correctionFor === msg.agentRunId && (
                  <div style={styles.correctionBox}>
                    <input
                      style={styles.correctionInput}
                      type="text"
                      value={correctionText}
                      onChange={(e) => setCorrectionText(e.target.value)}
                      placeholder="What's the correct answer?"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') sendCorrection(msg.agentRunId!)
                      }}
                      autoFocus
                    />
                    <button
                      style={styles.correctionSubmit}
                      onClick={() => sendCorrection(msg.agentRunId!)}
                    >
                      Submit
                    </button>
                    <button
                      style={styles.correctionClose}
                      onClick={() => { setCorrectionFor(null); setCorrectionText('') }}
                      title="Cancel"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={styles.brainBubble}>
            <div style={styles.roleLabel}>Brain</div>
            <div style={styles.thinkingDots}>Thinking…</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={styles.inputArea}>
        <textarea
          style={styles.queryInput}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask the brain anything…"
          rows={3}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit(e as unknown as React.FormEvent)
            }
          }}
        />
        <button type="submit" style={styles.sendBtn} disabled={loading || !query.trim()}>
          {loading ? '…' : 'Send'}
        </button>
      </form>

      {/* History */}
      <div style={styles.historySection}>
        <button
          style={styles.historyToggle}
          onClick={() => setShowHistory(!showHistory)}
        >
          History {showHistory ? '▲' : '▾'} ({history.length})
        </button>
        {showHistory && (
          <div style={styles.historyList}>
            {history.length === 0 && (
              <div style={styles.historyEmpty}>No past queries yet.</div>
            )}
            {history.map((run) => (
              <div
                key={run.id}
                style={styles.historyItem}
                onClick={() => replayQuery(run)}
                title="Click to replay this query"
              >
                <div style={styles.historyQuery}>
                  {(run.trigger_context?.query as string) ?? '(no query)'}
                </div>
                <div style={styles.historyMeta}>
                  {new Date(run.created_at).toLocaleDateString()}
                  {run.user_rating === 1 && ' · 👍'}
                  {run.user_rating === -1 && ' · 👎'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <RememberModal isOpen={showModal} onClose={() => setShowModal(false)} roleName={roleName} />
    </div>
  )
}

function ProvenanceBadge({ label }: { label: ProvenanceLabel }) {
  const config: Record<string, { color: string; bg: string; text: string }> = {
    memory: { color: '#1e40af', bg: '#dbeafe', text: 'I know this' },
    live: { color: '#166534', bg: '#dcfce7', text: 'This is live' },
    source_unavailable: { color: '#92400e', bg: '#fef3c7', text: "Couldn't reach source" },
    inference: { color: '#374151', bg: '#f3f4f6', text: 'General inference, not from your business' },
  }
  const c = config[label.type] ?? config.inference
  const detail = label.source_ref
    ? ` · ${label.source_ref}${label.as_of ? ` · ${label.as_of.slice(0, 10)}` : ''}`
    : ''

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 500,
        color: c.color,
        backgroundColor: c.bg,
        marginRight: '6px',
        marginTop: '4px',
      }}
    >
      {c.text}{detail}
    </span>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    gap: '0',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#111',
  },
  rememberBtn: {
    padding: '7px 14px',
    backgroundColor: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    cursor: 'pointer',
    fontWeight: 500,
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    paddingBottom: '8px',
  },
  emptyState: {
    color: '#999',
    fontSize: '14px',
    textAlign: 'center',
    marginTop: '60px',
    lineHeight: 1.6,
  },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '72%',
  },
  brainBubble: {
    alignSelf: 'flex-start',
    maxWidth: '84%',
  },
  roleLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#999',
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  messageText: {
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#111',
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    padding: '10px 14px',
  },
  abstentionBox: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  labelsRow: {
    marginTop: '6px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0',
  },
  feedbackRow: {
    marginTop: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  feedbackBtn: {
    background: 'none',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    padding: '3px 7px',
    cursor: 'pointer',
    fontSize: '14px',
    opacity: 0.6,
  },
  feedbackActive: {
    opacity: 1,
    backgroundColor: '#f3f4f6',
    borderColor: '#9ca3af',
  },
  correctionBtn: {
    background: 'none',
    border: 'none',
    padding: '3px 6px',
    cursor: 'pointer',
    fontSize: '12px',
    color: '#6b7280',
    textDecoration: 'underline',
  },
  correctionBox: {
    display: 'flex',
    gap: '6px',
    width: '100%',
    marginTop: '6px',
  },
  correctionInput: {
    flex: 1,
    padding: '5px 8px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '13px',
  },
  correctionSubmit: {
    padding: '5px 10px',
    background: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  correctionClose: {
    padding: '5px 8px',
    background: 'none',
    color: '#9ca3af',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    fontSize: '16px',
    cursor: 'pointer',
    flexShrink: 0,
    lineHeight: 1,
  },
  thinkingDots: {
    fontSize: '14px',
    color: '#999',
    fontStyle: 'italic',
    padding: '10px 14px',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    backgroundColor: '#fff',
  },
  inputArea: {
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-end',
    marginTop: '12px',
    flexShrink: 0,
  },
  queryInput: {
    flex: 1,
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    resize: 'none',
    fontFamily: 'inherit',
    lineHeight: 1.5,
  },
  sendBtn: {
    padding: '10px 20px',
    backgroundColor: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer',
    fontWeight: 500,
    flexShrink: 0,
  },
  historySection: {
    flexShrink: 0,
    marginTop: '12px',
    borderTop: '1px solid #e5e7eb',
    paddingTop: '10px',
  },
  historyToggle: {
    background: 'none',
    border: 'none',
    fontSize: '13px',
    color: '#6b7280',
    cursor: 'pointer',
    padding: '0',
    fontWeight: 500,
  },
  historyList: {
    marginTop: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: '180px',
    overflowY: 'auto',
  },
  historyEmpty: {
    fontSize: '13px',
    color: '#9ca3af',
    padding: '8px 0',
  },
  historyItem: {
    padding: '8px 10px',
    borderRadius: '4px',
    cursor: 'pointer',
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
  },
  historyQuery: {
    fontSize: '13px',
    color: '#111',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  historyMeta: {
    fontSize: '11px',
    color: '#9ca3af',
    marginTop: '2px',
  },
}
