// PraskForce1 — Agent Prompt Generator
// Creates ready-to-paste prompts for Claude-in-Chrome
// Each prompt includes task instructions, credential references, and specific targets

import { getConfig } from '@/lib/config'
import { DEMO_PROPERTIES } from '@/lib/supabase'

// ── Proposal Generation Prompt ───────────────────────────────────────────────
// Used by src/lib/task-proposals.js. Given a new task, its context, and a
// shortlist of similar historical resolutions, ask Claude to recommend a
// concrete action. Critical: the prompt instructs Claude to be honest
// about confidence — "I don't have enough data" is always allowed and is
// preferred over a confident wrong guess.

export function buildProposalPrompt({ task, snapshot, matches, patterns = [] }) {
  const matchBlock = matches.map((m, i) => {
    const r = m.resolution
    return `[${i + 1}] score=${m.score.toFixed(2)} | outcome=${r.resolution_outcome || 'unknown'} | channel=${r.resolution_channel || '—'}
    action: ${r.resolution_action || '(no action recorded)'}
    why:    ${r.resolution_notes || '(no rationale captured)'}
    context: price_tier=${r.price_tier || '?'}, owner=${r.owner_type || '?'}, contact=${r.contact_role || '?'}, stage=${r.deal_stage || '?'}, attempt=${r.outreach_attempt_number || '?'}`
  }).join('\n')

  const patternBlock = patterns.length > 0
    ? patterns.slice(0, 5).map(p =>
        `- ${p.task_category} / ${p.price_tier || '*'} / ${p.owner_type || '*'} / ${p.contact_role || '*'}: ` +
        `winning_channel=${p.winning_channel || '?'}, success_rate=${(p.success_rate * 100).toFixed(0)}%, n=${p.sample_size}`
      ).join('\n')
    : '(no aggregated patterns yet for this category)'

  return `You are a task resolution advisor for a luxury stone & surface sales rep in Miami. You are looking at a new task and a shortlist of similar historical resolutions. Your job is to recommend a specific next action — or to honestly say you don't have enough data.

CURRENT TASK
- Category: ${task.type}
- Description: ${task.description || '(no description)'}
- Contact: ${task.contact || '—'}
- Property: ${task.property || '—'}
- Materials: ${task.materials || '—'}
- Deadline: ${task.deadline || '—'}

CONTEXT SNAPSHOT
${JSON.stringify(snapshot, null, 2)}

SIMILAR HISTORICAL RESOLUTIONS (ranked by relevance):
${matchBlock || '(no historical resolutions matched)'}

AGGREGATED PATTERNS FOR THIS CATEGORY
${patternBlock}

INSTRUCTIONS
1. Recommend a CONCRETE action — not "follow up" but "send email to the architect referencing the permit timeline, ask if they have a stone allowance defined yet."
2. Pick the channel from this list: email, phone, whatsapp, instagram_dm, linkedin, in_person, showroom, sample_box, system_action.
3. Estimate the timeline for response based on history.
4. Set confidence between 0.0 and 1.0. If the historical evidence is thin, contradictory, or unclear, drop confidence below 0.5 and SAY SO in the reasoning. A wrong confident proposal destroys trust faster than no proposal at all.
5. Reasoning should reference the historical resolutions by index (e.g. "match [1] and [3] both won via in-person showroom visits").

Respond with ONLY a JSON object (no other text, no markdown):
{
  "proposed_action": "specific action to take",
  "proposed_channel": "channel id from the list above",
  "expected_timeline": "human description, e.g. '48 hours' or '1 week if architect responds'",
  "confidence": 0.0,
  "reasoning": "why this is the right move, referencing match indices",
  "matched_pattern_summary": "1-sentence description of the winning pattern, or null if no clear pattern"
}`
}

// ── Per-Task Chat Prompt ─────────────────────────────────────────────────────
// Used by TaskChat.js. Brad types something like "called the architect,
// he's out until the 20th, push this back" — Claude acknowledges, extracts
// the resolution data, and proposes any follow-up tasks. The structured
// output drops straight into createResolution / addTask.

