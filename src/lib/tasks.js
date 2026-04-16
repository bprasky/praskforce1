// PraskForce1 — Task Engine
// Replaces Trello. Meeting notes go in, parsed action items come out.
// Each action maps to an agent instruction playbook.

const TASKS_KEY = 'pf1_tasks'
const MEETINGS_KEY = 'pf1_meetings'

// Task categories. The original 9 are unchanged (kept for backward
// compatibility with existing localStorage tasks); the additions cover
// the recurring board categories Brad used to manage in Trello —
// quote adjustments, booking meetings, intro outreach, sending samples,
// and pricing requests to suppliers. They're ALL valid for Claude to
// pick when parsing meeting notes / emails.
export const TASK_TYPES = {
  QUOTE:            { id: 'QUOTE',            label: 'Create Quote',     playbook: 'QUOTE-001',     icon: '📋', systems: ['StoneProfits'],            color: 'text-blue-600',    bg: 'bg-blue-50' },
  QUOTE_ADJUSTMENT: { id: 'QUOTE_ADJUSTMENT', label: 'Adjust Quote',     playbook: 'QUOTE-002',     icon: '✏️', systems: ['StoneProfits'],            color: 'text-cyan-600',    bg: 'bg-cyan-50' },
  FOLLOW_UP:        { id: 'FOLLOW_UP',        label: 'Follow Up',        playbook: 'FOLLOW-001',    icon: '🔄', systems: ['Outlook'],                 color: 'text-amber-600',   bg: 'bg-amber-50' },
  BOOK_MEETING:     { id: 'BOOK_MEETING',     label: 'Book Meeting',     playbook: 'MEET-001',      icon: '📆', systems: ['Outlook'],                 color: 'text-violet-600',  bg: 'bg-violet-50' },
  INTRO:            { id: 'INTRO',            label: 'Intro / Outreach', playbook: 'INTRO-001',     icon: '👋', systems: ['Outlook', 'LinkedIn'],     color: 'text-pink-600',    bg: 'bg-pink-50' },
  EMAIL:            { id: 'EMAIL',            label: 'Send Email',       playbook: 'EMAIL-001',     icon: '📧', systems: ['Outlook'],                 color: 'text-green-600',   bg: 'bg-green-50' },
  SAMPLE_SEND:      { id: 'SAMPLE_SEND',      label: 'Send Samples',     playbook: 'SAMPLE-001',    icon: '📦', systems: [],                          color: 'text-orange-600',  bg: 'bg-orange-50' },
  PRICING:          { id: 'PRICING',          label: 'Pricing Request',  playbook: 'PRICING-001',   icon: '💲', systems: ['StoneProfits'],            color: 'text-emerald-600', bg: 'bg-emerald-50' },
  RESEARCH:         { id: 'RESEARCH',         label: 'Research',         playbook: 'RESEARCH-001',  icon: '🔍', systems: ['StoneProfits', 'arcaww.com'], color: 'text-purple-600',  bg: 'bg-purple-50' },
  ADMIN:            { id: 'ADMIN',            label: 'Admin / Hold',     playbook: 'ADMIN-001',     icon: '🔒', systems: ['StoneProfits'],            color: 'text-red-600',     bg: 'bg-red-50' },
  SCHEDULE:         { id: 'SCHEDULE',         label: 'Schedule',         playbook: 'SCHED-001',     icon: '📅', systems: ['Outlook'],                 color: 'text-indigo-600',  bg: 'bg-indigo-50' },
  CAPTURE:          { id: 'CAPTURE',          label: 'Photo / Capture',  playbook: 'CAPTURE-001',   icon: '📸', systems: [],                          color: 'text-orange-500',  bg: 'bg-orange-50' },
  CRM_UPDATE:       { id: 'CRM_UPDATE',       label: 'Update CRM',       playbook: null,            icon: '💾', systems: ['StoneProfits'],            color: 'text-gray-600',    bg: 'bg-gray-50' },
  CUSTOM:           { id: 'CUSTOM',           label: 'Custom',           playbook: null,            icon: '⚡', systems: [],                          color: 'text-gray-600',    bg: 'bg-gray-50' },
}

