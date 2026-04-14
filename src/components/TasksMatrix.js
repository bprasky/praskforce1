'use client'
// PraskForce1 — Tasks Matrix View
//
// The Trello-grid alternative to the card stack. Sortable columns,
// optional grouping, and a row-expand that hands off to the same learning
// UI as the card view (so resolution / proposal / chat all still work).
//
// Sorting: client-side (the dataset is small — hundreds of tasks at the
// outside). Grouping is rendered as section headers so Brad can see "all
// tasks for Galbut" at a glance without leaving the table.
//
// The "highest value" sort is the one that matters most in practice — it
// keeps the biggest deals at the top of the board where they can't be
// forgotten.

import { useMemo, useState } from 'react'
import { TASK_TYPES, TASK_STATUS, TASK_SOURCES } from '@/lib/tasks'
import { LIFECYCLE } from '@/lib/task-learning'
import { ChevronUp, ChevronDown, ChevronRight } from 'lucide-react'

const COLUMNS = [
  { id: 'type',      label: 'Type',     sortable: true,  align: 'left',  width: 'w-32' },
  { id: 'contact',   label: 'Client',   sortable: true,  align: 'left',  width: '' },
  { id: 'description', label: 'Description', sortable: false, align: 'left', width: '' },
  { id: 'value',     label: 'Value',    sortable: true,  align: 'right', width: 'w-24' },
  { id: 'quote_ref', label: 'Quote',    sortable: true,  align: 'left',  width: 'w-24' },
  { id: 'deadline',  label: 'Deadline', sortable: true,  align: 'left',  width: 'w-28' },
  { id: 'source',    label: 'Source',   sortable: true,  align: 'left',  width: 'w-24' },
  { id: 'lifecycle', label: 'Stage',    sortable: true,  align: 'left',  width: 'w-24' },
  { id: 'status',    label: 'Status',   sortable: true,  align: 'left',  width: 'w-24' },
]