export function buildTaskChatPrompt({ task, snapshot, matches, message, history }) {
  const historyBlock = history.length > 0
    ? history.map(h => `${h.role.toUpperCase()}: ${h.content}`).join('\n')
    : '(no prior turns)'

  const matchBlock = matches.slice(0, 3).map((m, i) =>
    `[${i + 1}] ${m.resolution.resolution_action || '(no action)'} → ${m.resolution.resolution_outcome || 'unknown'}`
  ).join('\n') || '(no relevant history)'

  return `You are a task resolution assistant. The user (Brad) is updating you on a task he's working. Your job: (1) acknowledge briefly, (2) extract structured resolution data if he described what happened, (3) extract any follow-up tasks he implied, (4) ask a focused clarifying question if something important is missing.

TASK
- Category: ${task.type}
- Description: ${task.description || '(none)'}
- Contact: ${task.contact || '—'}
- Property: ${task.property || '—'}

CONTEXT SNAPSHOT
${JSON.stringify(snapshot, null, 2)}

RELEVANT HISTORICAL RESOLUTIONS
${matchBlock}

CONVERSATION SO FAR
${historyBlock}

NEW MESSAGE FROM BRAD
${message}

Respond with ONLY a JSON object (no markdown, no other text):
{
  "reply": "short conversational acknowledgement to Brad — 1-2 sentences max",
  "extracted_resolution": {
    "resolution_action": "what was done, or null if nothing actionable yet",
    "resolution_channel": "channel id or null",
    "resolution_outcome": "outcome id or null",
    "resolution_notes": "WHY this was the move, or null"
  } | null,
  "followup_tasks": [
    { "type": "FOLLOW_UP|EMAIL|SCHEDULE|...", "description": "...", "deadline": "ISO date or null", "priority": "high|medium|low" }
  ],
  "needs_clarification": "question to ask, or null"
}

Channel ids: email, phone, whatsapp, instagram_dm, linkedin, in_person, showroom, sample_box, system_action.
Outcome ids: meeting_booked, quote_requested, info_gathered, no_response, declined, deferred, escalated.`
}

