// PraskForce1 — Social Signals
//
// Bridges the output of the IG daily scroll (pasted in from
// Claude-in-Chrome as structured JSON) to actionable leads by
// cross-referencing against the uploaded client list.
//
// CROSS-REFERENCE IS 100% JAVASCRIPT. No Claude API call. The
// matching is deterministic string comparison on handles, names,
// and emails — cheap, fast, and keeps us from shoveling a 5k-row
// client list into an LLM every day.
//
// Supabase-first with localStorage fallback, same pattern as
// uploads.js and agent-jobs.js.

import { getSupabase } from '@/lib/supabase'
import { listUploads, getUploadRows } from '@/lib/uploads'

const LS_KEY = 'pf1_social_signals'

export const SIGNAL_STATUS = {
  new: { label: 'New', color: 'text-blue-600', bg: 'bg-blue-50' },
  reviewed: { label: 'Reviewed', color: 'text-gray-600', bg: 'bg-gray-100' },
  converted_to_lead: { label: 'Lead Created', color: 'text-green-600', bg: 'bg-green-50' },
  dismissed: { label: 'Dismissed', color: 'text-gray-400', bg: 'bg-gray-50' },
}

// ── localStorage fallback ────────────────────────────────────────────────────

function lsList() {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}

function lsSave(list) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list))
  } catch (e) {
    throw new Error('Social signals exceeded localStorage quota. Connect Supabase for larger result sets.')
  }
}

// ── Public CRUD ──────────────────────────────────────────────────────────────

export async function listSignals(filter = {}) {
  const sb = getSupabase()
  if (sb) {
    try {
      let q = sb.from('social_signals').select('*').order('created_at', { ascending: false })
      if (filter.status) q = q.eq('status', filter.status)
      if (filter.source) q = q.eq('source', filter.source)
      const { data, error } = await q
      if (error) throw error
      return data || []
    } catch (e) {
      console.warn('Supabase listSignals failed, falling back to localStorage', e)
    }
  }
  let list = lsList()
  if (filter.status) list = list.filter(s => s.status === filter.status)
  if (filter.source) list = list.filter(s => s.source === filter.source)
  return list
}

