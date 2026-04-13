// PraskForce1 — Agent Jobs Queue
//
// This is the queue that browser agents (Claude-in-Chrome) poll to find
// work. A "job" is a structured request like "create this quote in
// StoneProfits" or "send this recap via Outlook" — the payload contains
// everything the agent needs to execute without human input.
//
// Lifecycle: queued → running → (needs_review | done | failed)
//
// Supabase-first store with localStorage fallback. Downstream code should
// never assume which backend is in use — just call the exported functions.

import { getSupabase } from '@/lib/supabase'

const LS_KEY = 'pf1_agent_jobs'

// Known job kinds — callers can add new kinds without changing this file,
// but the registry here documents what each one means and what shape of
// payload it expects.
export const JOB_KINDS = {
  sp_quote: {
    label: 'Create Quote',
    system: 'StoneProfits',
    description: 'Create a new quote in StoneProfits for a client/meeting',
    // payload: { contact, property, materials, notes, meeting_id }
  },
  outlook_recap: {
    label: 'Send Recap Email',
    system: 'Outlook',
    description: 'Send a drafted follow-up email after a meeting',
    // payload: { contact, property, notes, drafted_subject, drafted_body, stage, tone, reasoning, next_actions }
  },
  outlook_search: {
    label: 'Search Email History',
    system: 'Outlook',
    description: 'Search Outlook for prior correspondence with a contact',
  },
  ig_daily_scroll: {
    label: 'Instagram Daily Rundown',
    system: 'Instagram',
    description: 'Scroll client watchlist and report new activity',
  },
  portal_scan: {
    label: 'Portal Scan',
    system: 'Permit Portal',
    description: 'Scan a permit portal for new permits on watched properties',
  },
}

export const JOB_STATUS = {
  queued: { label: 'Queued', color: 'text-gray-600', bg: 'bg-gray-100' },
  running: { label: 'Running', color: 'text-blue-600', bg: 'bg-blue-50' },
  needs_review: { label: 'Needs Review', color: 'text-amber-600', bg: 'bg-amber-50' },
  done: { label: 'Done', color: 'text-green-600', bg: 'bg-green-50' },
  failed: { label: 'Failed', color: 'text-red-600', bg: 'bg-red-50' },
}

// ── localStorage fallback ────────────────────────────────────────────────────

function lsList() {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}

function lsSave(jobs) {
  localStorage.setItem(LS_KEY, JSON.stringify(jobs))
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function listJobs(filter = {}) {
  const sb = getSupabase()
  if (sb) {
    try {
      let q = sb.from('agent_jobs').select('*').order('created_at', { ascending: false })
      if (filter.status) q = q.eq('status', filter.status)
      if (filter.kind) q = q.eq('kind', filter.kind)
      if (filter.meeting_id) q = q.eq('meeting_id', filter.meeting_id)
      const { data, error } = await q
      if (error) throw error
      return data || []
    } catch (e) {
      console.warn('Supabase listJobs failed, falling back to localStorage', e)
    }
  }
  let jobs = lsList()
  if (filter.status) jobs = jobs.filter(j => j.status === filter.status)
  if (filter.kind) jobs = jobs.filter(j => j.kind === filter.kind)
  if (filter.meeting_id) jobs = jobs.filter(j => j.meeting_id === filter.meeting_id)
  return jobs
}

export async function createJob({ kind, payload, meeting_id, property_id, priority = 5 }) {
  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const record = {
    id,
    kind,
    status: 'queued',
    priority,
    payload: payload || {},
    result: null,
    error: null,
    meeting_id: meeting_id || null,
    property_id: property_id || null,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
  }

  const sb = getSupabase()
  if (sb) {
    try {
      // Supabase will generate its own uuid; let it.
      const { id: _drop, ...insertRow } = record
      const { data, error } = await sb.from('agent_jobs').insert(insertRow).select().single()
      if (error) throw error
      return data
    } catch (e) {
      console.warn('Supabase createJob failed, falling back to localStorage', e)
    }
  }

  const jobs = lsList()
  jobs.unshift(record)
  lsSave(jobs)
  return record
}

export async function updateJob(id, updates) {
  const next = { ...updates, updated_at: new Date().toISOString() }
  if (updates.status === 'running' && !updates.started_at) next.started_at = new Date().toISOString()
  if ((updates.status === 'done' || updates.status === 'failed') && !updates.completed_at) {
    next.completed_at = new Date().toISOString()
  }

  const sb = getSupabase()
  if (sb) {
    try {
      const { data, error } = await sb.from('agent_jobs').update(next).eq('id', id).select().single()
      if (error) throw error
      return data
    } catch (e) {
      console.warn('Supabase updateJob failed, falling back to localStorage', e)
    }
  }

  const jobs = lsList()
  const idx = jobs.findIndex(j => j.id === id)
  if (idx >= 0) {
    jobs[idx] = { ...jobs[idx], ...next }
    lsSave(jobs)
    return jobs[idx]
  }
  return null
}

export async function deleteJob(id) {
  const sb = getSupabase()
  if (sb) {
    try {
      const { error } = await sb.from('agent_jobs').delete().eq('id', id)
      if (error) throw error
      return true
    } catch (e) {
      console.warn('Supabase deleteJob failed, falling back to localStorage', e)
    }
  }
  lsSave(lsList().filter(j => j.id !== id))
  return true
}

export async function getJob(id) {
  const sb = getSupabase()
  if (sb) {
    try {
      const { data, error } = await sb.from('agent_jobs').select('*').eq('id', id).single()
      if (error) throw error
      return data
    } catch (e) {
      console.warn('Supabase getJob failed, falling back to localStorage', e)
    }
  }
  return lsList().find(j => j.id === id) || null
}