export function generateAgentPrompt(taskId, context = {}) {
  const config = getConfig()

  const prompts = {
    'SP-QUOTES-001': () => `You are an automation agent working for Brad Prasky at ARCA Worldwide.

TASK: Extract all quotes from StoneProfits CRM.

STEPS:
1. Navigate to the StoneProfits login page (check stored credentials for the URL)
2. Log in with username and password from stored credentials labeled "StoneProfits"
3. After login, navigate to: Presales Home > Quotes
4. Extract EVERY quote visible, for each one capture:
   - Quote Number
   - Quote Date  
   - Customer / Company Name
   - Contact Name (the person)
   - Project Name or Address if shown
   - Materials listed (product names)
   - Total quote value ($)
   - Quote status (Draft/Sent/Accepted/Expired)
5. Go through ALL pages of quotes, not just page 1
6. Output the data as a clean JSON array

After extraction, I will paste the results back into PraskForce1 to cross-reference against our property pipeline and Outlook emails.

BEGIN — navigate to StoneProfits and log in.`,

    'OL-XREF-001': () => {
      const quoteNumbers = context.quoteNumbers || ['(paste quote numbers from SP-QUOTES-001 output)']
      return `You are an automation agent working for Brad Prasky at ARCA Worldwide.

TASK: Search Outlook for emails related to these StoneProfits quotes.

QUOTE NUMBERS TO SEARCH:
${quoteNumbers.map(q => `- ${q}`).join('\n')}

STEPS:
1. Navigate to outlook.office.com
2. Log in with credentials labeled "Outlook" 
3. For each quote number above:
   a. Search the inbox and sent folder for that quote number
   b. For each matching email, record:
      - Date
      - From / To
      - Subject line
      - Key content (relevant paragraph about the quote/project)
      - Any mentioned next step or timeline
4. Also search for the customer names associated with each quote
5. Build a timeline for each quote showing all communication

Output as JSON:
[
  {
    "quote_number": "Q-XXXXX",
    "customer": "...",
    "emails": [
      {"date": "...", "direction": "sent|received", "subject": "...", "snippet": "..."}
    ],
    "first_contact": "...",
    "last_contact": "...",
    "touchpoints": N,
    "days_since_last": N
  }
]

BEGIN — navigate to Outlook and start searching.`
    },

    'SCAN-PERMITS-001': () => {
      const properties = context.properties || DEMO_PROPERTIES.slice(0, 5)
      const targets = properties.map(p => `- ${p.address} (${p.municipality})`).join('\n')
      return `You are an automation agent working for Brad Prasky at ARCA Worldwide.

TASK: Check building permits for these properties.

PROPERTIES TO CHECK:
${targets}

PORTAL CREDENTIALS (use as needed):
- Miami Beach properties → Miami Beach Civic Access (credential: "Miami Beach Civic Access")
- Coral Gables properties → EdenWeb at edenweb.coralgables.com (no login needed)  
- City of Miami properties → iBuild (credential: "City of Miami iBuild")
- Miami-Dade County → miamidade.gov/permits (no login needed)

STEPS:
1. For each property, go to the correct portal based on municipality
2. Search by the property address
3. For each permit found, extract:
   - Permit number, type, status
   - Date filed, date issued
   - Valuation
   - Scope/description
   - Contractor name
   - Architect name
4. Flag any NEW permits (not previously known)
5. Classify each as:
   - Tier 1 (HIGH stone opportunity): demolition, new construction, major remodel $500K+
   - Tier 2 (MEDIUM): interior remodel, kitchen/bath, pool/hardscape  
   - Tier 3 (LOW): windows, roofing, electrical, plumbing

Output as JSON array.

BEGIN — start with the first property.`
    },

    'SCAN-SUNBIZ-001': () => {
      const llc = context.llcName || '(LLC name to search)'
      return `You are an automation agent working for Brad Prasky at ARCA Worldwide.

TASK: Look up this LLC on Florida Sunbiz and map the entity network.

LLC TO RESEARCH: ${llc}

STEPS:
1. Navigate to https://search.sunbiz.org/Inquiry/CorporationSearch/ByName
2. Search for: ${llc}
3. Click into the filing record and extract:
   - Document Number
   - Filing Date, Status
   - Principal Address
   - Registered Agent name + address
   - ALL Manager/Member names, roles, and addresses
4. For each person found:
   a. Search Sunbiz by their name to find OTHER LLCs they manage
   b. Record every connected entity
   c. Note shared addresses across entities
5. Search online for each person:
   - LinkedIn profile URL
   - Instagram (if they're in real estate/design)
   - Company website
   - Guess likely email (firstname@company.com)
6. Output everything as structured JSON

BEGIN — navigate to Sunbiz.`
    },

    'SCAN-SALES-001': () => {
      const filters = config.filters || {}
      return `You are an automation agent working for Brad Prasky at ARCA Worldwide.

TASK: Scan PropertyReports.us for new luxury property sales.

STEPS:
1. Navigate to PropertyReports.us and log in (credential: "PropertyReports.us")
2. Search with these filters:
   - Property type: Single Family Residential
   - Minimum price: $${(filters.price_floor || 3000000).toLocaleString()}
   - Date range: Last 7 days
   - Area: ${(filters.zip_codes || ['33139','33140','33141','33143','33156','33138']).join(', ')}
3. For each sale found, extract:
   - Address
   - Sale price
   - Sale date
   - Buyer name (individual or LLC)
   - Property details (beds, baths, sqft, lot size, year built)
   - Waterfront Y/N
4. Check each address against this existing pipeline (skip if already tracked):
${DEMO_PROPERTIES.map(p => `   - ${p.address}`).join('\n')}
5. Output only NEW properties not already in the pipeline
6. For any LLC buyer, note it for Sunbiz lookup

Output as JSON array.

BEGIN — navigate to PropertyReports.us.`
    },

    'INTEL-BUILD-001': () => `You are an automation agent working for Brad Prasky at ARCA Worldwide.

TASK: Build complete pipeline intelligence by running all data extraction tasks in sequence.

This is a multi-step operation. Run these in order:

STEP 1: Extract StoneProfits quotes
- Log into StoneProfits → Presales Home → Quotes
- Extract all quotes (number, date, customer, materials, value, status)
- Output the full list

STEP 2: Cross-reference with Outlook
- Log into Outlook
- For each quote number, search inbox and sent
- Build communication timeline for each quote

STEP 3: Match against property pipeline
- Compare quote addresses and customer names against these tracked properties:
${DEMO_PROPERTIES.slice(0, 10).map(p => `  - ${p.address} (owner: ${p.owner})`).join('\n')}

STEP 4: Identify intelligence
- Hot leads: quote + recent email activity + pipeline property
- Stale leads: quote sent but no email in 14+ days
- Warm connections: known contacts appearing on new properties
- Missing opportunities: pipeline properties with no quote yet

Output a summary report with:
1. Total quotes extracted
2. Quote ↔ email matches
3. Quote ↔ pipeline property matches
4. Recommended actions (follow-ups, new outreach, quote updates)

BEGIN — start with StoneProfits login.`
  }

  const generator = prompts[taskId]
  if (!generator) return `No prompt template found for task: ${taskId}`
  return generator()
}

export const RUNNABLE_TASKS = [
  { id: 'SP-QUOTES-001', name: 'Extract StoneProfits Quotes', desc: 'Pull all quotes from CRM', time: '5-10 min', systems: ['StoneProfits'] },
  { id: 'OL-XREF-001', name: 'Outlook Email Cross-Reference', desc: 'Match quotes to email threads', time: '10-15 min', systems: ['Outlook'], requires: 'SP-QUOTES-001' },
  { id: 'SCAN-PERMITS-001', name: 'Permit Portal Scan', desc: 'Check permits on pipeline properties', time: '10-20 min', systems: ['Civic Access', 'EdenWeb', 'iBuild'] },
  { id: 'SCAN-SUNBIZ-001', name: 'Sunbiz LLC Lookup', desc: 'Resolve LLC ownership', time: '3-5 min per LLC', systems: ['Sunbiz'] },
  { id: 'SCAN-SALES-001', name: 'New Sales Scan', desc: 'Find new luxury property sales', time: '5-10 min', systems: ['PropertyReports.us'] },
  { id: 'INTEL-BUILD-001', name: 'Full Intelligence Build', desc: 'Run all extractions and cross-reference', time: '30-45 min', systems: ['StoneProfits', 'Outlook', 'All portals'] },
]
