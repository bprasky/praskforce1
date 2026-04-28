// PraskForce1 — Prompt builders for the Tasks dispatcher.
//
// Each export is a `buildPrompt(task, context)` returning a string.
// The string is what the user copies into Claude Code (or another
// Claude tab) when the dispatcher mode is `copy_prompt`.
//
// Why these are templates rather than wired actions:
//   These categories all involve semantic matching, fuzzy lookups, or
//   drafting against tone. Recipe-based browser automation breaks the
//   moment a UI shifts. We ship copy-prompt for now and replace
//   individual entries with `wired` mode once the resolution-learning
//   model is mature enough for that category.
//
// The dispatcher (src/lib/dispatcher.js) wires task.type → buildPrompt.

import { buildQuotePrompt } from './quote.js'
import { buildFollowUpPrompt } from './follow-up.js'
import { buildEmailPrompt } from './email.js'
import { buildResearchPrompt } from './research.js'
import { buildAdminPrompt } from './admin.js'
import { buildSchedulePrompt } from './schedule.js'
import { buildCrmUpdatePrompt } from './crm-update.js'

export const PROMPT_BUILDERS = {
  QUOTE: buildQuotePrompt,
  FOLLOW_UP: buildFollowUpPrompt,
  EMAIL: buildEmailPrompt,
  RESEARCH: buildResearchPrompt,
  ADMIN: buildAdminPrompt,
  SCHEDULE: buildSchedulePrompt,
  CRM_UPDATE: buildCrmUpdatePrompt,
}

// Helpers shared by all builders. Kept in this file so each builder
// stays small and focused.

export function fmtField(label, value, fallback = 'unknown') {
  if (value === null || value === undefined || value === '') return `${label}: ${fallback}`
  return `${label}: ${value}`
}

export function fmtList(label, values, fallback = 'none') {
  if (!values || values.length === 0) return `${label}: ${fallback}`
  return `${label}: ${values.join(', ')}`
}

export function notesExcerpt(text, max = 600) {
  if (!text) return ''
  if (text.length <= max) return text
  return text.slice(0, max) + '…'
}
