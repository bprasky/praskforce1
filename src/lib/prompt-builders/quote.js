import { fmtField, fmtList, notesExcerpt } from './index.js'

// QUOTE-001 — Build a StoneProfits quote line-item draft.
//
// StoneProfits' quote builder is semantic (slab IDs, qty rounding,
// project terms) so we hand the user a fully populated prompt. They
// paste it into Claude Code, get back a structured draft, then enter
// it into StoneProfits themselves.
export function buildQuotePrompt(task, context = {}) {
  const account = context.account || {}
  const property = context.property || {}
  const designer = context.designer || {}

  const materials = task.materials
    ? task.materials.split(/,\s*/).filter(Boolean)
    : []
  const priorQuotes = (context.priorQuotes || []).map(q => q.quote_number || q.id)

  return `TASK: Build a StoneProfits quote draft for ${account.name || task.contact || 'the client below'}${property.address || task.property ? ` — ${property.address || task.property}` : ''}.

CONTEXT:
- ${fmtField('Client', account.name || task.contact)}
- ${fmtField('Project address', property.address || task.property)}
- ${fmtField('Designer / referrer', designer.name)}
- ${fmtList('Materials requested', materials)}
- ${fmtField('Quantities / scope', task.crm_data?.quantities || task.description)}
- ${fmtField('Quote ref to update (if any)', task.quote_ref)}
- ${fmtField('Estimated value', task.value != null ? `$${Number(task.value).toLocaleString()}` : null)}
- ${fmtList('Prior quotes for this account', priorQuotes)}

NOTES EXCERPT:
${notesExcerpt(task.description) || '(no additional notes)'}

PLAYBOOK: QUOTE-001

DELIVERABLE:
1. Line-item draft I can paste into StoneProfits — material code, slab count, sq ft, unit price, line total.
2. Flag any missing fields (margin, lead time, terms, freight) so I can fill them before sending.
3. If the materials list contains anything ambiguous (e.g. "white marble" without a specific quarry), list the candidate slabs we already carry and ask me to pick.

Output format: a numbered line-item table, followed by a "Missing / ambiguous" bullet list.`
}