function fmtMoney(n) {
  if (n == null || n === '' || isNaN(Number(n))) return '—'
  const v = Number(n)
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}k`
  return `$${v.toFixed(0)}`
}

function compareValues(a, b, key, dir) {
  let va = a[key]
  let vb = b[key]
  // Value sort: nulls last regardless of direction so big deals always
  // surface and "no value yet" tasks fall to the bottom.
  if (key === 'value') {
    const na = va == null ? -Infinity : Number(va)
    const nb = vb == null ? -Infinity : Number(vb)
    return dir === 'asc' ? na - nb : nb - na
  }
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  if (typeof va === 'string') va = va.toLowerCase()
  if (typeof vb === 'string') vb = vb.toLowerCase()
  if (va < vb) return dir === 'asc' ? -1 : 1
  if (va > vb) return dir === 'asc' ? 1 : -1
  return 0
}

export default function TasksMatrix({
  tasks,
  expandedId,
  onExpand,
  renderExpanded,
  groupBy = 'none',
  initialSort = { key: 'value', dir: 'desc' },
}) {
  const [sort, setSort] = useState(initialSort)

  const sorted = useMemo(() => {
    const copy = [...tasks]
    copy.sort((a, b) => compareValues(a, b, sort.key, sort.dir))
    return copy
  }, [tasks, sort])

  // Group sorted tasks by the chosen field. Each group keeps the sorted
  // order from above — so within "Galbut" the highest-value tasks still
  // float to the top of that group.
  const groups = useMemo(() => {
    if (groupBy === 'none') return [{ key: null, label: null, rows: sorted }]
    const map = new Map()
    for (const t of sorted) {
      let key
      if (groupBy === 'contact') key = t.contact || '(no client)'
      else if (groupBy === 'type') key = t.type || 'CUSTOM'
      else if (groupBy === 'source') key = t.source || 'manual'
      else key = '_'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(t)
    }
    // Sum value per group so the group headers can rank by total deal
    // value — useful when grouping by client.
    return Array.from(map.entries())
      .map(([key, rows]) => ({
        key,
        label: groupBy === 'type' ? (TASK_TYPES[key]?.label || key) : key,
        rows,
        totalValue: rows.reduce((s, r) => s + (Number(r.value) || 0), 0),
        openCount: rows.filter(r => r.status !== 'done').length,
      }))
      .sort((a, b) => b.totalValue - a.totalValue || b.openCount - a.openCount)
  }, [sorted, groupBy])

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="w-6"></th>
            {COLUMNS.map(col => {
              const active = sort.key === col.id
              return (
                <th
                  key={col.id}
                  onClick={() => col.sortable && toggleSort(col.id)}
                  className={`${col.width} px-2 py-2 text-${col.align} font-semibold text-gray-600 uppercase tracking-wider text-[10px] ${
                    col.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                  }`}
                >
                  <span className="inline-flex items-center gap-0.5">
                    {col.label}
                    {col.sortable && active && (
                      sort.dir === 'asc'
                        ? <ChevronUp size={10} />
                        : <ChevronDown size={10} />
                    )}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {groups.map(group => (
            <GroupRows
              key={group.key || '_all'}
              group={group}
              expandedId={expandedId}
              onExpand={onExpand}
              renderExpanded={renderExpanded}
            />
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="px-4 py-8 text-center text-gray-400 text-xs">
                No tasks match your filters
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function GroupRows({ group, expandedId, onExpand, renderExpanded }) {
  return (
    <>
      {group.label != null && (
        <tr className="bg-gray-50/70 border-t border-gray-200">
          <td colSpan={COLUMNS.length + 1} className="px-3 py-1.5">
            <div className="flex items-center gap-3 text-[11px]">
              <span className="font-semibold text-gray-700">{group.label}</span>
              <span className="text-gray-400">{group.openCount} open</span>
              {group.totalValue > 0 && (
                <span className="text-emerald-700 font-semibold">{fmtMoney(group.totalValue)} total</span>
              )}
            </div>
          </td>
        </tr>
      )}
      {group.rows.map(task => (
        <TaskRow
          key={task.id}
          task={task}
          isOpen={expandedId === task.id}
          onClick={() => onExpand(expandedId === task.id ? null : task.id)}
          renderExpanded={renderExpanded}
        />
      ))}
    </>
  )
}

function TaskRow({ task, isOpen, onClick, renderExpanded }) {
  const tt = TASK_TYPES[task.type] || TASK_TYPES.CUSTOM
  const ts = TASK_STATUS[task.status] || TASK_STATUS.pending
  const lc = LIFECYCLE[task.lifecycle] || null
  const src = TASK_SOURCES[task.source] || TASK_SOURCES.manual
  return (
    <>
      <tr
        onClick={onClick}
        className={`border-t border-gray-100 cursor-pointer hover:bg-amber-50/30 transition-colors ${
          isOpen ? 'bg-amber-50/40' : ''
        }`}
      >
        <td className="px-1 text-gray-300">
          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </td>
        <td className="px-2 py-2">
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${tt.bg} ${tt.color}`}>
            <span>{tt.icon}</span> {tt.label}
          </span>
        </td>
        <td className="px-2 py-2 text-gray-700 truncate max-w-[160px]">
          {task.contact || '—'}
        </td>
        <td className="px-2 py-2 text-gray-800">
          <div className="truncate max-w-[400px]">{task.description || <span className="text-gray-400">No description</span>}</div>
          {task.property && <div className="text-[10px] text-gray-400 truncate">{task.property}</div>}
        </td>
        <td className="px-2 py-2 text-right font-semibold text-emerald-700">
          {fmtMoney(task.value)}
        </td>
        <td className="px-2 py-2 font-mono text-[10px] text-blue-700">
          {task.quote_ref || '—'}
        </td>
        <td className="px-2 py-2 text-gray-600">
          {task.deadline || '—'}
        </td>
        <td className="px-2 py-2">
          <span className={`text-[10px] ${src.color}`}>
            <span className="mr-0.5">{src.icon}</span>{src.label}
          </span>
        </td>
        <td className="px-2 py-2">
          {lc && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider ${lc.bg} ${lc.color}`}>
              {lc.label}
            </span>
          )}
        </td>
        <td className="px-2 py-2">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${ts.bg} ${ts.color}`}>
            {ts.label}
          </span>
        </td>
      </tr>
      {isOpen && renderExpanded && (
        <tr className="bg-gray-50/50">
          <td></td>
          <td colSpan={COLUMNS.length} className="px-3 py-3">
            {renderExpanded(task)}
          </td>
        </tr>
      )}
    </>
  )
}
