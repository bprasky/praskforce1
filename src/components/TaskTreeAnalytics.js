'use client'
import { useEffect, useState, useMemo } from 'react'
import {
  getTreeAnalytics, TASK_TYPES, RESOLUTIONS,
} from '@/lib/tasks'
import { TrendingUp, Trophy, TrendingDown, Target, Clock, AlertTriangle, Zap, RefreshCw } from 'lucide-react'

// Minimum terminal trees required before analytics unlock.
// With less than this, the numbers don't mean anything yet.
const MIN_TERMINAL_TREES = 5

// ── helpers ─────────────────────────────────────────────────────────

function fmtDays(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  const v = Number(n)
  if (v < 1) return `${(v * 24).toFixed(1)}h`
  return `${v.toFixed(1)}d`
}

function Card({ title, icon: Icon, children, className = '' }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon size={14} className="text-gray-400" />}
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  )
}

// ── component ───────────────────────────────────────────────────────

export default function TaskTreeAnalytics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const d = await getTreeAnalytics()
      setData(d)
    } catch (e) {
      console.warn('analytics load failed', e)
      setData({ summaries: [], patterns: [], terminal_trees: 0, source: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Aggregate derived metrics from the raw summaries + patterns so
  // the UI components stay simple. All heavy lifting is here.
  const derived = useMemo(() => {
    if (!data) return null
    const summaries = data.summaries || []
    const patterns = data.patterns || []
    const terminal = summaries.filter(s => s.is_terminal)
    const won = terminal.filter(s => s.tree_outcome === 'won')
    const lost = terminal.filter(s => s.tree_outcome === 'lost')

    const avgLifespan = arr => {
      const vals = arr.map(s => s.lifespan_days).filter(v => v != null && v > 0)
      if (vals.length === 0) return null
      return vals.reduce((a, b) => a + b, 0) / vals.length
    }

    const avgDepth = arr => {
      const vals = arr.map(s => s.max_depth ?? 0)
      if (vals.length === 0) return null
      return vals.reduce((a, b) => a + b, 0) / vals.length
    }

    // Death-point categories: for lost trees, which category had the
    // most resolved-late tasks? Approximation: most common category
    // among tasks resolved 'lost' or 'stale'.
    const deathPoints = {}
    for (const p of patterns) {
      if (p.tree_outcome !== 'lost') continue
      if (p.resolution !== 'lost' && p.resolution !== 'stale') continue
      deathPoints[p.category] = (deathPoints[p.category] || 0) + (p.task_count || 0)
    }
    const deathPointList = Object.entries(deathPoints)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)

    // Heatmap matrix: rows = top 8 categories (by total count across
    // all patterns), columns = resolutions. Cell = count.
    const totalsByCategory = {}
    for (const p of patterns) {
      totalsByCategory[p.category] = (totalsByCategory[p.category] || 0) + (p.task_count || 0)
    }
    const topCategories = Object.entries(totalsByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([cat]) => cat)
    const resolutionCols = ['won', 'lost', 'stale', 'merged', 'deferred']
    const heatmap = {}
    let heatmapMax = 0
    for (const cat of topCategories) {
      heatmap[cat] = {}
      for (const res of resolutionCols) {
        const matching = patterns.filter(p => p.category === cat && p.resolution === res)
        const count = matching.reduce((s, p) => s + (p.task_count || 0), 0)
        heatmap[cat][res] = count
        if (count > heatmapMax) heatmapMax = count
      }
    }

    return {
      totalTrees: summaries.length,
      terminalTrees: terminal.length,
      wonCount: won.length,
      lostCount: lost.length,
      winRate: terminal.length > 0 ? won.length / terminal.length : 0,
      avgWonLifespan: avgLifespan(won),
      avgLostLifespan: avgLifespan(lost),
      avgWonDepth: avgDepth(won),
      avgLostDepth: avgDepth(lost),
      deathPointList,
      deathPointTotal: deathPointList.reduce((s, [, c]) => s + c, 0),
      heatmap,
      topCategories,
      resolutionCols,
      heatmapMax,
      source: data.source,
    }
  }, [data])

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-xs text-gray-400 text-center">
        Loading tree analytics…
      </div>
    )
  }

  if (!derived || derived.terminalTrees < MIN_TERMINAL_TREES) {
    return (
      <div className="bg-white rounded-lg border border-dashed border-gray-300 p-8 text-center">
        <Target size={28} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm font-medium text-gray-700 mb-1">Pattern insights unlock at {MIN_TERMINAL_TREES} terminal trees</p>
        <p className="text-[11px] text-gray-500 mb-3">
          {derived?.terminalTrees ?? 0} of {MIN_TERMINAL_TREES} terminal trees so far.
          Resolve more task trees to see depth comparisons, death-point categories, and lifespan breakdowns.
        </p>
        {derived?.totalTrees > 0 && (
          <p className="text-[10px] text-gray-400">
            {derived.totalTrees} tree{derived.totalTrees !== 1 ? 's' : ''} tracked so far (need ≥{MIN_TERMINAL_TREES} fully resolved)
          </p>
        )}
        <button
          onClick={load}
          className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-amber-700 hover:text-amber-900"
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <TrendingUp size={14} className="text-amber-500" />
          Tree Analytics
          <span className="text-[10px] text-gray-400 font-normal">({derived.terminalTrees} terminal trees · source: {derived.source})</span>
        </h2>
        <button
          onClick={load}
          className="p-1.5 text-gray-500 hover:text-amber-600 rounded hover:bg-gray-100"
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Top row: key metrics */}
      <div className="grid grid-cols-4 gap-3">
        <Card title="Win Rate" icon={Trophy} className="bg-green-50/40 border-green-200">
          <div className="text-2xl font-bold text-green-700">
            {(derived.winRate * 100).toFixed(0)}%
          </div>
          <div className="text-[11px] text-gray-600 mt-1">
            {derived.wonCount} won · {derived.lostCount} lost
          </div>
        </Card>

        <Card title="Avg Won Depth" icon={Zap}>
          <div className="text-2xl font-bold text-gray-900">
            {derived.avgWonDepth != null ? derived.avgWonDepth.toFixed(1) : '—'}
          </div>
          <div className="text-[11px] text-gray-600 mt-1">
            tasks deep per won tree
          </div>
        </Card>

        <Card title="Avg Lost Depth" icon={Zap}>
          <div className="text-2xl font-bold text-gray-900">
            {derived.avgLostDepth != null ? derived.avgLostDepth.toFixed(1) : '—'}
          </div>
          <div className="text-[11px] text-gray-600 mt-1">
            tasks deep per lost tree
          </div>
        </Card>

        <Card title="Lifespan (days)" icon={Clock}>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-green-700 font-medium flex items-center gap-1"><Trophy size={10} /> Won</span>
              <span className="font-mono text-gray-900">{fmtDays(derived.avgWonLifespan)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-red-600 font-medium flex items-center gap-1"><TrendingDown size={10} /> Lost</span>
              <span className="font-mono text-gray-900">{fmtDays(derived.avgLostLifespan)}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Death points */}
      <Card title="Death-Point Categories (lost trees)" icon={AlertTriangle}>
        {derived.deathPointList.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No lost trees with lost/stale tasks yet.</p>
        ) : (
          <div className="space-y-1.5">
            {derived.deathPointList.map(([cat, count]) => {
              const info = TASK_TYPES[cat] || TASK_TYPES.CUSTOM
              const pct = derived.deathPointTotal > 0 ? count / derived.deathPointTotal : 0
              return (
                <div key={cat} className="flex items-center gap-2 text-xs">
                  <span className="w-7 text-sm text-center">{info.icon}</span>
                  <span className={`w-28 shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded ${info.bg} ${info.color}`}>
                    {info.label}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-2.5 bg-gradient-to-r from-red-400 to-red-600 rounded-full"
                      style={{ width: `${Math.max(pct * 100, 2)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right font-mono text-[11px] text-gray-600">
                    {count}
                  </span>
                  <span className="w-12 text-right font-mono text-[10px] text-gray-400">
                    {(pct * 100).toFixed(0)}%
                  </span>
                </div>
              )
            })}
          </div>
        )}
        <p className="text-[10px] text-gray-400 mt-2 italic">
          Where trees typically die. These are the categories most likely to go unresolved when a deal is lost — consider intervening earlier on these task types.
        </p>
      </Card>

      {/* Heatmap: category × resolution */}
      <Card title="Resolution Heatmap" icon={Target}>
        {derived.topCategories.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Not enough resolved tasks across categories yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr>
                  <th className="text-left pb-1.5 pr-3 text-gray-500 font-medium">Category</th>
                  {derived.resolutionCols.map(res => {
                    const info = RESOLUTIONS[res] || RESOLUTIONS.open
                    return (
                      <th key={res} className={`text-center pb-1.5 px-2 font-semibold ${info.color}`}>
                        {info.label}
                      </th>
                    )
                  })}
                  <th className="text-right pb-1.5 pl-3 text-gray-500 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {derived.topCategories.map(cat => {
                  const info = TASK_TYPES[cat] || TASK_TYPES.CUSTOM
                  const rowTotal = derived.resolutionCols.reduce((s, r) => s + (derived.heatmap[cat]?.[r] || 0), 0)
                  return (
                    <tr key={cat} className="border-t border-gray-100">
                      <td className="py-1.5 pr-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span>{info.icon}</span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${info.bg} ${info.color}`}>
                            {info.label}
                          </span>
                        </span>
                      </td>
                      {derived.resolutionCols.map(res => {
                        const count = derived.heatmap[cat]?.[res] || 0
                        const intensity = derived.heatmapMax > 0 ? count / derived.heatmapMax : 0
                        const bgClass = count === 0
                          ? 'bg-gray-50 text-gray-300'
                          : res === 'won'      ? `bg-green-${Math.max(100, Math.round(intensity * 500))}`
                          : res === 'lost'     ? `bg-red-${Math.max(100, Math.round(intensity * 500))}`
                          : res === 'stale'    ? `bg-gray-${Math.max(100, Math.round(intensity * 400))}`
                          : res === 'merged'   ? `bg-purple-${Math.max(100, Math.round(intensity * 400))}`
                          : res === 'deferred' ? `bg-yellow-${Math.max(100, Math.round(intensity * 400))}`
                          : 'bg-gray-100'
                        // Tailwind needs concrete classes; fall back to inline style for reliable coloring.
                        const bgStyle = count === 0 ? {} : {
                          backgroundColor: res === 'won'    ? `rgba(34, 197, 94, ${0.1 + intensity * 0.7})`
                                        : res === 'lost'   ? `rgba(239, 68, 68, ${0.1 + intensity * 0.7})`
                                        : res === 'stale'  ? `rgba(156, 163, 175, ${0.1 + intensity * 0.5})`
                                        : res === 'merged' ? `rgba(168, 85, 247, ${0.1 + intensity * 0.5})`
                                        :                    `rgba(234, 179, 8, ${0.1 + intensity * 0.5})`,
                        }
                        return (
                          <td
                            key={res}
                            className={`text-center px-2 py-1.5 font-mono ${count === 0 ? 'text-gray-300' : 'text-gray-900 font-semibold'}`}
                            style={bgStyle}
                          >
                            {count || '·'}
                          </td>
                        )
                      })}
                      <td className="text-right pl-3 py-1.5 font-mono text-gray-600">{rowTotal}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-gray-400 mt-2 italic">
          Each cell is the number of tasks in that category with that resolution. Darker = higher concentration. Green-heavy rows are your reliable categories; red/gray-heavy rows are where deals die.
        </p>
      </Card>
    </div>
  )
}
