import { fmtField, notesExcerpt } from './index.js'

// SCHED-001 — Schedule / calendar coordination.
//
// Until a real calendar API is wired, this is a copy-prompt that
// produces Outlook-ready text the user can paste into a meeting invite
// or calendar block.
export function buildSchedulePrompt(task, context = {}) {
  return `TASK: Draft a calendar block / meeting invite for the schedule item below.

CONTEXT:
- ${fmtField('Subject', task.description?.split('\n')[0])}
- ${fmtField('Attendee', task.contact)}
- ${fmtField('Account', context.account?.name)}
- ${fmtField('Property / project', task.property)}
- ${fmtField('Requested deadline', task.deadline)}

DETAILS:
${notesExcerpt(task.description) || '(no details)'}

PLAYBOOK: SCHED-001

DELIVERABLE:
1. Suggested meeting title, duration, location/link, and 2-3 candidate time slots.
2. Invite body text (3-4 sentences) covering the agenda and what the attendee should bring/prep.
3. If this is a delivery or fab slot (not a meeting), produce the schedule note instead — date, address, point of contact, materials/items.

Flag anything that requires me to confirm with the warehouse, fabricator, or installer before sending.`
}
