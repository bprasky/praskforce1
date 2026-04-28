import { fmtField, notesExcerpt } from './index.js'

// CRM-UPDATE — Writeback to StoneProfits.
//
// Distinct from CAPTURE (which writes structured data straight to our
// own Supabase). CRM_UPDATE is a writeback to StoneProfits and is still
// semantic — UI may have moved, fields may not match exactly.
export function buildCrmUpdatePrompt(task, context = {}) {
  const fields = task.crm_data || {}
  const fieldsLines = Object.keys(fields).length > 0
    ? Object.entries(fields).map(([k, v]) => `  - ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n')
    : '  (no structured CRM data extracted — read the description below)'

  return `TASK: Update StoneProfits with the changes below.

TARGET RECORD:
- ${fmtField('Account', context.account?.name || task.contact)}
- ${fmtField('Project / property', task.property)}
- ${fmtField('Quote ref', task.quote_ref)}

FIELDS TO UPDATE:
${fieldsLines}

CONTEXT:
${notesExcerpt(task.description) || '(no description)'}

PLAYBOOK: CRM-UPDATE-001

DELIVERABLE:
1. Walk me through the exact StoneProfits navigation to reach this record.
2. For each field, state the current value (if visible) and the new value.
3. If anything in FIELDS TO UPDATE is ambiguous (e.g. "increase margin" without a number), ask me before applying.
4. After the update, list a one-sentence audit summary I can paste into the account note log.`
}
