// PraskForce1 — Task Resolution Learning System
//
// This module is the brain of the learning loop. Every completed task
// produces a resolution record. Resolutions are matched against new tasks
// to propose actions. Corrections feed back into the dataset. Over time
// the system gets better at proposing the right move.
//
// Storage pattern follows agent-jobs.js: Supabase first, localStorage
// fallback. Callers should never need to know which backend is live.
//
// State machine for the learning layer (overlays the existing task
// `status` field — kept separate so existing UI keeps working):
//
//   CREATED → PROPOSED → ACTIVE → RESOLVING → RESOLVED
//
// CREATED   — task just entered the system, context snapshot built
// PROPOSED  — system has run the matcher and (maybe) generated a proposal
// ACTIVE    — user has accepted/corrected the proposal and is working it
// RESOLVING — user is logging the resolution (the collaborative moment)
// RESOLVED  — resolution stored, patterns updated

import { getSupabase } from '@/lib/supabase'

const LS_RESOLUTIONS = 'pf1_task_resolutions'
const LS_PROPOSALS   = 'pf1_task_proposals'
const LS_PATTERNS    = 'pf1_resolution_patterns'
const LS_METRICS     = 'pf1_learning_metrics'
const LS_CHATS       = 'pf1_task_chats'

// ── Vocabularies ─────────────────────────────────────────────────────────────
// Surfaced for the UI (quick-select buttons) and for the matcher (so the
// dimensions are normalized across resolutions).

export const LIFECYCLE = {
  CREATED:   { label: 'Created',   color: 'text-gray-600',  bg: 'bg-gray-100' },
  PROPOSED:  { label: 'Proposed',  color: 'text-amber-700', bg: 'bg-amber-50' },
  ACTIVE:    { label: 'Active',    color: 'text-blue-700',  bg: 'bg-blue-50' },
  RESOLVING: { label: 'Resolving', color: 'text-purple-700', bg: 'bg-purple-50' },
  RESOLVED:  { label: 'Resolved',  color: 'text-green-700', bg: 'bg-green-50' },
}

export const RESOLUTION_CHANNELS = [
  { id: 'email',         label: 'Email',       icon: '📧' },
  { id: 'phone',         label: 'Phone',       icon: '📞' },
  { id: 'whatsapp',      label: 'WhatsApp',    icon: '💬' },
  { id: 'instagram_dm',  label: 'Instagram',   icon: '📸' },
  { id: 'linkedin',      label: 'LinkedIn',    icon: '💼' },
  { id: 'in_person',     label: 'In-person',   icon: '🤝' },
  { id: 'showroom',      label: 'Showroom',    icon: '🏛️' },
  { id: 'sample_box',    label: 'Sample Box',  icon: '📦' },
  { id: 'system_action', label: 'System',      icon: '⚙️' },
]

export const RESOLUTION_OUTCOMES = [
  { id: 'meeting_booked',  label: 'Meeting Booked',  icon: '✓', tone: 'win'  },
  { id: 'quote_requested', label: 'Quote Requested', icon: '💰', tone: 'win'  },
  { id: 'info_gathered',   label: 'Info Gathered',   icon: '📋', tone: 'win'  },
  { id: 'no_response',     label: 'No Response',     icon: '⏳', tone: 'flat' },
  { id: 'declined',        label: 'Declined',        icon: '✗', tone: 'loss' },
  { id: 'deferred',        label: 'Deferred',        icon: '➡️', tone: 'flat' },
  { id: 'escalated',       label: 'Escalated',       icon: '⬆️', tone: 'flat' },
]

const WIN_OUTCOMES  = new Set(['meeting_booked', 'quote_requested', 'info_gathered'])
const LOSS_OUTCOMES = new Set(['declined', 'no_response'])

// Matching weights — total to 1.0 across non-required dimensions. Tweak
// here if the matcher starts proposing the wrong things.
const MATCH_WEIGHTS = {
  price_tier:              0.25,
  owner_type:              0.20,
  contact_role:            0.20,
  deal_stage:              0.15,
  outreach_attempt_number: 0.10,
  neighborhood:            0.10,
}

