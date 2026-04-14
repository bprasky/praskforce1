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