// Where a task originated. Surfaced in the matrix view so Brad can filter
// "tasks pulled from inbox" vs "tasks captured in meetings."
export const TASK_SOURCES = {
  meeting_notes:   { label: 'Meeting',  icon: '📝', color: 'text-amber-700' },
  outlook_email:   { label: 'Outlook',  icon: '📧', color: 'text-blue-700' },
  outlook_agent:   { label: 'Inbox Scan', icon: '🤖', color: 'text-blue-700' },
  permit_scan:     { label: 'Permit',   icon: '🏗️', color: 'text-purple-700' },
  manual:          { label: 'Manual',   icon: '✋', color: 'text-gray-600' },
  agent_extracted: { label: 'Agent',    icon: '⚙️', color: 'text-gray-700' },
  chat:            { label: 'Chat',     icon: '💬', color: 'text-blue-600' },
}

export const TASK_STATUS = {
  pending: { label: 'Pending', color: 'text-gray-500', bg: 'bg-gray-100' },
  ready: { label: 'Ready to Run', color: 'text-amber-600', bg: 'bg-amber-50' },
  running: { label: 'Running', color: 'text-blue-600', bg: 'bg-blue-50' },
  needs_review: { label: 'Needs Review', color: 'text-purple-600', bg: 'bg-purple-50' },
  done: { label: 'Done', color: 'text-green-600', bg: 'bg-green-50' },
  failed: { label: 'Failed', color: 'text-red-600', bg: 'bg-red-50' },
}

// Learning-layer lifecycle. Lives alongside `status` (which still drives
// the existing run/review/done UI) so the new resolution flow can be
// rolled out without breaking existing task interactions.
//
//   CREATED → PROPOSED → ACTIVE → RESOLVING → RESOLVED
//
// CREATED   — task entered the system, context snapshot built
// PROPOSED  — system has run the matcher (proposal may or may not exist)
// ACTIVE    — user accepted/corrected the proposal and is working it
// RESOLVING — user is logging the resolution
// RESOLVED  — resolution stored; pattern tables updated
export const LIFECYCLE_STAGES = ['CREATED', 'PROPOSED', 'ACTIVE', 'RESOLVING', 'RESOLVED']

export function nextLifecycle(stage) {
  const idx = LIFECYCLE_STAGES.indexOf(stage)
  if (idx < 0 || idx >= LIFECYCLE_STAGES.length - 1) return stage
  return LIFECYCLE_STAGES[idx + 1]
}

// ── Storage ──

export function getTasks() {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(TASKS_KEY) || '[]') } catch { return [] }
}

export function saveTasks(tasks) {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks))
}

export function addTask(task) {
  const tasks = getTasks()
  const record = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    created_at: new Date().toISOString(),
    status: 'pending',
    lifecycle: 'CREATED',
    // Default source/value/quote_ref fields so every task has a uniform
    // shape for the matrix view's sorters. Callers can override.
    source: task.source || 'manual',
    value: task.value ?? null,
    quote_ref: task.quote_ref || null,
    sale_ref: task.sale_ref || null,
    ...task,
  }
  tasks.unshift(record)
  saveTasks(tasks)
  return tasks
}

// Find the most recent meeting for a contact within a recency window.
// Used for meeting continuation: if Brad re-enters notes for the same
// client within ~14 days, those notes are treated as a continuation of
// the prior session rather than a brand new meeting (so existing open
// tasks can be passed to Claude as context for deduping).
export function findRecentMeetingForContact(contactName, withinDays = 14) {
  if (!contactName) return null
  const cutoff = Date.now() - withinDays * 86_400_000
  return getMeetings().find(m =>
    m.contact &&
    m.contact.toLowerCase().trim() === contactName.toLowerCase().trim() &&
    new Date(m.created_at).getTime() >= cutoff
  ) || null
}

// Find existing OPEN tasks for a contact — the seed set for meeting
// continuation. Claude gets to see these so it doesn't duplicate them
// and can propose marking some as resolved by the new notes.
export function findOpenTasksForContact(contactName) {
  if (!contactName) return []
  const norm = contactName.toLowerCase().trim()
  return getTasks().filter(t =>
    t.status !== 'done' &&
    t.contact &&
    t.contact.toLowerCase().trim() === norm
  )
}

