// PraskForce1 — Agent Prompt Generator
// Creates ready-to-paste prompts for Claude-in-Chrome
// Each prompt includes task instructions, credential references, and specific targets

import { getConfig } from '@/lib/config'
import { DEMO_PROPERTIES } from '@/lib/supabase'

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

BEGIN — start with StoneProfits login.`,

    'IG-DAILY-001': () => {
      // context.watchlist is an array of rows from a kind=instagram_watchlist
      // upload. Each row has a handle and optional notes. We inline it here
      // (small — hundreds of handles max) rather than making the browser
      // agent query Supabase.
      const watchlist = context.watchlist || []
      if (watchlist.length === 0) {
        return `No Instagram watchlist found. Upload a CSV with kind "Instagram Watchlist" in Configuration → Data Upload first. The CSV should have at minimum a "handle" column — optionally also "client_name" and "notes".`
      }

      const handleKey = Object.keys(watchlist[0]).find(k => k.toLowerCase().includes('handle')) || Object.keys(watchlist[0])[0]
      const noteKey = Object.keys(watchlist[0]).find(k => k.toLowerCase().includes('note')) || null
      const clientKey = Object.keys(watchlist[0]).find(k => k.toLowerCase().includes('client') || k.toLowerCase().includes('name')) || null

      const lastRun = context.lastRun || '(first run — report everything from the last 48 hours)'

      return `You are an automation agent working for Brad Prasky at ARCA Worldwide.

TASK: Daily Instagram rundown — scroll each handle below and capture new activity.

LAST RUN: ${lastRun}

Brad does not want to spend an hour scrolling Instagram every morning. Your job is to be his eyes. Visit each handle in the watchlist, scan recent posts, and return structured data about what's new. He will then cross-reference against his client list automatically.

WATCHLIST (${watchlist.length} handles):
${watchlist.map(row => {
  const h = row[handleKey]
  const c = clientKey ? row[clientKey] : null
  const n = noteKey ? row[noteKey] : null
  const bits = [h]
  if (c) bits.push(`— ${c}`)
  if (n) bits.push(`(${n})`)
  return `  - ${bits.join(' ')}`
}).join('\n')}

STEPS:
1. Open instagram.com. If not already logged in, use credentials labeled "Instagram" from 1Password.
2. For EACH handle in the watchlist above:
   a. Navigate to instagram.com/<handle>
   b. Look at the most recent posts (visible in the grid without clicking into any single post if possible)
   c. Identify any posts that appear to be from the last ${context.lookbackDays || 7} days
   d. For each recent post, capture:
      - handle (the account, not the tagged accounts)
      - post_url (the permalink — right-click → copy link OR read from URL after clicking)
      - post_date (ISO format if possible, otherwise "Xd ago")
      - caption (first 500 characters is fine — Brad will read the rest if it matches)
      - image_url (the main image URL if you can grab it, else leave null)
   e. Move to the next handle. DO NOT follow or interact with anything.
3. If a handle has NOTHING new since the last run, skip it entirely — don't emit a row.

OUTPUT:
Return a single JSON array. No prose, no markdown fencing. Just the array. Example shape:

[
  {
    "handle": "@studiogalliani",
    "post_url": "https://instagram.com/p/ABC123",
    "post_date": "2026-04-12",
    "caption": "Installation day at our Pine Tree project — Calacatta Gold the whole way through…",
    "image_url": "https://scontent.cdninstagram.com/..."
  }
]

After you output the JSON, Brad will paste it back into PraskForce1 and it will be automatically cross-referenced against his client list. Anything that matches a known client becomes a lead to follow up on.

IMPORTANT:
- Do not like, comment on, or save any posts.
- Do not follow new accounts.
- If you get rate-limited or hit a login wall, stop and report which handles you covered vs. didn't in a final JSON object: {"completed": ["..."], "blocked_on": "..."}.
- Keep the output concise. Captions over 500 chars should be truncated with "…".

BEGIN — navigate to instagram.com.`
    },

    'SCAN-ALL-PORTALS-001': () => {
      // context.portals is an array of enabled portals from config.portals
      // context.filters is the scan filters from config.filters
      // context.targetAddresses is an optional array of property addresses
      //   to focus the scan on (defaults to the current pipeline list)
      const portals = context.portals || []
      const filters = context.filters || {}
      const targets = context.targetAddresses || []

      if (portals.length === 0) {
        return `No portals enabled. Enable portals in Configuration → Portals first.`
      }

      const priceFloor = filters.price_floor ? `$${(filters.price_floor / 1_000_000).toFixed(1)}M` : 'none'
      const priceCeiling = filters.price_ceiling ? `$${(filters.price_ceiling / 1_000_000).toFixed(1)}M` : 'none'
      const zips = (filters.zip_codes || []).join(', ') || '(any)'
      const neighborhoods = (filters.neighborhoods || []).join(', ') || '(any)'
      const lookbackDays = filters.days_lookback || 90

      const ROLE_HINTS = {
        discovery: 'Use this portal to find NEW recently-closed sales or listed properties above the price floor. This is a DISCOVERY source — the goal is to emerge with a list of addresses you did not have before.',
        enrichment: 'Use this portal to look up permits for addresses from the priority list below. This is an ENRICHMENT source — do NOT try to do broad date-range scans. If there are no priority addresses, skip with status=skipped.',
        property_research: 'Use this portal to look up ownership, sales history, and folio data for addresses from the priority list. Skip if no priority addresses. This is PROPERTY RESEARCH — not a permit discovery tool.',
        entity_research: 'Use this portal to look up LLCs or officers mentioned in the priority addresses. Skip if no priority entities. This is ENTITY RESEARCH — not a permit discovery tool.',
      }

      const portalList = portals.map(p => {
        const auth = p.login_required
          ? (p.credential_key
              ? `REQUIRES LOGIN — use 1Password item "${p.credential_key}"`
              : `REQUIRES LOGIN — NO CREDENTIAL CONFIGURED — MARK AS FAILED with error "Missing credential key"`)
          : 'public (no login)'
        const role = p.role || 'enrichment'
        const roleHint = ROLE_HINTS[role] || ''
        return `  - id: ${p.id}
    name: ${p.name}
    role: ${role.toUpperCase()}
    url: ${p.url}
    municipality: ${p.municipality || '(n/a)'}
    auth: ${auth}
    hint: ${roleHint}`
      }).join('\n')

      return `You are an automation agent working for Brad Prasky at ARCA Worldwide.