// ── localStorage helpers ─────────────────────────────────────────────────────

function lsGet(key) {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}
function lsSet(key, val) {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(val))
}

// ── Context Snapshot Builder ─────────────────────────────────────────────────
// Build a context snapshot from whatever data is available about a task.
// The snapshot is FROZEN at resolution time so patterns hold even if the
// underlying records change later. If a field can't be determined, leave
// it null — the matcher tolerates missing dimensions.

export function buildContextSnapshot(task, extras = {}) {
  const s = {
    property_address:       task.property || extras.property_address || null,
    sale_price:             extras.sale_price ?? null,
    price_tier:             priceTierFor(extras.sale_price),
    neighborhood:           extras.neighborhood || null,
    owner_entity:           extras.owner_entity || null,
    owner_type:             extras.owner_type || null,
    principal_name:         extras.principal_name || null,
    contact_role:           extras.contact_role || guessContactRole(task),
    permit_status:          extras.permit_status || null,
    days_since_sale:        extras.days_since_sale ?? null,
    days_since_permit:      extras.days_since_permit ?? null,
    days_since_last_contact: extras.days_since_last_contact ?? null,
    outreach_history:       extras.outreach_history || [],
    quote_status:           extras.quote_status || null,
    related_account_id:     extras.related_account_id || null,
    trigger_source:         extras.trigger_source || task.meeting_id ? 'meeting_notes' : 'manual',
    deal_stage:             extras.deal_stage || guessDealStage(task, extras),
    outreach_attempt_number: extras.outreach_attempt_number ?? (extras.outreach_history?.length || 0) + 1,
  }
  return s
}

function priceTierFor(price) {
  if (!price || typeof price !== 'number') return null
  if (price < 8_000_000)  return '$3-8M'
  if (price < 12_000_000) return '$8-12M'
  return '$12M+'
}

function guessContactRole(task) {
  // Cheap heuristic — the real source is the linked contact record. This
  // is just a fallback so the matcher has something to work with on
  // manually-created tasks.
  const blob = `${task.contact || ''} ${task.description || ''}`.toLowerCase()
  if (/\barchitect\b/.test(blob))  return 'architect'
  if (/\bdesigner\b/.test(blob))   return 'designer'
  if (/\battorney|lawyer|esq\b/.test(blob)) return 'attorney'
  if (/\bbuilder|gc\b/.test(blob)) return 'builder'
  if (/\bagent|realtor\b/.test(blob)) return 'agent'
  if (/\bpm|property manager\b/.test(blob)) return 'property_manager'
  if (task.contact) return 'owner'
  return null
}

function guessDealStage(task, extras) {
  if (extras.quote_status === 'sent' || extras.quote_status === 'accepted') return 'quoting'
  if (task.type === 'QUOTE') return 'quoting'
  if (task.type === 'FOLLOW_UP') return 'engaged'
  if (task.type === 'EMAIL' || task.type === 'SCHEDULE') return 'outreach'
  return 'pre_outreach'
}

// ── Resolutions: CRUD ────────────────────────────────────────────────────────

export async function listResolutions(filter = {}) {
  const sb = getSupabase()
  if (sb) {
    try {
      let q = sb.from('task_resolutions').select('*').order('created_at', { ascending: false })
      if (filter.task_category) q = q.eq('task_category', filter.task_category)
      if (filter.task_id) q = q.eq('task_id', filter.task_id)
      const { data, error } = await q
      if (error) throw error
      return data || []
    } catch (e) {
      console.warn('Supabase listResolutions failed, using localStorage', e)
    }
  }
  let rows = lsGet(LS_RESOLUTIONS)
  if (filter.task_category) rows = rows.filter(r => r.task_category === filter.task_category)
  if (filter.task_id) rows = rows.filter(r => r.task_id === filter.task_id)
  return rows
}

