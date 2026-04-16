'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  TASK_TYPES, RESOLUTIONS, ORIGIN_TYPES,
  listTaskTrees, resolveTask, createTaskWithLineage,
} from '@/lib/tasks'
import {
  ChevronDown, ChevronRight, CheckCircle, Plus, AlertTriangle, Zap,
  Trash2, Clock, Link2, X, RefreshCw
} from 'lucide-react'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function daysBetween(a, b) {
  if (!a || !b) return null
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400_000)
}

// ── Resolve dropdown ────────────────────────────────────────────────

function ResolveControl({ task, onResolve, onCancel }) {
  const [resolution, setResolution] = useState('won')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit() {
    if (!note.trim()) {
      setError('Note is required — briefly say WHY this resolution')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onResolve({ resolution, resolvedNote: note.trim() })
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-2 p-3 bg-white border border-amber-300 rounded-lg space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-700">Resolve as:</span>
        <select
          value={resolution}
          onChange={e => setResolution(e.target.value)}
          className="text-xs border border-gray-200 rounded px-2 py-1 outline-none bg-white"
        >
          {Object.entries(RESOLUTIONS)
            .filter(([k]) => k !== 'open')
            .map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Why this resolution? (required — this is what pattern detection uses)"
        rows={2}
        className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-amber-400"
      />
      {error && (
        <div className="text-[11px] text-red-600 flex items-center gap-1">
          <AlertTriangle size={10} /> {error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-2.5 py-1 bg-amber-500 text-white rounded text-[11px] font-medium hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-500"
        >
          {submitting ? 'Resolving…' : 'Confirm'}
        </button>
        <button
          onClick={onCancel}
          className="px-2.5 py-1 text-[11px] text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Add-child control ───────────────────────────────────────────────

function AddChildControl({ onAdd, onCancel }) {
  const [type, setType] = useState('FOLLOW_UP')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit() {
    if (!description.trim()) {
      setError('Description required')
      return
    }
    setSubmitting(true)
    try {
      await onAdd({ type, description: description.trim() })
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-2 p-3 bg-white border border-indigo-300 rounded-lg space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-700">New child:</span>
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          className="text-xs border border-gray-200 rounded px-2 py-1 outline-none bg-white"
        >
          {Object.entries(TASK_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
        </select>
      </div>
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="What needs to happen?"
        rows={2}
        className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-indigo-400"
      />
      {error && <div className="text-[11px] text-red-600">{error}</div>}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-2.5 py-1 bg-indigo-500 text-white rounded text-[11px] font-medium hover:bg-indigo-600 disabled:bg-gray-200"
        >
          {submitting ? 'Adding…' : 'Add'}
        </button>
        <button onClick={onCancel} className="px-2.5 py-1 text-[11px] text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Task node (recursive) ──────────────────────────────────────────

function TaskNode({ node, depth, onChange, cascadeHint, clearCascadeHint }) {
  const [collapsed, setCollapsed] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [addingChild, setAddingChild] = useState(false)

  const tt = TASK_TYPES[node.category || node.type] || TASK_TYPES.CUSTOM
  const resolution = node.resolution || 'open'
  const resInfo = RESOLUTIONS[resolution] || RESOLUTIONS.open
  const isResolved = resolution !== 'open'

  const daysOld = node.resolved_at
    ? daysBetween(node.created_at, node.resolved_at)
    : daysBetween(node.created_at, new Date().toISOString())

  const hasCascadeHint = cascadeHint && cascadeHint.parent_task_id === node.id

  async function handleResolve({ resolution, resolvedNote }) {
    const result = await resolveTask(node.id, { resolution, resolvedNote })
    setResolving(false)
    onChange({ cascade_hint: result.cascade_hint })
  }

  async function handleAddChild({ type, description }) {
    await createTaskWithLineage({
      type,
      description,
      parentTaskId: node.id,
      originId: node.origin_id,
      originType: node.origin_type,
      propertyId: node.property_id,
      accountId: node.account_id,
      pipelineDealId: node.pipeline_deal_id,
      status: 'ready',
      source: 'manual',
    })
    setAddingChild(false)
    onChange({})
  }

  // Visual: indent by depth (within this origin), color the left guide
  // bar by resolution state for at-a-glance scanning.
  const guideColor = {
    open:     'bg-blue-300',
    won:      'bg-green-400',
    lost:     'bg-red-400',
    stale:    'bg-gray-300',
    merged:   'bg-purple-300',
    deferred: 'bg-yellow-300',
  }[resolution] || 'bg-gray-300'

  return (
    <div className="relative">
      <div
        className="flex items-start gap-2 py-1.5 pl-2 border-l-2 rounded-r hover:bg-gray-50/60 transition-colors"
        style={{ marginLeft: depth * 20, borderLeftColor: 'transparent' }}
      >
        {/* Left guide bar */}
        <div className={`absolute left-0 top-1 bottom-1 w-0.5 ${guideColor}`} style={{ marginLeft: depth * 20 }} />

        {/* Collapse toggle (if has children) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`text-gray-400 hover:text-gray-700 shrink-0 mt-0.5 ${node.children?.length ? 'visible' : 'invisible'}`}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>

        {/* Category icon */}
        <span className="text-sm shrink-0 mt-0.5">{tt.icon}</span>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tt.bg} ${tt.color}`}>
              {tt.label}
            </span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${resInfo.bg} ${resInfo.color} ${resInfo.border}`}>
              {resInfo.label}
            </span>
            <span className="text-sm text-gray-800 truncate">
              {node.title || node.description || '(no title)'}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
            {isResolved ? (
              <>
                <span>Resolved {formatDate(node.resolved_at)}</span>
                {daysOld != null && <span>· {daysOld}d lifetime</span>}
              </>
            ) : (
              <span>Opened {formatDate(node.created_at)}{daysOld != null ? ` · ${daysOld}d old` : ''}</span>
            )}
            {node.depth > 0 && <span>· depth {node.depth}</span>}
          </div>
          {isResolved && node.resolved_note && (
            <div className="mt-1 text-[11px] text-gray-600 italic border-l-2 border-gray-200 pl-2">
              {node.resolved_note}
            </div>
          )}

          {/* Resolving form */}
          {resolving && (
            <ResolveControl
              task={node}
              onResolve={handleResolve}
              onCancel={() => setResolving(false)}
            />
          )}

          {/* Add-child form */}
          {addingChild && (
            <AddChildControl
              onAdd={handleAddChild}
              onCancel={() => setAddingChild(false)}
            />
          )}

          {/* Cascade hint banner on this node */}
          {hasCascadeHint && (
            <div className="mt-2 p-2 bg-amber-50 border border-amber-300 rounded flex items-center gap-2">
              <AlertTriangle size={12} className="text-amber-600 shrink-0" />
              <div className="flex-1 text-[11px] text-amber-800">
                {cascadeHint.message}
              </div>
              <button
                onClick={() => {
                  clearCascadeHint()
                  setResolving(true)
                }}
                className="text-[10px] px-2 py-0.5 bg-amber-500 text-white rounded hover:bg-amber-600"
              >
                Resolve
              </button>
              <button
                onClick={clearCascadeHint}
                className="text-amber-600 hover:text-amber-900"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {!isResolved && !resolving && (
            <button
              onClick={() => setResolving(true)}
              className="p-1 text-gray-400 hover:text-green-600"
              title="Resolve this task"
            >
              <CheckCircle size={13} />
            </button>
          )}
          {!resolving && (
            <button
              onClick={() => setAddingChild(!addingChild)}
              className="p-1 text-gray-400 hover:text-indigo-600"
              title="Add child task"
            >
              <Plus size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Children (recurse) */}
      {!collapsed && node.children?.length > 0 && (
        <div className="relative">
          {node.children.map(child => (
            <TaskNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onChange={onChange}
              cascadeHint={cascadeHint}
              clearCascadeHint={clearCascadeHint}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tree (per-origin wrapper) ───────────────────────────────────────

function TreeCard({ tree, onChange, cascadeHint, clearCascadeHint }) {
  const [collapsed, setCollapsed] = useState(tree.summary.is_terminal)

  const originInfo = ORIGIN_TYPES[tree.origin.origin_type] || ORIGIN_TYPES.manual
  const s = tree.summary
  const outcome = s.total === 0
    ? 'empty'
    : s.open > 0
      ? 'active'
      : s.won > 0
        ? 'won'
        : s.lost > 0
          ? 'lost'
          : 'closed'

  const outcomeColors = {
    active: 'border-blue-200 bg-blue-50/40',
    won:    'border-green-300 bg-green-50/40',
    lost:   'border-red-300 bg-red-50/40',
    closed: 'border-gray-300 bg-gray-50/40',
    empty:  'border-gray-200 bg-white',
  }

  return (
    <div className={`rounded-lg border ${outcomeColors[outcome]} overflow-hidden mb-3`}>
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/50 transition-colors text-left"
      >
        {collapsed ? <ChevronRight size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
        <span className="text-base shrink-0">{originInfo.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 truncate">{tree.origin.title}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${originInfo.bg} ${originInfo.color}`}>
              {originInfo.label}
            </span>
            <span className="text-[10px] text-gray-400">{formatDate(tree.origin.created_at)}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-600">
            <span>{s.total} tasks</span>
            <span className="text-blue-700">{s.open} open</span>
            {s.won > 0 && <span className="text-green-700">{s.won} won</span>}
            {s.lost > 0 && <span className="text-red-700">{s.lost} lost</span>}
            {s.stale > 0 && <span className="text-gray-500">{s.stale} stale</span>}
            <span className="text-gray-400">depth {s.max_depth}</span>
          </div>
        </div>
      </button>

      {/* Tree body */}
      {!collapsed && (
        <div className="px-3 pt-2 pb-3 border-t border-gray-200 bg-white/60">
          {tree.roots.length === 0 ? (
            <p className="text-xs text-gray-400 italic px-2">No tasks in this tree yet</p>
          ) : (
            tree.roots.map(root => (
              <TaskNode
                key={root.id}
                node={root}
                depth={0}
                onChange={onChange}
                cascadeHint={cascadeHint}
                clearCascadeHint={clearCascadeHint}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Top-level TreeView component ────────────────────────────────────

export default function TaskTreeView({ onRefresh }) {
  const [trees, setTrees] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('active') // 'active' | 'terminal' | 'all'
  const [cascadeHint, setCascadeHint] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listTaskTrees()
      setTrees(data || [])
    } catch (e) {
      console.warn('Failed to load trees', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    if (filter === 'terminal') return trees.filter(t => t.summary.is_terminal)
    if (filter === 'active') return trees.filter(t => !t.summary.is_terminal)
    return trees
  }, [trees, filter])

  const handleChange = useCallback(async ({ cascade_hint }) => {
    if (cascade_hint) setCascadeHint(cascade_hint)
    await load()
    if (onRefresh) onRefresh()
  }, [load, onRefresh])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg overflow-hidden">
          {[
            { id: 'active',   label: `Active (${trees.filter(t => !t.summary.is_terminal).length})` },
            { id: 'terminal', label: `Terminal (${trees.filter(t => t.summary.is_terminal).length})` },
            { id: 'all',      label: `All (${trees.length})` },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1 text-[11px] font-medium ${
                filter === f.id ? 'bg-amber-500 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          className="p-1.5 text-gray-500 hover:text-amber-600 rounded hover:bg-gray-100"
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-gray-400 py-6 text-center">Loading trees…</div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <Zap size={24} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-600 mb-1">No task trees in this view yet</p>
          <p className="text-[11px] text-gray-400">
            Enter meeting notes, run an agent scan, or add a manual task to seed a tree.
          </p>
        </div>
      ) : (
        visible.map(tree => (
          <TreeCard
            key={tree.origin.id}
            tree={tree}
            onChange={handleChange}
            cascadeHint={cascadeHint}
            clearCascadeHint={() => setCascadeHint(null)}
          />
        ))
      )}
    </div>
  )
}