export function updateTask(id, updates) {
  const tasks = getTasks()
  const idx = tasks.findIndex(t => t.id === id)
  if (idx >= 0) {
    tasks[idx] = { ...tasks[idx], ...updates, updated_at: new Date().toISOString() }
    saveTasks(tasks)
  }
  return tasks
}

export function deleteTask(id) {
  const tasks = getTasks().filter(t => t.id !== id)
  saveTasks(tasks)
  return tasks
}

// ── Meetings ──

export function getMeetings() {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(MEETINGS_KEY) || '[]') } catch { return [] }
}

export function saveMeeting(meeting) {
  const meetings = getMeetings()
  const record = {
    id: `mtg_${Date.now()}`,
    created_at: new Date().toISOString(),
    ...meeting,
  }
  meetings.unshift(record)
  localStorage.setItem(MEETINGS_KEY, JSON.stringify(meetings))
  return record
}

// ── AI Parsing Prompt Builder ──
// This generates the prompt sent to Claude to parse meeting notes into tasks

const TASK_TYPE_GUIDE = `- QUOTE: Create a NEW quote in StoneProfits.
- QUOTE_ADJUSTMENT: Modify an EXISTING quote — change materials, qty, pricing, terms. Always set quote_ref if known.
- FOLLOW_UP: Follow up on a previous quote, sample, or conversation. Has a time component.
- BOOK_MEETING: Specifically schedule a meeting (showroom, site visit, lunch, design review). Distinct from generic SCHEDULE.
- INTRO: First-touch intro / cold outreach to a new contact, architect, designer, builder.
- EMAIL: Send a specific email — thank you, info request, material specs.
- SAMPLE_SEND: Pull and ship physical samples to a contact. Always populate "materials".
- PRICING: Get pricing or availability from a supplier / quarry.
- RESEARCH: Look up info on materials, contacts, competitors, projects.
- ADMIN: Place holds on slabs, reserve inventory, update records.
- SCHEDULE: Non-meeting scheduling — deliveries, fab slots, install windows.
- CAPTURE: Photos / physical tasks (NOT samples — that's SAMPLE_SEND).
- CRM_UPDATE: Update contact info, project status, or notes in StoneProfits.
- CUSTOM: Anything that doesn't fit the above.`