TASK: Pull high-value real-estate intelligence for Brad's pipeline. Portals come in several flavors — read the "role" field for each one and treat them differently:

  - DISCOVERY portals: search for recently-sold or newly-listed properties matching the filters below. These are the primary source of NEW addresses. Return each qualifying property as an entry in the "permits" array with permit_type="Recent Sale" and the sale price in the "valuation" field.
  - ENRICHMENT portals: permit lookup tools. Only run them against the priority addresses list. If no priority addresses are provided, SKIP these with status=skipped and explain that enrichment has nothing to enrich.
  - PROPERTY_RESEARCH portals: ownership/folio lookups. Same rule — only against priority addresses.
  - ENTITY_RESEARCH portals: LLC and officer lookups. Only against entities mentioned in the priority addresses. Otherwise skip.

Return a strict, structured report. THIS IS IMPORTANT: you must report a status for EVERY portal below, even if it fails or is skipped. Silent failures are not acceptable.

═══════════════════════════════════════════════════════════════════
SCAN FILTERS (only surface permits matching these criteria)
═══════════════════════════════════════════════════════════════════
- Price floor: ${priceFloor}
- Price ceiling: ${priceCeiling}
- Target zip codes: ${zips}
- Target neighborhoods: ${neighborhoods}
- Lookback window: last ${lookbackDays} days
- Property types: ${(filters.property_types || []).join(', ') || 'any'}

═══════════════════════════════════════════════════════════════════
PORTALS TO SCAN (${portals.length})
═══════════════════════════════════════════════════════════════════
${portalList}

${targets.length > 0 ? `═══════════════════════════════════════════════════════════════════
PRIORITY ADDRESSES (check these first on each portal)
═══════════════════════════════════════════════════════════════════
${targets.map(a => `  - ${a}`).join('\n')}

` : ''}═══════════════════════════════════════════════════════════════════
PROCEDURE — FOR EACH PORTAL ABOVE
═══════════════════════════════════════════════════════════════════
1. Open the portal URL in a new tab.
2. If it requires login, pull credentials from 1Password using the exact item name specified. If login fails after 2 attempts, STOP on that portal and mark it failed — do not get stuck.
3. Search for permits issued/filed in the last ${lookbackDays} days matching the filters above.
4. For each matching permit, capture:
   - portal_id (match the id from the list above)
   - permit_number
   - address
   - permit_type
   - permit_status (applied / issued / in_review / finaled / etc.)
   - date_filed
   - date_issued (if applicable)
   - valuation
   - scope_description
   - contractor_name
   - applicant_name
   - raw_link (URL to the permit detail page if available)
5. Move to the next portal. Do not spend more than ~5 minutes per portal — if it's slow or unresponsive, report it as "partial" or "failed" and move on.

═══════════════════════════════════════════════════════════════════
OUTPUT FORMAT (strict — paste back into PraskForce1)
═══════════════════════════════════════════════════════════════════
Return a single JSON object, no markdown fences, no prose before or after. Shape:

{
  "portal_results": [
    {
      "portal_id": "mb_civic",
      "portal_name": "Miami Beach Civic Access",
      "status": "success",
      "permits_found": 14,
      "new_permits": 3,
      "error": null,
      "summary": "Searched 14 matching permits, 3 new since last scan"
    },
    {
      "portal_id": "miami_ibuild",
      "portal_name": "City of Miami iBuild",
      "status": "failed",
      "permits_found": 0,
      "new_permits": 0,
      "error": "Login timed out after 2 attempts — MFA prompt blocked",
      "summary": null
    }
    // ... one entry for EVERY portal in the list above, no exceptions
  ],
  "permits": [
    {
      "portal_id": "mb_civic",
      "permit_number": "BR2501234",
      "address": "5681 Pine Tree Dr",
      "permit_type": "Alterations",
      "permit_status": "Applied",
      "date_filed": "2026-04-05",
      "date_issued": null,
      "valuation": 1350000,
      "scope_description": "Interior remodel, full gut",
      "contractor_name": "GOLDEN HAMMER CONSTRUCTION",
      "applicant_name": "Jared Galbut",
      "raw_link": "https://eservices.miamibeachfl.gov/permits/BR2501234"
    }
    // ... etc
  ]
}

CRITICAL RULES:
- Every portal in the list above MUST appear in portal_results. If you couldn't scan it, set status to "failed" or "skipped" and put the reason in the "error" field. Empty reports are unacceptable.
- status must be one of: "success" | "partial" | "failed" | "skipped"
- If a portal has structural issues (site redesign, new login flow), mark it "partial" or "failed" with a specific error message — do not guess at data.
- Do not invent permits. If a portal returns no results matching the filters, report permits_found: 0 and status: "success".

BEGIN — start with the first portal in the list.`
    }
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
