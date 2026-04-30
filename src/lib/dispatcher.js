// PraskForce1 — Task Dispatcher
// Maps task categories to execution modes and generates per-task prompts.
//
// Modes:
//   wired        — Puppeteer recipe exists; "Run" button launches automation
//   copy_prompt  — Prompt is generated and copied to clipboard for Claude-in-Chrome
//   manual       — Physical/offline task; no automation, just a checklist item
//
// If a category is missing from the table, getDispatch returns { mode: 'propose' }
// and logs a warning so we know which category is unmapped.

export const DISPATCH_TABLE = {
  QUOTE:      { mode: 'copy_prompt', playbook: 'QUOTE-001' },
  FOLLOW_UP:  { mode: 'copy_prompt', playbook: 'FOLLOW-001' },
  EMAIL:      { mode: 'copy_prompt', playbook: 'EMAIL-001' },
  RESEARCH:   { mode: 'copy_prompt', playbook: 'RESEARCH-001' },
  ADMIN:      { mode: 'copy_prompt', playbook: 'ADMIN-001' },
  SCHEDULE:   { mode: 'copy_prompt', playbook: 'SCHED-001' },
  CAPTURE:    { mode: 'manual' },
  CRM_UPDATE: { mode: 'copy_prompt', playbook: 'CRM-UPDATE-001' },
}

export function getDispatch(category) {
  const entry = DISPATCH_TABLE[category]
  if (!entry) {
    console.warn(`[dispatcher] Unmapped category: "${category}" — no dispatch mode defined. Add it to DISPATCH_TABLE in src/lib/dispatcher.js.`)
    return { mode: 'propose' }
  }
  return entry
}

// ── Task-Level Prompt Generator ──
// Creates a fully populated prompt for a task's playbook using the task's context
// (contact, property, materials, description, crm_data).

