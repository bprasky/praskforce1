import { fmtField, notesExcerpt } from './index.js'

// RESEARCH-001 — Owner / LLC / permits research.
//
// The user runs this in Claude-in-Chrome where it has access to Sunbiz,
// the appraiser sites, and Google. We don't try to wire this because
// the queries are open-ended and the answer formats vary.
export function buildResearchPrompt(task, context = {}) {
  const property = context.property || {}
  const account = context.account || {}

  const owner = task.crm_data?.owner || property.owner || null

  return `TASK: Research the entity / property below and return a structured intel block.

SUBJECT:
- ${fmtField('Property address', property.address || task.property)}
- ${fmtField('Owner / entity (if known)', owner)}
- ${fmtField('Account context', account.name)}
- ${fmtField('Specific question', task.description)}

PLAYBOOK: RESEARCH-001

WHAT TO LOOK UP (in order):
1. Sunbiz: officers, registered agent, filing date, status. Note any other LLCs sharing the same agent or address — that's the "developer signature" we care about.
2. Property appraiser: last sale price, sale date, year built, sq ft, folio.
3. Permit portals (Miami Beach Civic Access, Coral Gables EdenWeb, Miami-Dade Property Appraiser): any open or recent permits. Note applicant + contractor names.
4. Google: any news, prior projects, social presence (architect/designer/GC mentions).

DELIVERABLE — return as Markdown with these exact headers:
  ## Entity
  ## Property
  ## Permits
  ## Web signal
  ## Confidence + gaps   ← list anything you couldn't verify

Hard rule: do NOT fabricate names, addresses, or dollar figures. If a field is unclear, write "unverified" instead of guessing.

NOTES EXCERPT:
${notesExcerpt(task.description)}`
}
