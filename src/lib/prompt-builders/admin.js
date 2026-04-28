import { fmtField, notesExcerpt } from './index.js'

// ADMIN-001 — Holds, reschedules, internal notes.
//
// "Place a hold on these slabs", "reschedule this delivery",
// "add an internal note to this account" — all StoneProfits
// admin actions that we surface as a copy-prompt for now.
export function buildAdminPrompt(task, context = {}) {
  return `TASK: Execute the StoneProfits admin action described below.

CONTEXT:
- ${fmtField('Account', context.account?.name || task.contact)}
- ${fmtField('Project / property', task.property)}
- ${fmtField('Quote ref', task.quote_ref)}
- ${fmtField('Deadline', task.deadline)}

ACTION REQUESTED:
${notesExcerpt(task.description) || '(no description)'}

PLAYBOOK: ADMIN-001

DELIVERABLE:
1. Walk me through the exact sequence of StoneProfits clicks/fields to perform this action.
2. If this is a slab hold, list the specific slab IDs to hold and confirm the duration/expiry.
3. If this is a reschedule, list the affected line items and propose a new date.
4. If this is an internal note, draft the note text I should paste.
End with "Sanity check" — anything that might back-fire (overcommitting inventory, blocking other quotes, etc.).`
}
