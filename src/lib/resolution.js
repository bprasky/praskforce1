// PraskForce1 — Resolution capture
//
// Server-side helpers that write to the workflow_runs / workflow_steps /
// task_events tables introduced in supabase/schema-resolution.sql.
//
// Every wired action and every task lifecycle event must end up here.
// The few-shot examples that the meeting-notes parser uses on its next
// run are pulled from `task_events` of type='resolved'. Without this
// data the dispatcher never improves.

import { getSupabase } from '@/lib/supabase'

// ── workflow_runs ────────────────────────────────────────────────────

/**
 * Start a new workflow run. Returns { id } (the run_id used by step
 * helpers). If Supabase isn't connected, returns a synthetic id and
 * the run is silently dropped — callers must still proceed since the
 * scanner contract says wired actions take effect even when logging
 * is unavailable.
 */
export async function startWorkflowRun({ workflowKey, trigger = 'manual', summary = null }) {
  const sb = getSupabase()
  const record = {
    workflow_key: workflowKey,
    status: 'running',
    trigger,
    summary,
  }
  if (sb) {
    try {
      const { data, error } = await sb.from('workflow_runs').insert(record).select().single()
      if (error) throw error
      return data
    } catch (e) {
      console.warn('startWorkflowRun supabase failed', e.message)
    }
  }
  return { id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, ...record }
}

export async function finishWorkflowRun(runId, { status, summary }) {
  const sb = getSupabase()
  if (!sb || String(runId).startsWith('local_')) return null
  try {
    const { data, error } = await sb
      .from('workflow_runs')
      .update({ status, summary, completed_at: new Date().toISOString() })
      .eq('id', runId)
      .select()
      .single()
    if (error) throw error
    return data
  } catch (e) {
    console.warn('finishWorkflowRun supabase failed', e.message)
    return null
  }
}

// ── workflow_steps ───────────────────────────────────────────────────

/**
 * Record a single step. The runner calls this after each step completes
 * (success OR failure). Useful messages on `expected` and `observed` are
 * the difference between debuggable failures and silent ones.
 */
export async function recordStep(runId, {
  stepKey,
  stepIndex,
  status,
  critical = true,
  durationMs = null,
  expected = null,
  observed = null,
  screenshotPath = null,
  errorMessage = null,
}) {
  const sb = getSupabase()
  if (!sb || String(runId).startsWith('local_')) return null
  try {
    const { data, error } = await sb.from('workflow_steps').insert({
      run_id: runId,
      step_key: stepKey,
      step_index: stepIndex,
      status,
      critical,
      duration_ms: durationMs,
      expected,
      observed,
      screenshot_path: screenshotPath,
      error_message: errorMessage,
    }).select().single()
    if (error) throw error
    return data
  } catch (e) {
    console.warn('recordStep supabase failed', e.message)
    return null
  }
}

// ── task_events ──────────────────────────────────────────────────────

/**
 * Log a task lifecycle event. Event types:
 *   'created'    — task was inserted (parser, manual add, agent)
 *   'dispatched' — user clicked Run / Copy Prompt
 *   'resolved'   — task is closed out, with channel + outcome captured
 *   'reopened'   — a previously-resolved task was put back in flight
 *
 * For 'resolved' events:
 *   channel: 'wired' | 'copy_prompt' | 'manual'
 *   outcome: 'completed' | 'no_action' | 'deferred' | 'failed'
 */
export async function recordTaskEvent({
  taskId,
  eventType,
  channel = null,
  outcome = null,
  notes = null,
  metadata = null,
}) {
  const sb = getSupabase()
  if (!sb) return null
  try {
    const { data, error } = await sb.from('task_events').insert({
      task_id: taskId,
      event_type: eventType,
      channel,
      outcome,
      notes,
      metadata,
    }).select().single()
    if (error) throw error
    return data
  } catch (e) {
    console.warn('recordTaskEvent supabase failed', e.message)
    return null
  }
}

/**
 * Pull recent resolved events (for use as few-shot examples in the
 * meeting-notes parser). Limit per category — we don't want one
 * runaway category to dominate the examples list.
 */
export async function recentResolutionsByCategory(perCategory = 10) {
  const sb = getSupabase()
  if (!sb) return []
  try {
    // Pull resolved events joined with their task to expose category.
    // Simpler than a window query — just take the most recent ~200 and
    // bucket client-side.
    const { data, error } = await sb
      .from('task_events')
      .select('id, task_id, event_type, channel, outcome, notes, metadata, event_at, tasks(type, description, contact, property, materials)')
      .eq('event_type', 'resolved')
      .order('event_at', { ascending: false })
      .limit(perCategory * 12)
    if (error) throw error

    const buckets = {}
    for (const row of data || []) {
      const cat = row.tasks?.type || 'CUSTOM'
      if (!buckets[cat]) buckets[cat] = []
      if (buckets[cat].length < perCategory) buckets[cat].push(row)
    }
    return Object.entries(buckets).flatMap(([cat, rows]) =>
      rows.map(r => ({
        category: cat,
        channel: r.channel,
        outcome: r.outcome,
        notes: r.notes,
        task_summary: r.tasks?.description || '',
        contact: r.tasks?.contact || null,
        property: r.tasks?.property || null,
      }))
    )
  } catch (e) {
    console.warn('recentResolutionsByCategory supabase failed', e.message)
    return []
  }
}