export async function createResolution(input) {
  const record = {
    id: `res_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    task_id: input.task_id,
    created_at: new Date().toISOString(),
    resolution_type: input.resolution_type || 'confirmed',
    resolution_action: input.resolution_action || '',
    resolution_channel: input.resolution_channel || null,
    resolution_outcome: input.resolution_outcome || null,
    resolution_notes: input.resolution_notes || null,
    context_snapshot: input.context_snapshot || {},
    proposed_action: input.proposed_action || null,
    proposed_accepted: input.proposed_accepted ?? null,
    correction_delta: input.correction_delta || null,
    task_category: input.task_category,
    price_tier: input.context_snapshot?.price_tier || null,
    neighborhood: input.context_snapshot?.neighborhood || null,
    owner_type: input.context_snapshot?.owner_type || null,
    contact_role: input.context_snapshot?.contact_role || null,
    days_since_trigger: input.context_snapshot?.days_since_sale ?? null,
    outreach_attempt_number: input.context_snapshot?.outreach_attempt_number ?? null,
    deal_stage: input.context_snapshot?.deal_stage || null,
  }

  const sb = getSupabase()
  if (sb) {
    try {
      const { data, error } = await sb.from('task_resolutions').insert(record).select().single()
      if (error) throw error
      // Patterns are cheap to rebuild; do it lazily in the background so
      // the UI doesn't wait.
      rebuildPatterns().catch(() => {})
      return data
    } catch (e) {
      console.warn('Supabase createResolution failed, using localStorage', e)
    }
  }
  const all = lsGet(LS_RESOLUTIONS)
  all.unshift(record)
  lsSet(LS_RESOLUTIONS, all)
  rebuildPatterns().catch(() => {})
  return record
}

// ── Proposals: CRUD ──────────────────────────────────────────────────────────

export async function listProposals(filter = {}) {
  const sb = getSupabase()
  if (sb) {
    try {
      let q = sb.from('task_proposals').select('*').order('created_at', { ascending: false })
      if (filter.task_id) q = q.eq('task_id', filter.task_id)
      if (filter.status) q = q.eq('status', filter.status)
      const { data, error } = await q
      if (error) throw error
      return data || []
    } catch (e) {
      console.warn('Supabase listProposals failed, using localStorage', e)
    }
  }
  let rows = lsGet(LS_PROPOSALS)
  if (filter.task_id) rows = rows.filter(r => r.task_id === filter.task_id)
  if (filter.status) rows = rows.filter(r => r.status === filter.status)
  return rows
}

export async function getLatestProposalForTask(task_id) {
  const all = await listProposals({ task_id })
  return all[0] || null
}

export async function createProposal(input) {
  const record = {
    id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    task_id: input.task_id,
    created_at: new Date().toISOString(),
    proposed_action: input.proposed_action,
    proposed_channel: input.proposed_channel || null,
    confidence: input.confidence ?? 0,
    reasoning: input.reasoning || '',
    matched_resolution_ids: input.matched_resolution_ids || [],
    match_criteria: input.match_criteria || {},
    status: 'pending',
    feedback: null,
  }
  const sb = getSupabase()
  if (sb) {
    try {
      const { data, error } = await sb.from('task_proposals').insert(record).select().single()
      if (error) throw error
      return data
    } catch (e) {
      console.warn('Supabase createProposal failed, using localStorage', e)
    }
  }
  const all = lsGet(LS_PROPOSALS)
  all.unshift(record)
  lsSet(LS_PROPOSALS, all)
  return record
}

export async function updateProposal(id, updates) {
  const sb = getSupabase()
  if (sb) {
    try {
      const { data, error } = await sb.from('task_proposals').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    } catch (e) {
      console.warn('Supabase updateProposal failed, using localStorage', e)
    }
  }
  const all = lsGet(LS_PROPOSALS)
  const idx = all.findIndex(p => p.id === id)
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...updates }
    lsSet(LS_PROPOSALS, all)
    return all[idx]
  }
  return null
}

// ── Similarity Matching ──────────────────────────────────────────────────────
// Find historical resolutions that look like the task being scored.
// `task_category` is a hard filter — FOLLOW_UP patterns simply don't
// transfer to QUOTE tasks. Everything else is weighted.

export function scoreMatch(snapshot, resolution) {
  let score = 0
  let weightUsed = 0

  for (const [field, weight] of Object.entries(MATCH_WEIGHTS)) {
    const a = snapshot[field]
    const b = resolution[field] ?? resolution.context_snapshot?.[field]
    if (a == null || b == null) continue
    weightUsed += weight

    if (field === 'outreach_attempt_number') {
      // Within ±1 attempt is a near match; same exact is a perfect match.
      const diff = Math.abs((a || 0) - (b || 0))
      if (diff === 0)      score += weight
      else if (diff === 1) score += weight * 0.5
    } else if (a === b) {
      score += weight
    }
  }

  // Normalize against weights actually used so a partial snapshot with
  // 3/6 dimensions filled in isn't unfairly penalized.
  if (weightUsed === 0) return 0
  return score / weightUsed
}

export async function findSimilarResolutions(task_category, snapshot, limit = 5) {
  const all = await listResolutions({ task_category })
  if (all.length === 0) return []
  const scored = all
    .map(r => ({ resolution: r, score: scoreMatch(snapshot, r) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
  return scored
}

// ── Confidence Calculation ───────────────────────────────────────────────────
// confidence = match_score × min(1.0, sample_size / 5) × recency_factor
//
// The recency factor decays from 1.0 by 0.1 every 30 days, floored at 0.5.
// This keeps the system responsive to recent shifts in what works without
// throwing away older training data entirely.

export function recencyFactor(isoDate) {
  if (!isoDate) return 0.5
  const days = (Date.now() - new Date(isoDate).getTime()) / 86_400_000
  if (days <= 30) return 1.0
  const decay = Math.floor((days - 30) / 30) * 0.1
  return Math.max(0.5, 1.0 - decay)
}

export function computeConfidence(matches) {
  if (matches.length === 0) return 0
  const top = matches[0]
  const sampleFactor = Math.min(1.0, matches.length / 5)
  const recency = recencyFactor(top.resolution.created_at)
  return top.score * sampleFactor * recency
}

// ── Pattern Aggregation ──────────────────────────────────────────────────────
// Group resolutions by signature and compute winning channels / success
// rates. This is the materialized rollup the proposal generator queries
// for fast lookups. Rebuild on each new resolution — cheap until the
// dataset grows past a few thousand rows.

function patternSignature(r) {
  return [
    r.task_category || '_',
    r.price_tier || '_',
    r.owner_type || '_',
    r.contact_role || '_',
    r.deal_stage || '_',
  ].join('|')
}

export async function rebuildPatterns() {
  const all = await listResolutions()
  const groups = new Map()
  for (const r of all) {
    const sig = patternSignature(r)
    if (!groups.has(sig)) groups.set(sig, [])
    groups.get(sig).push(r)
  }

  const patterns = []
  for (const [sig, rows] of groups.entries()) {
    if (rows.length === 0) continue
    const [task_category, price_tier, owner_type, contact_role, deal_stage] = sig.split('|')

    // Winning channel = most frequent channel among win-outcomes.
    const channelWins = {}
    let wins = 0
    let losses = 0
    const failureModes = {}
    for (const r of rows) {
      if (WIN_OUTCOMES.has(r.resolution_outcome)) {
        wins++
        if (r.resolution_channel) {
          channelWins[r.resolution_channel] = (channelWins[r.resolution_channel] || 0) + 1
        }
      } else if (LOSS_OUTCOMES.has(r.resolution_outcome)) {
        losses++
        const mode = r.resolution_outcome
        failureModes[mode] = (failureModes[mode] || 0) + 1
      }
    }
    const winningChannel = Object.entries(channelWins).sort((a, b) => b[1] - a[1])[0]?.[0] || null
    const successRate = rows.length > 0 ? wins / rows.length : 0

    // Pick the most representative winning action as the summary — cheap
    // and good enough until a real summarizer is wired in.
    const winningRow = rows.find(r => WIN_OUTCOMES.has(r.resolution_outcome) && r.resolution_channel === winningChannel)
    const winningSummary = winningRow?.resolution_action || rows[0]?.resolution_action || null

    patterns.push({
      id: `pat_${sig.replace(/\|/g, '_')}`,
      updated_at: new Date().toISOString(),
      task_category: task_category === '_' ? null : task_category,
      price_tier: price_tier === '_' ? null : price_tier,
      owner_type: owner_type === '_' ? null : owner_type,
      contact_role: contact_role === '_' ? null : contact_role,
      deal_stage: deal_stage === '_' ? null : deal_stage,
      sample_size: rows.length,
      winning_channel: winningChannel,
      winning_action_summary: winningSummary,
      success_rate: successRate,
      failure_modes: Object.keys(failureModes),
      resolution_ids: rows.map(r => r.id),
    })
  }

  lsSet(LS_PATTERNS, patterns)
  return patterns
}

export async function listPatterns() {
  const cached = lsGet(LS_PATTERNS)
  if (cached.length > 0) return cached
  return await rebuildPatterns()
}

// ── Learning Metrics ─────────────────────────────────────────────────────────
// The adoption curve. The KEY chart is acceptance_rate over time — it
// should trend up. If it plateaus or drops the patterns need review.

export async function computeMetrics(periodDays = 7) {
  const since = Date.now() - periodDays * 86_400_000
  const resolutions = (await listResolutions()).filter(r => new Date(r.created_at).getTime() >= since)
  const proposals  = (await listProposals()).filter(p => new Date(p.created_at).getTime() >= since)

  const total = resolutions.length
  const withProposal = resolutions.filter(r => r.proposed_action != null).length
  const accepted   = resolutions.filter(r => r.proposed_accepted === true).length
  const corrected  = resolutions.filter(r => r.resolution_type === 'corrected').length
  const rejected   = proposals.filter(p => p.status === 'rejected').length

  return {
    period_days: periodDays,
    total_tasks: total,
    tasks_with_proposals: withProposal,
    proposals_accepted: accepted,
    proposals_corrected: corrected,
    proposals_rejected: rejected,
    tasks_without_proposals: total - withProposal,
    acceptance_rate: withProposal > 0 ? accepted / withProposal : 0,
    correction_rate: withProposal > 0 ? corrected / withProposal : 0,
    coverage_rate:   total > 0 ? withProposal / total : 0,
    avg_confidence:  proposals.length > 0
      ? proposals.reduce((s, p) => s + (p.confidence || 0), 0) / proposals.length
      : 0,
  }
}

// ── Per-Task Chats ───────────────────────────────────────────────────────────

export async function listChat(task_id) {
  const sb = getSupabase()
  if (sb) {
    try {
      const { data, error } = await sb.from('task_chats').select('*').eq('task_id', task_id).order('created_at', { ascending: true })
      if (error) throw error
      return data || []
    } catch (e) {
      console.warn('Supabase listChat failed, using localStorage', e)
    }
  }
  return lsGet(LS_CHATS).filter(c => c.task_id === task_id)
}

export async function appendChat(task_id, role, content, extracted_data = null) {
  const record = {
    id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    task_id,
    created_at: new Date().toISOString(),
    role,
    content,
    extracted_data,
  }
  const sb = getSupabase()
  if (sb) {
    try {
      const { data, error } = await sb.from('task_chats').insert(record).select().single()
      if (error) throw error
      return data
    } catch (e) {
      console.warn('Supabase appendChat failed, using localStorage', e)
    }
  }
  const all = lsGet(LS_CHATS)
  all.push(record)
  lsSet(LS_CHATS, all)
  return record
}