export function buildParsePrompt(notes, contactName, propertyAddress, lineageContext = null) {
  // lineageContext (optional) lets Claude link new tasks into an
  // existing tree instead of always creating a new root. Shape:
  //   {
  //     openTasks: [{ id, type, description, account_id, property_id, days_old }, ...],
  //     knownAccounts: [{ id, name, aka: [...] }, ...],
  //     knownProperties: [{ id, address, account_id }, ...],
  //   }
  // The lineage block is only included when at least one list is
  // non-empty so the prompt stays small for first-time users.
  const hasLineage = lineageContext && (
    (lineageContext.openTasks || []).length > 0 ||
    (lineageContext.knownAccounts || []).length > 0 ||
    (lineageContext.knownProperties || []).length > 0
  )

  const lineageBlock = hasLineage ? `

LINEAGE CONTEXT (match against this before creating tasks):

OPEN TASKS FROM EXISTING TREES (these are candidates for "suggested_parent_task_id"):
${(lineageContext.openTasks || []).map(t =>
  `[${t.id}] ${t.type}: ${t.description || ''}${t.account_id ? ` (account: ${t.account_id})` : ''}${t.property_id ? ` (property: ${t.property_id})` : ''}${t.days_old != null ? ` — ${t.days_old}d old` : ''}`
).join('\n') || '(none)'}

KNOWN ACCOUNTS:
${(lineageContext.knownAccounts || []).map(a =>
  `[${a.id}] ${a.name}${a.aka && a.aka.length ? ` (aka ${a.aka.join(', ')})` : ''}`
).join('\n') || '(none)'}

KNOWN PROPERTIES:
${(lineageContext.knownProperties || []).map(p =>
  `[${p.id}] ${p.address}${p.account_id ? ` — owner account ${p.account_id}` : ''}`
).join('\n') || '(none)'}

For each task you generate below, INCLUDE these additional fields (each is optional — use null if you can't determine it):
- "suggested_parent_task_id": the UUID of an existing OPEN task this should become a CHILD of, or null if it's a brand-new root task. Only suggest a parent when the new task is a clear continuation or direct follow-up of that existing task (NOT just related to the same client).
- "property_id": UUID from KNOWN PROPERTIES above if the task is clearly about that property, else null.
- "account_id": UUID from KNOWN ACCOUNTS above if the task is clearly about that account, else null.

CRITICAL: if you're not confident about a match, leave it null. Wrong links are worse than missing links — they pollute the tree and hide real patterns.` : ''

  return `You are a sales operations assistant for a natural stone importer. Parse these meeting notes into structured action items.

MEETING CONTEXT:
${contactName ? `Contact: ${contactName}` : ''}
${propertyAddress ? `Property: ${propertyAddress}` : ''}

MEETING NOTES:
${notes}${lineageBlock}

Extract every actionable item. For each, return a JSON object with:
- "type": one of QUOTE, QUOTE_ADJUSTMENT, FOLLOW_UP, BOOK_MEETING, INTRO, EMAIL, SAMPLE_SEND, PRICING, RESEARCH, ADMIN, SCHEDULE, CAPTURE, CRM_UPDATE, CUSTOM
- "description": clear description of what needs to be done
- "contact": person involved (if mentioned)
- "property": property address (if mentioned)
- "materials": any materials/products mentioned
- "deadline": any deadline mentioned (or null)
- "priority": "high", "medium", or "low"
- "value": estimated dollar value of the task if it's tied to a quote/sale (number, no commas), or null
- "quote_ref": StoneProfits quote number if explicitly mentioned (e.g. "Q-2024-1337"), or null
- "crm_data": any data that should be recorded in the CRM (contact info updates, project status changes, material preferences, notes)${hasLineage ? `
- "suggested_parent_task_id": see LINEAGE CONTEXT above (nullable)
- "property_id": see LINEAGE CONTEXT above (nullable)
- "account_id": see LINEAGE CONTEXT above (nullable)` : ''}

TASK TYPE GUIDE:
${TASK_TYPE_GUIDE}

IMPORTANT: Also extract any CRM-worthy data from the notes — contact preferences, project timelines, material interests, budget signals, decision-maker info — and include it in crm_data for each relevant task. This data should be recorded in StoneProfits, not just live in a task board.

Respond with ONLY a JSON array of action items. No other text.`
}

// ── Meeting Continuation Prompt ──
// When Brad re-enters notes for a contact who already has open tasks,
// don't blindly re-extract — pass the open tasks as context and ask
// Claude to (a) flag any open tasks the new notes resolve, and (b)
// extract only the NEW action items. This is the "pick up where you
// left off" behavior: the second meeting builds on the first.

export function buildContinuationPrompt({ notes, contactName, propertyAddress, openTasks, lastMeetingNotes }) {
  const openTaskList = openTasks.map(t =>
    `[${t.id}] ${t.type}: ${t.description}${t.deadline ? ` (due: ${t.deadline})` : ''}`
  ).join('\n')

  return `You are a sales operations assistant. Brad just had ANOTHER meeting with a contact who already has open action items from a previous meeting. Your job is to (1) figure out which existing tasks are now resolved by these new notes, and (2) extract only the NEW action items — don't duplicate things that are already on the board.

CONTACT: ${contactName || 'unknown'}
${propertyAddress ? `PROPERTY: ${propertyAddress}` : ''}

OPEN TASKS FROM PREVIOUS MEETINGS (do NOT re-create these):
${openTaskList || '(none)'}

${lastMeetingNotes ? `LAST MEETING NOTES (for context):\n${lastMeetingNotes}\n` : ''}
NEW MEETING NOTES:
${notes}

Respond with ONLY a JSON object (no other text, no markdown):
{
  "resolved_task_ids": ["task_id_1", "task_id_2"],   // existing tasks that the new notes complete or close out
  "resolution_notes": {                                // optional brief note explaining HOW each was resolved
    "task_id_1": "client confirmed material selection",
    "task_id_2": "meeting moved to Friday"
  },
  "new_tasks": [                                       // ONLY actually-new action items, NOT restatements of open tasks
    {
      "type": "...",
      "description": "...",
      "contact": "...",
      "property": "...",
      "materials": "...",
      "deadline": "...",
      "priority": "high|medium|low",
      "value": null,
      "quote_ref": null,
      "crm_data": null
    }
  ]
}

TASK TYPE GUIDE:
${TASK_TYPE_GUIDE}`
}

