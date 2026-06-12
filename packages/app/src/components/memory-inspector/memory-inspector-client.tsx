'use client'

import { useState, useEffect, useRef } from 'react'
import { ConfirmModal } from '@/components/confirm-modal'

interface Memory {
  id: string
  type: string
  content: string
  source_refs: unknown
  created_at: string
  last_retrieved_at: string | null
  sensitivity_level: string
  zone: string | null
  namespace: string
  status: string
  valid_from: string
  valid_to: string | null
}

interface Filters {
  type: string
  entity_type: string
  entity_name: string
  sensitivity_level: string
  status: string
  source: string
  search: string
  date_from: string
  date_to: string
}

interface Props {
  isAdmin: boolean
}

const SENSITIVITY_LEVELS = ['public', 'internal', 'management', 'leadership']
const LEVEL_ORDER: Record<string, number> = { public: 1, internal: 2, management: 3, leadership: 4 }
const SENSITIVITY_COLORS: Record<string, string> = {
  public: '#16a34a',
  internal: '#2563eb',
  management: '#d97706',
  leadership: '#dc2626',
}

function formatSourceRefs(sourceRefs: unknown): string {
  if (!sourceRefs) return '—'
  if (Array.isArray(sourceRefs)) {
    const connectors = [
      ...new Set(
        sourceRefs
          .map((r: unknown) => (r && typeof r === 'object' ? (r as Record<string, unknown>).connector_type : null))
          .filter(Boolean)
      ),
    ] as string[]
    if (connectors.length > 0) return connectors.join(', ')
    return `${sourceRefs.length} source(s)`
  }
  return '—'
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function MemoryInspectorClient({ isAdmin }: Props) {
  const [memories, setMemories] = useState<Memory[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [invalidateTarget, setInvalidateTarget] = useState<Memory | null>(null)
  const [filters, setFilters] = useState<Filters>({
    type: '',
    entity_type: '',
    entity_name: '',
    sensitivity_level: '',
    status: 'active',
    source: '',
    search: '',
    date_from: '',
    date_to: '',
  })

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void fetchMemories(0)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  useEffect(() => {
    void fetchMemories(page)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  async function fetchMemories(targetPage: number) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(targetPage))
      if (filters.type) params.set('type', filters.type)
      if (filters.entity_type) params.set('entity_type', filters.entity_type)
      if (filters.entity_name) params.set('entity_name', filters.entity_name)
      if (filters.sensitivity_level) params.set('sensitivity_level', filters.sensitivity_level)
      if (filters.status) params.set('status', filters.status)
      if (filters.source) params.set('source', filters.source)
      if (filters.search) params.set('search', filters.search)
      if (filters.date_from) params.set('date_from', filters.date_from)
      if (filters.date_to) params.set('date_to', filters.date_to)

      const resp = await fetch(`/api/memory?${params.toString()}`)
      if (!resp.ok) {
        const data = await resp.json() as { error?: string }
        setError(data.error ?? 'Failed to load memories')
        return
      }
      const data = await resp.json() as { memories: Memory[]; total: number; page: number }
      setMemories(data.memories)
      setTotal(data.total)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const DEFAULT_FILTERS: Filters = {
    type: '',
    entity_type: '',
    entity_name: '',
    sensitivity_level: '',
    status: 'active',
    source: '',
    search: '',
    date_from: '',
    date_to: '',
  }

  const hasActiveFilters =
    filters.type !== '' ||
    filters.entity_type !== '' ||
    filters.sensitivity_level !== '' ||
    filters.status !== 'active' ||
    filters.source !== '' ||
    filters.search !== '' ||
    filters.date_from !== '' ||
    filters.date_to !== ''

  function onFilterChange(key: keyof Filters, value: string) {
    setPage(0)
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function clearFilters() {
    setPage(0)
    setFilters(DEFAULT_FILTERS)
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function doInvalidate(memory: Memory) {
    setInvalidateTarget(null)
    setActionLoading(memory.id)
    try {
      const resp = await fetch(`/api/memory/${memory.id}/invalidate`, { method: 'POST' })
      if (!resp.ok) {
        const data = await resp.json() as { error?: string }
        setError(data.error ?? 'Failed to invalidate')
        return
      }
      void fetchMemories(page)
    } finally {
      setActionLoading(null)
    }
  }

  function openEdit(memory: Memory) {
    setEditingMemory(memory)
    setEditContent(memory.content)
  }

  async function handleEditSubmit() {
    if (!editingMemory) return
    setEditLoading(true)
    try {
      const resp = await fetch(`/api/memory/${editingMemory.id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      })
      if (!resp.ok) {
        const data = await resp.json() as { error?: string }
        alert(data.error ?? 'Failed to edit')
        return
      }
      setEditingMemory(null)
      void fetchMemories(page)
    } finally {
      setEditLoading(false)
    }
  }

  async function handleBroaden(memory: Memory, newLevel: string) {
    if (!newLevel) return
    setActionLoading(memory.id + ':broaden')
    try {
      const resp = await fetch(`/api/memory/${memory.id}/broaden`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensitivity_level: newLevel }),
      })
      if (!resp.ok) {
        const data = await resp.json() as { error?: string }
        alert(data.error ?? 'Failed to broaden')
        return
      }
      void fetchMemories(page)
    } finally {
      setActionLoading(null)
    }
  }

  const totalPages = Math.ceil(total / 20)

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Memory Inspector</h1>
      <p style={styles.subheading}>{total} record{total !== 1 ? 's' : ''} found</p>

      {/* Filter bar */}
      <div style={styles.filterBar}>
        <input
          type="text"
          placeholder="Search content..."
          value={filters.search}
          onChange={(e) => onFilterChange('search', e.target.value)}
          style={styles.filterInput}
        />
        <select
          value={filters.type}
          onChange={(e) => onFilterChange('type', e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All types</option>
          <option value="episodic">Episodic</option>
          <option value="semantic">Semantic</option>
          <option value="procedural">Procedural</option>
        </select>
        <select
          value={filters.status}
          onChange={(e) => onFilterChange('status', e.target.value)}
          style={styles.filterSelect}
        >
          <option value="active">Active</option>
          <option value="invalidated">Invalidated</option>
          <option value="all">All statuses</option>
        </select>
        <select
          value={filters.sensitivity_level}
          onChange={(e) => onFilterChange('sensitivity_level', e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All levels</option>
          {SENSITIVITY_LEVELS.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <select
          value={filters.source}
          onChange={(e) => onFilterChange('source', e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All sources</option>
          <option value="gmail">Gmail</option>
          <option value="google_drive">Google Drive</option>
        </select>
        <select
          value={filters.entity_type}
          onChange={(e) => {
            setPage(0)
            setFilters((prev) => ({ ...prev, entity_type: e.target.value, entity_name: '' }))
          }}
          style={styles.filterSelect}
        >
          <option value="">All entities</option>
          <option value="org">Org-wide</option>
          <option value="client">Client</option>
          <option value="project">Project</option>
        </select>
        {(filters.entity_type === 'client' || filters.entity_type === 'project') && (
          <input
            type="text"
            placeholder={filters.entity_type === 'client' ? 'Client name…' : 'Project name…'}
            value={filters.entity_name}
            onChange={(e) => onFilterChange('entity_name', e.target.value)}
            style={{ ...styles.filterInput, width: '140px', minWidth: '0' }}
          />
        )}
        <input
          type="date"
          value={filters.date_from}
          onChange={(e) => onFilterChange('date_from', e.target.value)}
          style={styles.filterDate}
          title="From date"
        />
        <input
          type="date"
          value={filters.date_to}
          onChange={(e) => onFilterChange('date_to', e.target.value)}
          style={styles.filterDate}
          title="To date"
        />
        {(filters.date_from || filters.date_to) && (
          <button
            onClick={() => { onFilterChange('date_from', ''); onFilterChange('date_to', '') }}
            style={styles.clearDateBtn}
            title="Clear date range"
          >
            ×
          </button>
        )}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            style={styles.clearFiltersBtn}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Error */}
      {error && <div style={styles.errorBox}>{error}</div>}

      {/* Loading */}
      {loading && <div style={styles.loadingText}>Loading...</div>}

      {/* Memory list */}
      {!loading && memories.length === 0 && (
        <div style={styles.emptyText}>No memories match the current filters.</div>
      )}

      {memories.map((memory) => {
        const isExpanded = expandedIds.has(memory.id)
        const truncated = memory.content.length > 200
        const displayContent = isExpanded || !truncated
          ? memory.content
          : memory.content.slice(0, 200) + '…'
        const isInvalidated = memory.status === 'invalidated'
        const broaderLevels = SENSITIVITY_LEVELS.filter(
          (l) => LEVEL_ORDER[l] < LEVEL_ORDER[memory.sensitivity_level]
        )

        return (
          <div key={memory.id} style={{ ...styles.card, opacity: isInvalidated ? 0.65 : 1 }}>
            <div style={styles.cardHeader}>
              <div style={styles.badges}>
                <span style={styles.typeBadge}>{memory.type}</span>
                <span
                  style={{
                    ...styles.levelBadge,
                    backgroundColor: SENSITIVITY_COLORS[memory.sensitivity_level] ?? '#666',
                  }}
                >
                  {memory.sensitivity_level}
                </span>
                {isInvalidated && <span style={styles.invalidBadge}>invalidated</span>}
                <span style={styles.namespaceBadge}>{memory.namespace}</span>
                {memory.zone && <span style={styles.zoneBadge}>{memory.zone}</span>}
              </div>
              {isAdmin && !isInvalidated && (
                <div style={styles.actions}>
                  {broaderLevels.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => { void handleBroaden(memory, e.target.value) }}
                      style={styles.broadenSelect}
                      disabled={actionLoading === memory.id + ':broaden'}
                    >
                      <option value="" disabled>Broaden…</option>
                      {broaderLevels.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={() => openEdit(memory)}
                    style={styles.editBtn}
                    disabled={actionLoading === memory.id}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setInvalidateTarget(memory)}
                    style={styles.invalidateBtn}
                    disabled={actionLoading === memory.id}
                  >
                    {actionLoading === memory.id ? '…' : 'Invalidate'}
                  </button>
                </div>
              )}
            </div>

            <p style={styles.content}>{displayContent}</p>
            {truncated && (
              <button onClick={() => toggleExpand(memory.id)} style={styles.expandBtn}>
                {isExpanded ? 'Show less' : 'Show more'}
              </button>
            )}

            <div style={styles.meta}>
              <span>Source: {formatSourceRefs(memory.source_refs)}</span>
              <span>Created: {formatDate(memory.created_at)}</span>
              <span>Last retrieved: {formatDate(memory.last_retrieved_at)}</span>
              {isInvalidated && memory.valid_to && (
                <span>Invalidated: {formatDate(memory.valid_to)}</span>
              )}
            </div>
          </div>
        )
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            style={styles.pageBtn}
          >
            Previous
          </button>
          <span style={styles.pageInfo}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages - 1 || loading}
            style={styles.pageBtn}
          >
            Next
          </button>
        </div>
      )}

      {/* Invalidate confirm modal */}
      {invalidateTarget && (
        <ConfirmModal
          title="Invalidate memory"
          message={`"${invalidateTarget.content.slice(0, 120)}${invalidateTarget.content.length > 120 ? '…' : ''}"\n\nThis sets the record to invalidated and cannot be undone.`}
          confirmLabel="Invalidate"
          onConfirm={() => { void doInvalidate(invalidateTarget) }}
          onCancel={() => setInvalidateTarget(null)}
          dangerous
        />
      )}

      {/* Edit modal */}
      {editingMemory && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h2 style={styles.modalHeading}>Edit Memory</h2>
            <p style={styles.modalHint}>
              Editing invalidates the current record and creates a new one. All metadata is inherited.
            </p>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              style={styles.textarea}
              rows={10}
            />
            <div style={styles.modalActions}>
              <button
                onClick={() => setEditingMemory(null)}
                style={styles.cancelBtn}
                disabled={editLoading}
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleEditSubmit() }}
                style={styles.saveBtn}
                disabled={editLoading || !editContent.trim()}
              >
                {editLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: '900px' },
  heading: { fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: '#111' },
  subheading: { fontSize: '13px', color: '#888', marginBottom: '20px' },
  filterBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '20px',
    padding: '16px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  },
  filterInput: {
    padding: '6px 10px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '13px',
    flex: 1,
    minWidth: '180px',
  },
  filterSelect: {
    padding: '6px 10px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '13px',
    backgroundColor: '#fff',
  },
  filterDate: {
    padding: '6px 8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '13px',
  },
  clearDateBtn: {
    padding: '4px 8px',
    fontSize: '16px',
    lineHeight: '1',
    background: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#6b7280',
  },
  clearFiltersBtn: {
    padding: '6px 12px',
    fontSize: '12px',
    background: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#374151',
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fca5a5',
    color: '#b91c1c',
    padding: '12px 16px',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '13px',
  },
  loadingText: { color: '#888', fontSize: '14px', marginBottom: '16px' },
  emptyText: { color: '#888', fontSize: '14px', padding: '40px 0', textAlign: 'center' },
  card: {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '12px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '10px',
    gap: '12px',
  },
  badges: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' },
  typeBadge: {
    padding: '2px 8px',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  levelBadge: {
    padding: '2px 8px',
    color: '#fff',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
  },
  invalidBadge: {
    padding: '2px 8px',
    backgroundColor: '#6b7280',
    color: '#fff',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
  },
  namespaceBadge: {
    padding: '2px 8px',
    backgroundColor: '#ede9fe',
    color: '#5b21b6',
    borderRadius: '4px',
    fontSize: '11px',
  },
  zoneBadge: {
    padding: '2px 8px',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    borderRadius: '4px',
    fontSize: '11px',
  },
  actions: { display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 },
  broadenSelect: {
    padding: '4px 8px',
    fontSize: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    backgroundColor: '#fff',
    cursor: 'pointer',
  },
  editBtn: {
    padding: '4px 10px',
    fontSize: '12px',
    border: '1px solid #2563eb',
    borderRadius: '4px',
    backgroundColor: '#fff',
    color: '#2563eb',
    cursor: 'pointer',
  },
  invalidateBtn: {
    padding: '4px 10px',
    fontSize: '12px',
    border: '1px solid #dc2626',
    borderRadius: '4px',
    backgroundColor: '#fff',
    color: '#dc2626',
    cursor: 'pointer',
  },
  content: {
    fontSize: '14px',
    lineHeight: '1.6',
    color: '#111',
    margin: '0 0 8px',
    whiteSpace: 'pre-wrap',
  },
  expandBtn: {
    background: 'none',
    border: 'none',
    color: '#2563eb',
    fontSize: '12px',
    cursor: 'pointer',
    padding: 0,
    marginBottom: '8px',
  },
  meta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    fontSize: '12px',
    color: '#6b7280',
    borderTop: '1px solid #f3f4f6',
    paddingTop: '8px',
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginTop: '24px',
    justifyContent: 'center',
  },
  pageBtn: {
    padding: '6px 16px',
    fontSize: '13px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    backgroundColor: '#fff',
    cursor: 'pointer',
  },
  pageInfo: { fontSize: '13px', color: '#374151' },
  modalOverlay: {
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
    borderRadius: '10px',
    padding: '28px',
    width: '600px',
    maxWidth: '90vw',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  modalHeading: { fontSize: '18px', fontWeight: 700, margin: 0 },
  modalHint: { fontSize: '12px', color: '#6b7280', margin: 0 },
  textarea: {
    padding: '10px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '13px',
    lineHeight: '1.6',
    resize: 'vertical',
    fontFamily: 'system-ui, sans-serif',
  },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '10px' },
  cancelBtn: {
    padding: '8px 18px',
    fontSize: '13px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#fff',
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '8px 18px',
    fontSize: '13px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#111',
    color: '#fff',
    cursor: 'pointer',
  },
}