const PLAYBOOK_PROMPTS = {
  'QUOTE-001': (t) => `You are a sales operations assistant for Brad Prasky at ARCA Worldwide, a luxury natural stone importer.

TASK: Create a quote in StoneProfits CRM.

CONTEXT:
${field('Account / Customer', t.contact)}
${field('Property / Project', t.property)}
${field('Materials', t.materials)}
${field('Notes', t.description)}
${crmBlock(t.crm_data)}

STEPS:
1. Log into StoneProfits (credential: "StoneProfits")
2. Navigate to Presales Home > New Quote
3. Fill in:
   - Customer: ${t.contact || '(fill in)'}
   - Project: ${t.property || '(fill in)'}
   - Add line items for each material listed above
   - Apply standard pricing from the price list
4. Save as Draft
5. Screenshot the completed quote and return the quote number

OUTPUT: Quote number, line items with pricing, total value.`,

  'FOLLOW-001': (t) => `You are a sales operations assistant for Brad Prasky at ARCA Worldwide.

TASK: Follow up on a previous conversation or quote.

CONTEXT:
${field('Contact', t.contact)}
${field('Property / Project', t.property)}
${field('Materials', t.materials)}
${field('What to follow up on', t.description)}
${crmBlock(t.crm_data)}

STEPS:
1. Open Outlook (credential: "Outlook")
2. Search for recent emails with ${t.contact || 'the contact'}
3. Review the thread to understand last touchpoint
4. Draft a follow-up email that:
   - References the previous conversation
   - Provides any updates on materials/availability
   - Proposes a clear next step
5. Show me the draft before sending

OUTPUT: Draft email text, summary of email history.`,

  'EMAIL-001': (t) => `You are a sales operations assistant for Brad Prasky at ARCA Worldwide.

TASK: Compose and send an email.

CONTEXT:
${field('Recipient', t.contact)}
${field('Property / Project', t.property)}
${field('Materials', t.materials)}
${field('Email purpose', t.description)}
${crmBlock(t.crm_data)}

STEPS:
1. Open Outlook (credential: "Outlook")
2. Compose a new email to ${t.contact || '(recipient)'}
3. Subject line should reference ${t.property || 'the project'} and be professional
4. Body should be warm, professional, and include:
   - Purpose of the email
   - Any material details or specs mentioned
   - A clear call to action
5. Show me the draft before sending

OUTPUT: Draft email for review.`,

  'RESEARCH-001': (t) => `You are a research assistant for Brad Prasky at ARCA Worldwide, a luxury natural stone importer.

TASK: Research materials and project details for a client.

CONTEXT:
${field('Account / Client', t.contact)}
${field('Property / Project', t.property)}
${field('Materials of Interest', t.materials)}
${field('Research Brief', t.description)}
${crmBlock(t.crm_data)}

STEPS:
1. Search arcaww.com product catalog for: ${t.materials || '(specified materials)'}
   - Check available colors, finishes, slab sizes, pricing tiers
2. Log into StoneProfits (credential: "StoneProfits")
   - Check current inventory for these materials
   - Look up any previous quotes for ${t.contact || 'this client'}
3. If exact materials aren't available:
   - Identify 2-3 comparable alternatives
   - Note price differences and visual similarities
4. Search for project reference photos showing similar materials in comparable settings
5. Check if ${t.contact || 'the client'} has any open quotes or recent email correspondence

OUTPUT:
- Material availability summary (in stock / lead time / special order)
- Pricing range per sqft
- Alternative options with pros/cons
- Any existing relationship history (past quotes, emails)
- Recommended next steps`,

  'ADMIN-001': (t) => `You are a sales operations assistant for Brad Prasky at ARCA Worldwide.

TASK: Administrative action in StoneProfits.

CONTEXT:
${field('Contact / Account', t.contact)}
${field('Property / Project', t.property)}
${field('Materials', t.materials)}
${field('Action Required', t.description)}
${crmBlock(t.crm_data)}

STEPS:
1. Log into StoneProfits (credential: "StoneProfits")
2. Perform the requested action:
   ${t.description || '(see task description)'}
3. Confirm the action was completed
4. Screenshot the result

OUTPUT: Confirmation of completed action with screenshots.`,

  'SCHED-001': (t) => `You are a sales operations assistant for Brad Prasky at ARCA Worldwide.

TASK: Schedule a meeting or event.

CONTEXT:
${field('With', t.contact)}
${field('Location / Property', t.property)}
${field('Purpose', t.description)}
${field('Deadline', t.deadline)}
${crmBlock(t.crm_data)}

STEPS:
1. Open Outlook Calendar (credential: "Outlook")
2. Check Brad's availability for the requested timeframe
3. Create a calendar event:
   - Title: Meeting with ${t.contact || '(contact)'} — ${t.property || t.description || '(purpose)'}
   - Location: ${t.property || '(TBD)'}
   - Duration: 30 minutes (adjust if specified)
4. Draft a meeting invitation email to ${t.contact || 'the contact'}
5. Show the draft before sending

OUTPUT: Proposed time slots, draft invitation.`,

  'CRM-UPDATE-001': (t) => `You are a sales operations assistant for Brad Prasky at ARCA Worldwide.

TASK: Update records in StoneProfits CRM.

CONTEXT:
${field('Contact / Account', t.contact)}
${field('Property / Project', t.property)}
${field('What to update', t.description)}
${crmBlock(t.crm_data)}

STEPS:
1. Log into StoneProfits (credential: "StoneProfits")
2. Search for ${t.contact || t.property || 'the relevant record'}
3. Update the following fields:
${t.crm_data ? formatCrmUpdates(t.crm_data) : '   (see task description)'}
4. Save and confirm changes
5. Screenshot the updated record

OUTPUT: Confirmation with before/after screenshots.`,
}

function field(label, value) {
  return value ? `${label}: ${value}` : ''
}

function crmBlock(data) {
  if (!data) return ''
  const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  return `CRM Data: ${str}`
}

function formatCrmUpdates(data) {
  if (typeof data === 'string') return `   ${data}`
  if (typeof data === 'object') {
    return Object.entries(data)
      .map(([k, v]) => `   - ${k}: ${v}`)
      .join('\n')
  }
  return `   ${String(data)}`
}

export function generateTaskPrompt(task) {
  const dispatch = getDispatch(task.type)
  if (dispatch.mode !== 'copy_prompt') return null

  const generator = PLAYBOOK_PROMPTS[dispatch.playbook]
  if (!generator) {
    console.warn(`[dispatcher] No prompt template for playbook: ${dispatch.playbook}`)
    return null
  }

  return generator(task).split('\n').filter(l => l.trim() !== '').join('\n')
}