export async function createSignals(signals) {
  if (!signals?.length) return []
  const stamped = signals.map(s => ({
    id: s.id || `sig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    source: s.source || 'instagram',
    handle: s.handle || null,
    post_url: s.post_url || null,
    post_date: s.post_date || null,
    caption: s.caption || null,
    image_url: s.image_url || null,
    matched_client: s.matched_client || null,
    matched_field: s.matched_field || null,
    match_type: s.match_type || 'none',
    relevance_score: s.relevance_score || 0,
    status: 'new',
    notes: s.notes || null,
    raw_data: s.raw_data || null,
    created_at: new Date().toISOString(),
  }))

  const sb = getSupabase()
  if (sb) {
    try {
      // Strip our local ids so Supabase generates UUIDs
      const rows = stamped.map(({ id, ...rest }) => rest)
      const { data, error } = await sb.from('social_signals').insert(rows).select()
      if (error) throw error
      return data || []
    } catch (e) {
      console.warn('Supabase createSignals failed, falling back to localStorage', e)
    }
  }

  const list = [...stamped, ...lsList()]
  lsSave(list)
  return stamped
}

export async function updateSignal(id, updates) {
  const next = { ...updates }
  if (updates.status && updates.status !== 'new' && !updates.reviewed_at) {
    next.reviewed_at = new Date().toISOString()
  }

  const sb = getSupabase()
  if (sb) {
    try {
      const { data, error } = await sb.from('social_signals').update(next).eq('id', id).select().single()
      if (error) throw error
      return data
    } catch (e) {
      console.warn('Supabase updateSignal failed, falling back to localStorage', e)
    }
  }

  const list = lsList()
  const idx = list.findIndex(s => s.id === id)
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...next }
    lsSave(list)
    return list[idx]
  }
  return null
}

export async function deleteSignal(id) {
  const sb = getSupabase()
  if (sb) {
    try {
      const { error } = await sb.from('social_signals').delete().eq('id', id)
      if (error) throw error
      return true
    } catch (e) {
      console.warn('Supabase deleteSignal failed, falling back to localStorage', e)
    }
  }
  lsSave(lsList().filter(s => s.id !== id))
  return true
}

// ── Cross-reference engine (pure JS, zero tokens) ────────────────────────────

// Normalize a string for loose matching: lowercase, strip punctuation
// and @ prefix, collapse whitespace. Good enough for handle/name/email
// comparisons without being fancy.
function norm(s) {
  if (!s) return ''
  return String(s)
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9@.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Load the most recent client list upload. Returns { rows, columns }
// where columns is a best-guess mapping from logical fields to column
// names (case-insensitive, tolerates variations like "Client Name" vs
// "contact_name").
async function loadClientIndex() {
  const uploads = await listUploads()
  const clientUpload = uploads.find(u => u.kind === 'clients')
  if (!clientUpload) return null

  const rows = await getUploadRows(clientUpload.id)
  if (!rows?.length) return null

  const headers = Object.keys(rows[0] || {})
  const findCol = (...candidates) => {
    for (const c of candidates) {
      const match = headers.find(h => norm(h) === norm(c))
      if (match) return match
    }
    // Fuzzy: any header containing the candidate
    for (const c of candidates) {
      const match = headers.find(h => norm(h).includes(norm(c)))
      if (match) return match
    }
    return null
  }

  return {
    rows,
    cols: {
      name: findCol('name', 'client name', 'full name', 'contact name', 'contact'),
      email: findCol('email', 'email address', 'e-mail'),
      handle: findCol('instagram', 'ig', 'ig handle', 'handle', 'social'),
      company: findCol('company', 'organization', 'business', 'firm'),
      project: findCol('project', 'property', 'address'),
    },
    upload: clientUpload,
  }
}

/**
 * Given a raw post from the IG scroll (handle, caption, post_url, etc.)
 * and a client index, return a match descriptor: which client, which
 * field matched, and a relevance score. Returns match_type='none' when
 * nothing matches.
 */
function matchPost(post, idx) {
  if (!idx) return { match_type: 'none', relevance_score: 0 }

  const postHandle = norm(post.handle)
  const postCaption = norm(post.caption || '')

  let best = { match_type: 'none', relevance_score: 0 }

  for (const row of idx.rows) {
    const clientName = idx.cols.name ? norm(row[idx.cols.name]) : ''
    const clientEmail = idx.cols.email ? norm(row[idx.cols.email]) : ''
    const clientHandle = idx.cols.handle ? norm(row[idx.cols.handle]) : ''
    const clientCompany = idx.cols.company ? norm(row[idx.cols.company]) : ''

    // Handle-on-handle is the strongest signal (weight 100)
    if (postHandle && clientHandle && postHandle === clientHandle) {
      return {
        match_type: 'handle',
        matched_client: (idx.cols.name && row[idx.cols.name]) || clientHandle,
        matched_field: idx.cols.handle,
        relevance_score: 100,
      }
    }

    // Name in caption → decent signal (weight 70)
    if (clientName && postCaption.includes(clientName) && clientName.split(' ').length >= 2) {
      if (best.relevance_score < 70) {
        best = {
          match_type: 'name',
          matched_client: row[idx.cols.name],
          matched_field: idx.cols.name,
          relevance_score: 70,
        }
      }
    }

    // Email mention in caption (rare but high confidence) (weight 90)
    if (clientEmail && postCaption.includes(clientEmail)) {
      if (best.relevance_score < 90) {
        best = {
          match_type: 'email',
          matched_client: row[idx.cols.name] || clientEmail,
          matched_field: idx.cols.email,
          relevance_score: 90,
        }
      }
    }

    // Company name in caption (weight 50)
    if (clientCompany && clientCompany.length > 3 && postCaption.includes(clientCompany)) {
      if (best.relevance_score < 50) {
        best = {
          match_type: 'project',
          matched_client: row[idx.cols.name] || clientCompany,
          matched_field: idx.cols.company,
          relevance_score: 50,
        }
      }
    }

    // Name only in caption as loose single-word mention — too noisy, skip
  }

  return best
}

/**
 * Process pasted-back results from a Claude-in-Chrome IG scroll run.
 * Accepts an array of raw post objects, cross-references against the
 * client list, and persists the matched signals.
 *
 * Input shape expected:
 *   [{ handle, caption, post_url, post_date, image_url }]
 *
 * Returns { saved, matched, unmatched } counts so the UI can report.
 */
export async function ingestIgScroll(rawPosts) {
  if (!Array.isArray(rawPosts) || rawPosts.length === 0) {
    throw new Error('No posts to ingest — expected a non-empty array')
  }

  const idx = await loadClientIndex()
  if (!idx) {
    throw new Error('No client list upload found. Upload a CSV with kind=clients in Configuration → Data Upload first.')
  }

  const signals = rawPosts.map(post => {
    const match = matchPost(post, idx)
    return {
      source: 'instagram',
      handle: post.handle || null,
      post_url: post.post_url || null,
      post_date: post.post_date || null,
      caption: post.caption || null,
      image_url: post.image_url || null,
      matched_client: match.matched_client || null,
      matched_field: match.matched_field || null,
      match_type: match.match_type,
      relevance_score: match.relevance_score,
      raw_data: post,
    }
  })

  // Only persist signals that actually matched something, plus any
  // explicitly-handle-matched zero-match posts (for auditing). Unmatched
  // posts get dropped — they're almost always noise and they'd bloat
  // the signals table over time.
  const matched = signals.filter(s => s.match_type !== 'none')
  const saved = await createSignals(matched)

  return {
    saved: saved.length,
    matched: matched.length,
    unmatched: signals.length - matched.length,
    total: signals.length,
  }
}