// ═══════════════════════════════════════════════════════════════════
// TASK TREE & LINEAGE
// ═══════════════════════════════════════════════════════════════════
//
// Every task tree starts from an `origin` (meeting notes, agent scan,
// manual add, etc). Tasks have parent/child relationships. Tasks can
// resolve to outcomes (won, lost, stale, merged, deferred). The shape
// of a completed tree is a signal we can analyze for patterns.
//
// Storage: Supabase when connected, localStorage fallback. Same pattern
// as the rest of this codebase. The SQL schema is in
// supabase/schema-task-tree.sql — apply that before the Supabase path
// will work.

import { getSupabase as getSupabaseClient } from '@/lib/supabase'

const LS_ORIGINS = 'pf1_task_origins'

export const ORIGIN_TYPES = {
  meeting_notes: { label: 'Meeting Notes', icon: '📝', color: 'text-amber-700', bg: 'bg-amber-50' },
  agent_scan:    { label: 'Agent Scan',    icon: '🤖', color: 'text-blue-700',  bg: 'bg-blue-50' },
  manual:        { label: 'Manual',        icon: '✋', color: 'text-gray-600',  bg: 'bg-gray-100' },
  referral:      { label: 'Referral',      icon: '👥', color: 'text-purple-700', bg: 'bg-purple-50' },
  permit_hit:    { label: 'Permit Hit',    icon: '🏗️', color: 'text-orange-700', bg: 'bg-orange-50' },
  social_signal: { label: 'Social Signal', icon: '📱', color: 'text-pink-700',  bg: 'bg-pink-50' },
}

