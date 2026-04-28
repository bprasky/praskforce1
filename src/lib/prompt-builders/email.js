import { fmtField, notesExcerpt } from './index.js'

// EMAIL-001 — Generic email drafting.
//
// Distinct from FOLLOW_UP in that it's not necessarily a continuation —
// could be a thank-you, an intro, a meeting recap, or a request for info.
export function buildEmailPrompt(task, context = {}) {
  const account = context.account || {}

  return `TASK: Draft an email I can send from Outlook.

CONTEXT:
- ${fmtField('Recipient', task.contact)}
- ${fmtField('Account', account.name)}
- ${fmtField('Project / property', task.property)}
- ${fmtField('Deadline', task.deadline)}

WHAT THE EMAIL IS ABOUT:
${notesExcerpt(task.description) || '(no description)'}

PLAYBOOK: EMAIL-001

DELIVERABLE: a Subject line + email body, ready to paste into Outlook.
Keep it under 120 words unless the content genuinely needs more.
If anything is missing (specific dates, files I should attach, who else to CC), list those at the bottom under "Need from Brad" — I'll fill them in before sending.`
}
