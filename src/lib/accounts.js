// PraskForce1 — Entity Resolution
// Maps the web of connections between people, LLCs, properties, and shared addresses

// Demo accounts built from our research
export const DEMO_ACCOUNTS = [
  {
    id: 'acct_galbut',
    name: 'Jared Galbut',
    type: 'developer',
    tier: 'full_offering',
    entities: [
      { name: '5681 INVESTMENTS LLC', doc: 'L25000405237', role: 'Manager', property: '5681 Pine Tree Dr', price: 8250000 },
    ],
    connections: [
      { name: 'Russell Galbut', relationship: 'Uncle', entity: 'Crescent Heights / GFO Investments' },
      { name: 'Keith Menin', relationship: 'Business Partner', entity: 'Menin Hospitality' },
      { name: 'Marisa Galbut', relationship: 'Cousin', entity: 'Sixth Street Miami Partners / GFO' },
    ],
    known_projects: [
      'Menin Hospitality portfolio (Bodega Taqueria, Gale Hotels)',
      '5681 Pine Tree Dr — $1.35M remodel (active)',
      'Coconut Grove — 3419 Main Hwy acquisition',
      'Gale Hotel & Residences — 688-unit tower, downtown Miami',
    ],
    research: {
      linkedin: 'https://www.linkedin.com/in/jaredgalbut/',
      instagram: null,
      likely_email: 'jared@meninhospitality.com',
      phone: null,
    },
    notes: 'Co-founder/CEO Menin Hospitality. Nephew of Russell Galbut (Crescent Heights — 35,000+ units nationwide). The Galbut family is Miami Beach real estate royalty. Getting into this account opens the entire Menin/GFO pipeline. Matthew Greer team appears to be running the Pine Tree project day-to-day.',
    total_known_value: 8250000,
    property_count: 1,
    outreach_count: 1,
    last_outreach: '2026-04-13',
  },
  {
    id: 'acct_solomon',
    name: 'David Hunt Solomon',
    type: 'agent_developer',
    tier: 'entry_stone',
    entities: [
      { name: 'STELLAR PLUTO LLC', doc: 'L25000379084', role: 'Manager', property: '2880 Fairgreen Dr', price: 3400000 },
    ],
    connections: [],
    known_projects: [
      '2880 Fairgreen Dr — teardown/new build (active construction)',
      '415 E Rivo Alto Dr — Venetian Islands development (2023)',
      'Star Island — $49.5M record sale',
      'North Bay Road — $35.4M mansion sale',
    ],
    research: {
      linkedin: 'https://www.linkedin.com/in/davidhuntsolomon/',
      instagram: 'https://www.instagram.com/davidhuntsolomon/',
      likely_email: 'david.solomon@coldwellbanker.com',
      phone: null,
    },
    notes: 'Repeat luxury buy/build/flip. Just moved to Coldwell Banker from BHHS EWM (March 2026). $500M career sales. Active builder — will need stone for every project. High-frequency relationship opportunity.',
    total_known_value: 3400000,
    property_count: 1,
    outreach_count: 0,
    last_outreach: null,
  },
  {
    id: 'acct_harbour',
    name: 'Edmond Harbour',
    type: 'investor',
    tier: 'full_offering',
    entities: [
      { name: 'ABODE18 LLC', doc: 'L24000160357', role: 'Registered Agent', property: '1821 W 27th St', price: 34000000 },
      { name: 'ADOBE21 LLC', doc: null, role: 'Principal', property: '2121 Lake Ave', price: 14100000 },
    ],
    connections: [
      { name: 'Matthew Mackay', relationship: 'Director (Barbados)', entity: 'ABODE18 LLC' },
      { name: 'Sean Lucas', relationship: 'Director', entity: 'The Maybridge Group' },
      { name: 'Julian Johnston', relationship: 'Buyer Agent', entity: 'Corcoran Group' },
    ],
    known_projects: [
      '1821 W 27th St — $34M (Sunset Island II compound lot 1)',
      '1835 W 27th St — $26.5M (Sunset Island II compound lot 2)',
      '2121 Lake Ave — $14.1M (Sunset Islands)',
      'Total Sunset Islands investment: $74.6M',
    ],
    research: {
      linkedin: null,
      instagram: null,
      likely_email: null,
      phone: null,
    },
    notes: 'Private investor building mega-compound on Sunset Island II. $74.6M invested across 3 properties. Offshore structure (Barbados directors, Maybridge Group family office at 777 Brickell). Very private — Julian Johnston (Corcoran) is the only known gateway. This will be a $100M+ total project.',
    total_known_value: 74600000,
    property_count: 3,
    outreach_count: 0,
    last_outreach: null,
  },
  {
    id: 'acct_balci',
    name: 'Emre Balci',
    type: 'investor',
    tier: 'full_offering',
    entities: [
      { name: '7305 BM ISLAND LLC', doc: 'M25000016913', role: 'Member (via Davy Barthes)', property: '7305 Belle Meade Island Dr', price: 10560000 },
    ],
    connections: [
      { name: 'Davy Barthes', relationship: 'LLC Member / Likely Associate', entity: '7305 BM ISLAND LLC' },
    ],
    known_projects: [
      '7305 Belle Meade Island Dr — $10.56M (Dec 2025)',
      '6330 Allison Rd — $13.3M (Allison Island, Dec 2022)',
      'Opportunity zone developments (per LinkedIn)',
    ],
    research: {
      linkedin: 'https://www.linkedin.com/in/emre-balci-7273b3147/',
      instagram: null,
      likely_email: 'ebalci@roscommonanalytics.com',
      phone: null,
    },
    notes: 'Portfolio manager at Roscommon Analytics (energy commodity trading, Houston). Cornell-educated. Serial Miami luxury buyer ($24M+ across 2 properties). Delaware LLC + professional RA = max privacy. Finance money, not a developer — will hire top-tier architect/GC.',
    total_known_value: 23860000,
    property_count: 2,
    outreach_count: 0,
    last_outreach: null,
  },
  {
    id: 'acct_pesce',
    name: 'Matias Pesce & Ana La Placa',
    type: 'investor',
    tier: 'entry_stone',
    entities: [
      { name: 'B&B 104 PALOMA LLC', doc: 'L26000005876', role: 'Managers', property: '104 Paloma Dr', price: 9000000 },
      { name: 'Matias Sebastian Pesce Trust', doc: null, role: 'Member', property: null, price: null },
      { name: 'Ana Laura La Placa Trust', doc: null, role: 'Member', property: null, price: null },
    ],
    connections: [
      { name: 'Ashley Cusack', relationship: 'Listing Agent', entity: null },
    ],
    known_projects: [
      '104 Paloma Dr — $9M (Cocoplum, Feb 2026)',
    ],
    research: {
      linkedin: null,
      instagram: null,
      likely_email: null,
      phone: null,
    },
    notes: 'Argentine investors using trust structures. Registered at 1770 W Flagler St Ste 5 (modest office). Sophisticated tax/estate planning. Contact through listing agent Ashley Cusack.',
    total_known_value: 9000000,
    property_count: 1,
    outreach_count: 0,
    last_outreach: null,
  },
  {
    id: 'acct_lage',
    name: 'Gustavo D. Lage',
    type: 'investor',
    tier: 'entry_stone',
    entities: [
      { name: '9940 AND 1241 HOLDINGS LLC', doc: 'L25000549539', role: 'Manager', property: '9940 W Suburban Dr', price: 6170000 },
    ],
    connections: [
      { name: 'Beatriz C. Valdes-Lage', relationship: 'Co-member (spouse)', entity: '9940 AND 1241 HOLDINGS LLC' },
    ],
    known_projects: [
      '9940 W Suburban Dr — $6.17M',
      'Likely second property at "1241" address (per LLC name)',
    ],
    research: {
      linkedin: null,
      instagram: null,
      likely_email: null,
      phone: null,
    },
    notes: 'LLC name (9940 AND 1241) confirms multi-property holder. Registered at 201 Alhambra Circle (professional office building in Coral Gables). Lage is both RA and manager — likely an attorney acting for the real buyers. Need deeper research on who is behind this.',
    total_known_value: 6170000,
    property_count: 1,
    outreach_count: 0,
    last_outreach: null,
  },
]