export const RESOLUTIONS = {
  open:     { label: 'Open',     color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  won:      { label: 'Won',      color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
  lost:     { label: 'Lost',     color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200' },
  stale:    { label: 'Stale',    color: 'text-gray-600',   bg: 'bg-gray-100',  border: 'border-gray-200' },
  merged:   { label: 'Merged',   color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  deferred: { label: 'Deferred', color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200' },
}

// ── localStorage fallbacks for origins + lineage ─────────────────────

function lsGetOrigins() {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(LS_ORIGINS) || '[]') } catch { return [] }
}
function lsSaveOrigins(list) {
  localStorage.setItem(LS_ORIGINS, JSON.stringify(list))
}

// ── Origins ──────────────────────────────────────────────────────────

/**
 * Create a task origin — the event that spawned a tree.
 *
 * @param {Object} input
 * @param {string} input.originType - 'meeting_notes' | 'agent_scan' | 'manual' | 'referral' | 'permit_hit' | 'social_signal'
 * @param {string} input.title - short human label ("Galbut meeting 4/10")
 * @param {string} [input.rawContent] - original text/output, for audit
 * @param {string} [input.sourceAgent] - agent task id if applicable
 * @param {string} [input.propertyId]
 * @param {string} [input.accountId]
 * @param {Object} [input.metadata]
 * @returns {Promise<Object>} the created origin record
 */
export async function createOrigin({
  originType,
  title,
  rawContent = null,
  sourceAgent = null,
  propertyId = null,
  accountId = null,
  metadata = {},
}) {
  if (!originType) throw new Error('createOrigin: originType is required')
  if (!title) throw new Error('createOrigin: title is required')

  const record = {
    origin_type: originType,
    title,
    raw_content: rawContent,
    source_agent: sourceAgent,
    property_id: propertyId,
    account_id: accountId,
    metadata,
    created_at: new Date().toISOString(),
  }

  const sb = getSupabaseClient()
  if (sb) {
    try {
      const { data, error } = await sb.from('task_origins').insert(record).select().single()
      if (error) throw error
      return data
    } catch (e) {
      console.warn('Supabase createOrigin failed, falling back to localStorage', e)
    }
  }

  const full = { id: `orig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, ...record }
  lsSaveOrigins([full, ...lsGetOrigins()])
  return full
}

export async function listOrigins(filter = {}) {
  const sb = getSupabaseClient()
  if (sb) {
    try {
      let q = sb.from('task_origins').select('*').order('created_at', { ascending: false })
      if (filter.originType) q = q.eq('origin_type', filter.originType)
      if (filter.accountId) q = q.eq('account_id', filter.accountId)
      if (filter.propertyId) q = q.eq('property_id', filter.propertyId)
      const { data, error } = await q
      if (error) throw error
      return data || []
    } catch (e) {
      console.warn('Supabase listOrigins failed, falling back to localStorage', e)
    }
  }
  let list = lsGetOrigins()
  if (filter.originType) list = list.filter(o => o.origin_type === filter.originType)
  if (filter.accountId) list = list.filter(o => o.account_id === filter.accountId)
  if (filter.propertyId) list = list.filter(o => o.property_id === filter.propertyId)
  return list
}

// ── Core lineage task operations ─────────────────────────────────────

/**
 * Create a task with full lineage metadata. Handles depth derivation
 * and origin inheritance from the parent. All new tree-aware call sites
 * should use this instead of addTask().
 *
 * @param {Object} input
 * @param {string} [input.title]
 * @param {string} [input.description]
 * @param {string} input.type - TASK_TYPES id (spec calls this "category")
 * @param {string} [input.parentTaskId]
 * @param {string} [input.originId] - required if parentTaskId is null
 * @param {string} [input.originType]
 * @param {string} [input.propertyId]
 * @param {string} [input.accountId]
 * @param {string} [input.pipelineDealId]
 * @param {string} [input.contact]
 * @param {string} [input.property]
 * @param {string} [input.materials]
 * @param {string} [input.deadline]
 * @param {string} [input.priority]
 * @param {string} [input.status]
 * @param {string} [input.source]
 * @param {number} [input.value]
 * @param {string} [input.quoteRef]
 * @param {Object} [input.crmData]
 */
export async function createTaskWithLineage(input) {
  const {
    title = null,
    description = null,
    type = 'CUSTOM',
    parentTaskId = null,
    propertyId = null,
    accountId = null,
    pipelineDealId = null,
    contact = null,
    property = null,
    materials = null,
    deadline = null,
    priority = 'medium',
    status = 'pending',
    source = 'manual',
    value = null,
    quoteRef = null,
    crmData = null,
  } = input

  let { originId, originType = 'manual' } = input

  // Resolve depth + inherit origin from parent when a parent is given.
  let depth = 0
  if (parentTaskId) {
    const parent = await getTaskById(parentTaskId)
    if (parent) {
      depth = (parent.depth || 0) + 1
      if (!originId) originId = parent.origin_id
      if (parent.origin_type && !input.originType) originType = parent.origin_type
    }
  }

  if (!originId) {
    throw new Error('createTaskWithLineage: originId is required for root tasks (no parent). Call createOrigin() first.')
  }

  const record = {
    title,
    description,
    type,
    parent_task_id: parentTaskId,
    origin_id: originId,
    origin_type: originType,
    resolution: 'open',
    depth,
    property_id: propertyId,
    account_id: accountId,
    pipeline_deal_id: pipelineDealId,
    contact,
    property,
    materials,
    deadline,
    priority,
    status,
    source,
    value,
    quote_ref: quoteRef,
    crm_data: crmData,
    created_at: new Date().toISOString(),
  }

  const sb = getSupabaseClient()
  if (sb) {
    try {
      const { data, error } = await sb.from('tasks').insert(record).select().single()
      if (error) throw error
      return data
    } catch (e) {
      console.warn('Supabase createTaskWithLineage failed, falling back to localStorage', e)
    }
  }

  // localStorage fallback: mirror into the existing `pf1_tasks` list
  const local = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ...record,
  }
  const tasks = getTasks()
  tasks.unshift(local)
  saveTasks(tasks)
  return local
}

/**
 * Batch-create multiple children under the same parent. Used when AI
 * parses a follow-up meeting into several action items that all belong
 * under an existing open task.
 */
export async function spawnChildTasks(parentTaskId, childTaskDefs = []) {
  if (!parentTaskId) throw new Error('spawnChildTasks: parentTaskId is required')
  if (!Array.isArray(childTaskDefs) || childTaskDefs.length === 0) return []

  const parent = await getTaskById(parentTaskId)
  if (!parent) throw new Error(`spawnChildTasks: parent ${parentTaskId} not found`)

  const created = []
  for (const def of childTaskDefs) {
    const child = await createTaskWithLineage({
      ...def,
      parentTaskId,
      originId: def.originId || parent.origin_id,
      originType: def.originType || parent.origin_type,
      // Inherit linkage unless the child explicitly overrides
      propertyId: def.propertyId ?? parent.property_id,
      accountId:  def.accountId  ?? parent.account_id,
      pipelineDealId: def.pipelineDealId ?? parent.pipeline_deal_id,
    })
    created.push(child)
  }
  return created
}

/**
 * Resolve a task. Never cascades automatically — if this completes the
 * last open child under a parent, the UI gets a `cascade_hint` back so
 * it can prompt the user. The user, not the system, decides whether
 * the parent is done too.
 */
export async function resolveTask(taskId, { resolution, resolvedNote = null } = {}) {
  if (!RESOLUTIONS[resolution] || resolution === 'open') {
    throw new Error(`resolveTask: invalid resolution "${resolution}". Must be won|lost|stale|merged|deferred.`)
  }

  const updates = {
    resolution,
    resolved_note: resolvedNote,
    resolved_at: new Date().toISOString(),
    // Keep the existing status flow working: resolving always sets
    // status to 'done' so old list views don't show it as active.
    status: 'done',
    updated_at: new Date().toISOString(),
  }

  const sb = getSupabaseClient()
  let updated
  if (sb) {
    try {
      const { data, error } = await sb.from('tasks').update(updates).eq('id', taskId).select().single()
      if (error) throw error
      updated = data
    } catch (e) {
      console.warn('Supabase resolveTask failed, falling back to localStorage', e)
    }
  }

  if (!updated) {
    const tasks = getTasks()
    const idx = tasks.findIndex(t => t.id === taskId)
    if (idx >= 0) {
      tasks[idx] = { ...tasks[idx], ...updates }
      saveTasks(tasks)
      updated = tasks[idx]
    }
  }

  if (!updated) return { task: null, cascade_hint: null }

  // Cascade hint — do not mutate the parent. Just tell the caller.
  let cascadeHint = null
  const parentId = updated.parent_task_id || updated.parentTaskId
  if (parentId) {
    const siblings = await listChildrenOfTask(parentId)
    const stillOpen = siblings.filter(s => s.id !== taskId && (s.resolution === 'open' || !s.resolution))
    if (stillOpen.length === 0) {
      const parent = await getTaskById(parentId)
      if (parent && parent.resolution === 'open') {
        cascadeHint = {
          parent_task_id: parentId,
          parent_title: parent.title || parent.description,
          message: 'All child tasks are now resolved. Resolve the parent too?',
        }
      }
    }
  }

  return { task: updated, cascade_hint: cascadeHint }
}

// ── Read / query helpers ─────────────────────────────────────────────

async function getTaskById(taskId) {
  const sb = getSupabaseClient()
  if (sb) {
    try {
      const { data, error } = await sb.from('tasks').select('*').eq('id', taskId).single()
      if (error) throw error
      return data
    } catch (e) {
      // fall through
    }
  }
  return getTasks().find(t => t.id === taskId) || null
}

async function listChildrenOfTask(parentTaskId) {
  const sb = getSupabaseClient()
  if (sb) {
    try {
      const { data, error } = await sb.from('tasks').select('*').eq('parent_task_id', parentTaskId)
      if (error) throw error
      return data || []
    } catch (e) {
      // fall through
    }
  }
  return getTasks().filter(t => (t.parent_task_id || t.parentTaskId) === parentTaskId)
}

/**
 * Return the full tree for a given origin as a single nested tree
 * structure: { ...root, children: [{ ...child, children: [...] }] }.
 * Multiple roots per origin are allowed — returns an array.
 */
export async function getTaskTree(originId) {
  if (!originId) return []

  let rows = []
  const sb = getSupabaseClient()
  if (sb) {
    try {
      const { data, error } = await sb
        .from('task_tree')
        .select('*')
        .eq('origin_id', originId)
        .order('depth', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      rows = data || []
    } catch (e) {
      console.warn('Supabase getTaskTree failed, falling back to localStorage', e)
    }
  }
  if (rows.length === 0) {
    rows = getTasks().filter(t => (t.origin_id || t.originId) === originId)
  }

  // Nest by parent_task_id
  const byId = {}
  for (const r of rows) byId[r.id] = { ...r, children: [] }

  const roots = []
  for (const r of rows) {
    const node = byId[r.id]
    const parentId = r.parent_task_id || r.parentTaskId
    if (parentId && byId[parentId]) {
      byId[parentId].children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

/**
 * List all task trees grouped by origin, for the tree-view UI. Returns
 * [{ origin, roots: [...], summary: { total, open, won, lost, ... } }].
 */
export async function listTaskTrees(filter = {}) {
  const origins = await listOrigins(filter)
  const trees = []
  for (const origin of origins) {
    const roots = await getTaskTree(origin.id)
    // flat summary
    const flat = []
    const walk = (nodes) => {
      for (const n of nodes) {
        flat.push(n)
        if (n.children?.length) walk(n.children)
      }
    }
    walk(roots)
    const summary = {
      total: flat.length,
      open: flat.filter(t => (t.resolution || 'open') === 'open').length,
      won: flat.filter(t => t.resolution === 'won').length,
      lost: flat.filter(t => t.resolution === 'lost').length,
      stale: flat.filter(t => t.resolution === 'stale').length,
      max_depth: flat.reduce((m, t) => Math.max(m, t.depth || 0), 0),
    }
    summary.is_terminal = summary.open === 0 && summary.total > 0
    trees.push({ origin, roots, summary })
  }
  return trees
}

/**
 * Return the ancestry path from a task up to its root, for breadcrumbs.
 */
export async function getTaskAncestry(taskId) {
  const path = []
  let currentId = taskId
  // Guard against cycles — tree shouldn't cycle but belt + suspenders.
  const visited = new Set()
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const t = await getTaskById(currentId)
    if (!t) break
    path.unshift(t)
    currentId = t.parent_task_id || t.parentTaskId
  }
  return path
}

/**
 * Query the task_tree_summary and task_resolution_patterns views for
 * the analytics component. Falls back gracefully when Supabase is
 * not connected (returns zeroed stats so the UI can show its empty
 * state).
 */
export async function getTreeAnalytics(filter = {}) {
  const sb = getSupabaseClient()
  const out = { summaries: [], patterns: [], terminal_trees: 0, source: 'localStorage' }

  if (sb) {
    try {
      let sq = sb.from('task_tree_summary').select('*')
      if (filter.accountId) sq = sq.eq('account_id', filter.accountId)
      if (filter.propertyId) sq = sq.eq('property_id', filter.propertyId)
      if (filter.originType) sq = sq.eq('origin_type', filter.originType)
      if (filter.treeOutcome) sq = sq.eq('tree_outcome', filter.treeOutcome)
      const { data: summaries, error: se } = await sq
      if (se) throw se
      out.summaries = summaries || []

      const { data: patterns, error: pe } = await sb.from('task_resolution_patterns').select('*')
      if (pe) throw pe
      out.patterns = patterns || []

      out.terminal_trees = out.summaries.filter(s => s.is_terminal).length
      out.source = 'supabase'
      return out
    } catch (e) {
      console.warn('Supabase getTreeAnalytics failed, falling back to localStorage', e)
    }
  }

  // localStorage fallback — compute what we can from flat tasks
  const origins = lsGetOrigins()
  const tasks = getTasks()
  out.summaries = origins.map(o => {
    const mine = tasks.filter(t => (t.origin_id || t.originId) === o.id)
    const open = mine.filter(t => (t.resolution || 'open') === 'open').length
    const won = mine.filter(t => t.resolution === 'won').length
    const lost = mine.filter(t => t.resolution === 'lost').length
    return {
      origin_id: o.id,
      origin_type: o.origin_type,
      origin_title: o.title,
      total_tasks: mine.length,
      open_tasks: open,
      won_tasks: won,
      lost_tasks: lost,
      is_terminal: mine.length > 0 && open === 0,
      tree_outcome: won > 0 ? 'won' : (open === 0 && lost > 0 ? 'lost' : (open === 0 ? 'closed' : 'active')),
    }
  })
  out.terminal_trees = out.summaries.filter(s => s.is_terminal).length
  return out
}
