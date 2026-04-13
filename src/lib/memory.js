// PraskForce1 — Intelligence Memory Layer
// Persists agent runs, events, and extracted entities to Supabase.
// All functions degrade gracefully: if Supabase isn't configured, they no-op
// and the API route still returns the result JSON in the response body.
//
// Server-side only — uses the lazy supabase client.

import { getSupabase } from '@/lib/supabase'

function client() {
  try {
    return getSupabase()
  } catch {
    return null
  }
}

// ── Run lifecycle ──
export async function recordRun(run) {
  const sb = client()
  if (!sb) return { skipped: true }
  const { error } = await sb.from('agent_runs').upsert({
    id: run.id,
    task_id: run.taskId,
    status: run.status,
    started_at: run.startedAt,
  })
  if (error) console.warn('[memory.recordRun]', error.message)
  return { ok: !error }
}

export async function recordEvent(runId, event) {
  const sb = client()
  if (!sb) return { skipped: true }
  const { error } = await sb.from('agent_run_events').insert({
    run_id: runId,
    ts: event.ts,
    level: event.level,
    step: event.step,
    message: event.message,
    data: event.data,
  })
  if (error && error.code !== '23503') console.warn('[memory.recordEvent]', error.message)
  return { ok: !error }
}

export async function finalizeRun(run) {
  const sb = client()
  if (!sb) return { skipped: true }
  const update = {
    status: run.status,
    finished_at: run.finishedAt,
    duration_ms: run.durationMs,
    error_message: run.error || null,
    result_summary: run.result
      ? {
          source: run.result.source,
          count: run.result.count,
          extractionMode: run.result.extractionMode,
        }
      : null,
  }
  const { error } = await sb.from('agent_runs').update(update).eq('id', run.id)
  if (error) console.warn('[memory.finalizeRun]', error.message)

  // If this was a quote extraction, persist the items
  if (run.result?.source === 'stoneprofits' && Array.isArray(run.result.items)) {
    await saveQuotes(run.id, run.result.items)
  }
  return { ok: !error }
}

// ── Quotes ──
export async function saveQuotes(runId, items) {
  const sb = client()
  if (!sb) return { skipped: true }
  if (!items.length) return { ok: true, count: 0 }

  const rows = items.map(q => ({
    run_id: runId,
    source: 'stoneprofits',
    quote_number: q.quote_number || null,
    quote_date: q.quote_date || null,
    customer: q.customer || null,
    contact: q.contact || null,
    project: q.project || null,
    materials: q.materials || [],
    total: q.total ?? null,
    status: q.status || null,
    salesperson: q.salesperson || null,
    raw: q,
  }))

  const { error, count } = await sb
    .from('quotes')
    .upsert(rows, { onConflict: 'source,quote_number', count: 'exact' })
  if (error) {
    console.warn('[memory.saveQuotes]', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true, count: count ?? rows.length }
}