// Find connections between accounts by shared addresses, registered agents, etc.
export function findCrossConnections(accounts) {
  const connections = []
  const raMap = {} // registered agent -> [accounts]
  const addrMap = {} // principal address -> [accounts]

  accounts.forEach(acct => {
    acct.entities.forEach(ent => {
      // This would be populated from Sunbiz data in live mode
    })
  })

  return connections
}

// ═══════════════════════════════════════════════════════════════════
// REAL FIRMS / CONTACTS — seeded from kind=clients uploads
// ═══════════════════════════════════════════════════════════════════
//
// The DEMO_ACCOUNTS data above is a handcrafted entity-resolution
// sandbox. The functions below are the actual CRUD layer used when
// the user uploads a real client list CSV. Supabase-first with
// localStorage fallback, matching the other libs.

import { getSupabase } from '@/lib/supabase'

const FIRMS_LS_KEY = 'pf1_firms'
const FIRM_CONTACTS_LS_KEY = 'pf1_firm_contacts'

// ── localStorage fallbacks ───────────────────────────────────────────

function lsGetFirms() {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(FIRMS_LS_KEY) || '[]') } catch { return [] }
}
function lsSetFirms(list) { localStorage.setItem(FIRMS_LS_KEY, JSON.stringify(list)) }

function lsGetContacts() {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(FIRM_CONTACTS_LS_KEY) || '[]') } catch { return [] }
}
function lsSetContacts(list) { localStorage.setItem(FIRM_CONTACTS_LS_KEY, JSON.stringify(list)) }

