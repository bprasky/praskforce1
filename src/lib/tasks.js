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

export function buildParsePrompt(notes, contactName, propertyAddress) {
  return `You are a sales operations assistant for a natural stone importer. Parse these meeting notes into structured action items.

MEETING CONTEXT:
${contactName ? `Contact: ${contactName}` : ''}
${propertyAddress ? `Property: ${propertyAddress}` : ''}

MEETING NOTES:
${notes}

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
- "crm_data": any data that should be recorded in the CRM (contact info updates, project status changes, material preferences, notes)

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
