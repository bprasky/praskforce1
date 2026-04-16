// PraskForce1 — Task Tree Stats (shared queries)
//
// Thin wrapper around the analytics views from schema-task-tree.sql
// so the Pipeline card health chip and the Accounts aggregate stats
// can share the same Supabase queries without duplicating logic.
//
// Falls back to computing stats locally from pf1_tasks + pf1_task_origins
// when Supabase isn't connected — matches the rest of the codebase's
// demo-mode pattern.

import { getSupabase } from '@/lib/supabase'
import { getTasks } from '@/lib/tasks'

const LS_ORIGINS = 'pf1_task_origins'

// ── Pipeline deal health ────────────────────────────────────────────

/**
 * Returns a map { [dealId]: { health, totalTasks, openTasks, lastActivityAt } }.
 * health ∈ { closed | stale | at_risk | progressing | empty }
 *
 * @param {string[]} [dealIds] - filter to specific deals; omit to get all
 */
export async function getPipelineDealHealth(dealIds = null) {
  const sb = getSupabase()
  if (sb) {
    try {
      let q = sb.from('pipeline_deal_tree_health').select('*')
      if (dealIds?.length) q = q.in('deal_id', dealIds)
      const { data, error } = await q
      if (error) throw error
      const map = {}
      for (const row of data || []) {
        map[row.deal_id] = {
          health: row.health,
          totalTasks: row.total_tasks || 0,
          openTasks: row.open_tasks || 0,
          lastActivityAt: row.last_activity_at,
        }
      }
      return map
    } catch (e) {
      console.warn('Supabase getPipelineDealHealth failed, falling back to localStorage', e)
    }
  }

  // localStorage fallback — compute from pf1_tasks
  const tasks = getTasks()
  const map = {}
  for (const task of tasks) {
    const dealId = task.pipeline_deal_id || task.pipelineDealId
    if (!dealId) continue
    if (!map[dealId]) map[dealId] = { tasks: [], lastActivityAt: null }
    map[dealId].tasks.push(task)
    const ts = task.updated_at || task.created_at
    if (ts && (!map[dealId].lastActivityAt || ts > map[dealId].lastActivityAt)) {
      map[dealId].lastActivityAt = ts
    }
  }
  const now = Date.now()
  const out = {}
  for (const [dealId, info] of Object.entries(map)) {
    const openTasks = info.tasks.filter(t => (t.resolution || 'open') === 'open').length
    const totalTasks = info.tasks.length
    let health = 'empty'
    if (totalTasks > 0) {
      const ageMs = info.lastActivityAt ? now - new Date(info.lastActivityAt).getTime() : 0
      if (openTasks === 0) health = 'closed'
      else if (ageMs > 7 * 86400_000) health = 'stale'
      else if (info.tasks.some(t => (t.resolution || 'open') === 'open' &&
                                    ['QUOTE', 'QUOTE_ADJUSTMENT', 'FOLLOW_UP'].includes(t.type) &&
                                    new Date(t.created_at).getTime() < now - 3 * 86400_000)) {
        health = 'at_risk'
      } else health = 'progressing'
    }
    out[dealId] = { health, totalTasks, openTasks, lastActivityAt: info.lastActivityAt }
  }
  if (dealIds?.length) {
    const filtered = {}
    for (const id of dealIds) if (out[id]) filtered[id] = out[id]
    return filtered
  }
  return out
}

// ── Account tree rollup ─────────────────────────────────────────────

/**
 * Returns a map { [accountId]: { totalTrees, treesWon, treesLost, activeTrees,
 *                                totalTasks, openTasks, avgWonLifespanDays,
 *                                avgLostLifespanDays, mostRecentResolution } }
 *
 * @param {string[]} [accountIds] - filter to specific accounts; omit to get all
 */
export async function getAccountTreeRollup(accountIds = null) {
  const sb = getSupabase()
  if (sb) {
    try {
      let q = sb.from('account_tree_rollup').select('*')
      if (accountIds?.length) q = q.in('account_id', accountIds)
      const { data, error } = await q
      if (error) throw error
      const map = {}
      for (const row of data || []) {
        map[row.account_id] = {
          totalTrees: row.total_trees || 0,
          treesWon: row.trees_won || 0,
          treesLost: row.trees_lost || 0,
          activeTrees: row.active_trees || 0,
          totalTasks: row.total_tasks || 0,
          openTasks: row.open_tasks || 0,
          avgWonLifespanDays: row.avg_won_lifespan_days,
          avgLostLifespanDays: row.avg_lost_lifespan_days,
          mostRecentResolution: row.most_recent_resolution,
        }
      }
      return map
    } catch (e) {
      console.warn('Supabase getAccountTreeRollup failed, falling back to localStorage', e)
    }
  }

  // localStorage fallback — compute from origins + tasks
  const origins = (() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem(LS_ORIGINS) || '[]') } catch { return [] }
  })()
  const tasks = getTasks()
  const out = {}
  for (const origin of origins) {
    const accountId = origin.account_id
    if (!accountId) continue
    if (!out[accountId]) {
      out[accountId] = {
        totalTrees: 0, treesWon: 0, treesLost: 0, activeTrees: 0,
        totalTasks: 0, openTasks: 0,
        avgWonLifespanDays: null, avgLostLifespanDays: null,
        mostRecentResolution: null,
      }
    }
    const mine = tasks.filter(t => (t.origin_id || t.originId) === origin.id)
    if (mine.length === 0) continue
    const open = mine.filter(t => (t.resolution || 'open') === 'open').length
    const won = mine.filter(t => t.resolution === 'won').length
    const lost = mine.filter(t => t.resolution === 'lost').length
    out[accountId].totalTrees++
    out[accountId].totalTasks += mine.length
    out[accountId].openTasks += open
    if (open === 0) {
      if (won > 0) out[accountId].treesWon++
      else if (lost > 0) out[accountId].treesLost++
    } else {
      out[accountId].activeTrees++
    }
  }
  if (accountIds?.length) {
    const filtered = {}
    for (const id of accountIds) if (out[id]) filtered[id] = out[id]
    return filtered
  }
  return out
}

// ── Display helpers ─────────────────────────────────────────────────

export const HEALTH_INFO = {
  progressing: { label: 'Progressing', color: 'text-green-700', bg: 'bg-green-50',  border: 'border-green-200',  icon: '🌳' },
  at_risk:     { label: 'At Risk',     color: 'text-red-700',   bg: 'bg-red-50',    border: 'border-red-200',    icon: '⚠️' },
  stale:       { label: 'Stale',       color: 'text-amber-700', bg: 'bg-amber-50',  border: 'border-amber-200',  icon: '⏳' },
  closed:      { label: 'Closed',      color: 'text-gray-600',  bg: 'bg-gray-100',  border: 'border-gray-200',   icon: '✓' },
  empty:       { label: 'No Tasks',    color: 'text-gray-400',  bg: 'bg-gray-50',   border: 'border-gray-200',   icon: '—' },
}
