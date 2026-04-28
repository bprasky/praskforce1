import { fmtField, notesExcerpt } from './index.js'

// FOLLOW-001 — Draft a follow-up email.
//
// Follow-up tone is a function of how long it's been, what was last
// promised, and how warm the relationship is. We don't try to wire
// this — Claude in Chrome with the right context produces a much
// better draft than a templated one.
export function buildFollowUpPrompt(task, context = {}) {
  const account = context.account || {}
  const lastTouchDays = context.lastTouchDays
  const lastTouchSummary = context.lastTouchSummary

  return `TASK: Draft a follow-up email I can send from Outlook.

CONTEXT:
- ${fmtField('Recipient', task.contact)}
- ${fmtField('Account', account.name)}
- ${fmtField('Project / property', task.property)}
- ${fmtField('Quote ref (if any)', task.quote_ref)}
- ${fmtField('Last touch', lastTouchSummary)}${lastTouchDays != null ? ` (~${lastTouchDays} days ago)` : ''}
- ${fmtField('Deadline', task.deadline)}

WHAT THE FOLLOW-UP IS ABOUT:
${notesExcerpt(task.description) || '(no description — infer from context)'}

PLAYBOOK: FOLLOW-001

TONE GUIDANCE:
- If last touch was within 5 days: short and direct, no recap.
- If 5–14 days: light recap of the open thread, then the ask.
- If >14 days: lead with a low-pressure check-in; do NOT push.

DELIVERABLE: a Subject line + email body, ready to paste into Outlook.
End with "Anything I'm missing?" — flag any fact you had to assume so I can verify before I send.`
}