// ── Public CRUD ──────────────────────────────────────────────────────

export async function listFirms() {
  const sb = getSupabase()
  if (sb) {
    try {
      const { data, error } = await sb.from('firms').select('*').order('name')
      if (error) throw error
      return data || []
    } catch (e) {
      console.warn('Supabase listFirms failed, falling back to localStorage', e)
    }
  }
  return lsGetFirms().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

export async function listFirmContacts(firmId) {
  const sb = getSupabase()
  if (sb) {
    try {
      let q = sb.from('firm_contacts').select('*')
      if (firmId) q = q.eq('firm_id', firmId)
      const { data, error } = await q.order('is_primary', { ascending: false }).order('name')
      if (error) throw error
      return data || []
    } catch (e) {
      console.warn('Supabase listFirmContacts failed, falling back to localStorage', e)
    }
  }
  const all = lsGetContacts()
  return firmId ? all.filter(c => c.firm_id === firmId) : all
}

export async function createFirms(firms) {
  if (!firms?.length) return []
  const stamped = firms.map(f => ({
    id: f.id || slugify(f.name),
    name: f.name,
    type: f.type || null,
    city: f.city || null,
    state: f.state || null,
    website: f.website || null,
    instagram: f.instagram || null,
    notes: f.notes || null,
    source: f.source || 'manual',
    source_upload_id: f.source_upload_id || null,
    tags: f.tags || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))

  const sb = getSupabase()
  if (sb) {
    try {
      // Upsert so re-uploading doesn't fail on duplicates
      const { data, error } = await sb.from('firms').upsert(stamped, { onConflict: 'id' }).select()
      if (error) throw error
      return data || []
    } catch (e) {
      console.warn('Supabase createFirms failed, falling back to localStorage', e)
    }
  }

  // Merge-by-id for localStorage
  const existing = lsGetFirms()
  const byId = {}
  for (const f of existing) byId[f.id] = f
  for (const f of stamped) byId[f.id] = { ...byId[f.id], ...f }
  const merged = Object.values(byId).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  lsSetFirms(merged)
  return stamped
}

export async function createFirmContacts(contacts) {
  if (!contacts?.length) return []
  const stamped = contacts.map(c => ({
    id: c.id || `ctc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    firm_id: c.firm_id,
    name: c.name,
    title: c.title || null,
    email: c.email || null,
    phone: c.phone || null,
    instagram: c.instagram || null,
    linkedin: c.linkedin || null,
    notes: c.notes || null,
    is_primary: !!c.is_primary,
    source: c.source || 'manual',
    source_upload_id: c.source_upload_id || null,
    created_at: new Date().toISOString(),
  }))

  const sb = getSupabase()
  if (sb) {
    try {
      const { data, error } = await sb.from('firm_contacts').upsert(stamped, { onConflict: 'id' }).select()
      if (error) throw error
      return data || []
    } catch (e) {
      console.warn('Supabase createFirmContacts failed, falling back to localStorage', e)
    }
  }

  const existing = lsGetContacts()
  const byId = {}
  for (const c of existing) byId[c.id] = c
  for (const c of stamped) byId[c.id] = { ...byId[c.id], ...c }
  lsSetContacts(Object.values(byId))
  return stamped
}

export async function deleteFirm(id) {
  const sb = getSupabase()
  if (sb) {
    try {
      await sb.from('firm_contacts').delete().eq('firm_id', id)
      await sb.from('firms').delete().eq('id', id)
      return true
    } catch (e) {
      console.warn('Supabase deleteFirm failed, falling back to localStorage', e)
    }
  }
  lsSetFirms(lsGetFirms().filter(f => f.id !== id))
  lsSetContacts(lsGetContacts().filter(c => c.firm_id !== id))
  return true
}

// ── Utilities ────────────────────────────────────────────────────────

function slugify(name) {
  if (!name) return `firm_${Date.now()}`
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `firm_${Date.now()}`
}

// Case-insensitive best-guess column picker used by seeding code.
function findColumn(headers, ...candidates) {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const c of candidates) {
    const match = headers.find(h => norm(h) === norm(c))
    if (match) return match
  }
  for (const c of candidates) {
    const match = headers.find(h => norm(h).includes(norm(c)))
    if (match) return match
  }
  return null
}

// ── Seeding from uploads ─────────────────────────────────────────────

/**
 * Turn a kind=clients upload into firms + contacts.
 *
 * Strategy: detect a company/firm column. If present, group rows by
 * company → each unique company becomes a firm, each row becomes a
 * contact under that firm. If absent, each row becomes a single-contact
 * firm named after the person.
 *
 * Idempotent — uses the firm name slug as the id so re-uploading the
 * same list (or a delta) updates in place rather than duplicating.
 *
 * @param {Array} rows - the parsed CSV rows as objects
 * @param {Object} upload - the upload record (for source_upload_id)
 * @returns {{ firms: number, contacts: number }}
 */
export async function seedFirmsFromClientRows(rows, upload) {
  if (!rows?.length) return { firms: 0, contacts: 0 }

  const headers = Object.keys(rows[0] || {})
  const cols = {
    firm: findColumn(headers, 'company', 'firm', 'organization', 'business', 'account'),
    name: findColumn(headers, 'name', 'contact name', 'full name', 'client name'),
    first: findColumn(headers, 'first name', 'firstname', 'given name'),
    last: findColumn(headers, 'last name', 'lastname', 'surname', 'family name'),
    email: findColumn(headers, 'email', 'email address', 'e-mail'),
    phone: findColumn(headers, 'phone', 'phone number', 'mobile', 'cell'),
    title: findColumn(headers, 'title', 'role', 'position'),
    instagram: findColumn(headers, 'instagram', 'ig', 'ig handle'),
    linkedin: findColumn(headers, 'linkedin', 'linkedin url'),
    city: findColumn(headers, 'city'),
    state: findColumn(headers, 'state', 'region'),
    type: findColumn(headers, 'type', 'category', 'client type'),
  }

  const firmsMap = {}   // firm_id -> firm record
  const contactsToSeed = []

  for (const row of rows) {
    const contactName = cols.name
      ? row[cols.name]
      : [row[cols.first], row[cols.last]].filter(Boolean).join(' ').trim()

    const firmName = (cols.firm && row[cols.firm]) || contactName || '(unnamed)'
    const firmId = slugify(firmName)

    if (!firmsMap[firmId]) {
      firmsMap[firmId] = {
        id: firmId,
        name: firmName,
        type: cols.type ? row[cols.type] || null : null,
        city: cols.city ? row[cols.city] || null : null,
        state: cols.state ? row[cols.state] || null : null,
        source: 'upload',
        source_upload_id: upload?.id || null,
      }
    }

    // Only create a contact record if we have at least a name
    if (contactName) {
      contactsToSeed.push({
        firm_id: firmId,
        name: contactName,
        title: cols.title ? row[cols.title] || null : null,
        email: cols.email ? row[cols.email] || null : null,
        phone: cols.phone ? row[cols.phone] || null : null,
        instagram: cols.instagram ? row[cols.instagram] || null : null,
        linkedin: cols.linkedin ? row[cols.linkedin] || null : null,
        source: 'upload',
        source_upload_id: upload?.id || null,
      })
    }
  }

  const firmsList = Object.values(firmsMap)
  await createFirms(firmsList)
  await createFirmContacts(contactsToSeed)

  return { firms: firmsList.length, contacts: contactsToSeed.length }
}
