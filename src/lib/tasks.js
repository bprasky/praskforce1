// PraskForce1 — Task Engine
// Replaces Trello. Meeting notes go in, parsed action items come out.
// Each action maps to an agent instruction playbook.

const TASKS_KEY = 'pf1_tasks'
const MEETINGS_KEY = 'pf1_meetings'

export const TASK_TYPES = {
  QUOTE: { id: 'QUOTE', label: 'Create Quote', playbook: 'QUOTE-001', icon: '📋', systems: ['StoneProfits'], color: 'text-blue-600', bg: 'bg-blue-50' },
  FOLLOW_UP: { id: 'FOLLOW_UP', label: 'Follow Up', playbook: 'FOLLOW-001', icon: '🔄', systems: ['Outlook'], color: 'text-amber-600', bg: 'bg-amber-50' },
  EMAIL: { id: 'EMAIL', label: 'Send Email', playbook: 'EMAIL-001', icon: '📧', systems: ['Outlook'], color: 'text-green-600', bg: 'bg-green-50' },
  RESEARCH: { id: 'RESEARCH', label: 'Research', playbook: 'RESEARCH-001', icon: '🔍', systems: ['StoneProfits', 'arcaww.com'], color: 'text-purple-600', bg: 'bg-purple-50' },
  ADMIN: { id: 'ADMIN', label: 'Admin / Hold / Reserve', playbook: 'ADMIN-001', icon: '🔒', systems: ['StoneProfits'], color: 'text-red-600', bg: 'bg-red-50' },
  SCHEDULE: { id: 'SCHEDULE', label: 'Schedule', playbook: 'SCHED-001', icon: '📅', systems: ['Outlook'], color: 'text-indigo-600', bg: 'bg-indigo-50' },
  CAPTURE: { id: 'CAPTURE', label: 'Capture / Sample', playbook: 'CAPTURE-001', icon: '📸', systems: [], color: 'text-orange-600', bg: 'bg-orange-50' },
  CRM_UPDATE: { id: 'CRM_UPDATE', label: 'Update CRM', playbook: null, icon: '💾', systems: ['StoneProfits'], color: 'text-gray-600', bg: 'bg-gray-50' },
  CUSTOM: { id: 'CUSTOM', label: 'Custom', playbook: null, icon: '⚡', systems: [], color: 'text-gray-600', bg: 'bg-gray-50' },
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
    ...task,
  }
  tasks.unshift(record)
  saveTasks(tasks)
  return tasks
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

export function buildParsePrompt(notes, contactName, propertyAddress) {
  return `You are a sales operations assistant for a natural stone importer. Parse these meeting notes into structured action items.

MEETING CONTEXT:
${contactName ? `Contact: ${contactName}` : ''}
${propertyAddress ? `Property: ${propertyAddress}` : ''}

MEETING NOTES:
${notes}

Extract every actionable item. For each, return a JSON object with:
- "type": one of QUOTE, FOLLOW_UP, EMAIL, RESEARCH, ADMIN, SCHEDULE, CAPTURE, CRM_UPDATE, CUSTOM
- "description": clear description of what needs to be done
- "contact": person involved (if mentioned)
- "property": property address (if mentioned)
- "materials": any materials/products mentioned
- "deadline": any deadline mentioned (or null)
- "priority": "high", "medium", or "low"
- "crm_data": any data that should be recorded in the CRM (contact info updates, project status changes, material preferences, notes)

TASK TYPE GUIDE:
- QUOTE: Create/send a quote in StoneProfits. Includes material selection, pricing, sending.
- FOLLOW_UP: Follow up on a previous quote, sample, or conversation. Has a time component.
- EMAIL: Send a specific email — introduction, thank you, info request, material specs.
- RESEARCH: Look up materials, pricing, availability, competitor info, project details.
- ADMIN: Place holds on slabs, reserve inventory, update records, system maintenance.
- SCHEDULE: Schedule a meeting, showroom visit, site visit, delivery.
- CAPTURE: Take photos, prepare samples, physical tasks.
- CRM_UPDATE: Update contact info, project status, or notes in StoneProfits.
- CUSTOM: Anything that doesn't fit the above.

IMPORTANT: Also extract any CRM-worthy data from the notes — contact preferences, project timelines, material interests, budget signals, decision-maker info — and include it in crm_data for each relevant task. This data should be recorded in StoneProfits, not just live in a task board.

Respond with ONLY a JSON array of action items. No other text.`
}
