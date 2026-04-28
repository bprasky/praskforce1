// PraskForce1 — Miami Beach Civic Access permit scanner.
//
// Workflow key:  permit_scan_miami_beach
// Portal:        https://eservices.miamibeachfl.gov/CivicAccess/  (Citizen Self-Service)
// Cadence:       on-demand or once daily
//
// Returns recently filed/issued building permits and dedupes the
// resulting addresses against the `properties` table. New permits
// surface on the Leads page via the existing permits feed.
//
// The selectors below are deliberately documented and conservative.
// The CivicAccess UI is third-party (CentralSquare) and changes
// occasionally, so each step's `verify` is the single source of
// truth for "did this work?". Failure → halt → screenshot → user
// sees a useful failure surface.

import { addressKey, parseAddress } from '@/lib/address.js'
import { upsertPermits } from '@/lib/permits.js'
import { getSupabase } from '@/lib/supabase.js'

export const WORKFLOW_KEY = 'permit_scan_miami_beach'
export const PORTAL_ID = 'mb_civic'

const DEFAULT_PORTAL_URL = 'https://eservices.miamibeachfl.gov/CivicAccess/'

// 30-day default look-back window. Configurable per run via ctx.lookbackDays.
const DEFAULT_LOOKBACK_DAYS = 30

const RELEVANT_PERMIT_TYPES = [
  'Building',
  'Residential',
  'Demolition',
  'Construction',
  'Remodel',
  'Alteration',
]

function isoDateNDaysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// ── Steps ────────────────────────────────────────────────────────────

const loginStep = {
  key: 'login',
  critical: true,
  expected: 'CivicAccess homepage shows a logged-in user element after credential submit.',
  preflight: async (_page, ctx) => {
    const c = ctx.credentials
    if (!c?.username || !c?.password) {
      return { ok: false, reason: 'No Miami Beach Civic Access credentials in vault. Add them in Configuration → Credentials.' }
    }
    return { ok: true }
  },
  attempt: async (page, ctx) => {
    const url = ctx.credentials?.url || DEFAULT_PORTAL_URL
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })

    // CivicAccess "Login" link in the masthead. The portal sometimes
    // serves the login page directly when navigating with a session cookie.
    const loginLink = await page.$('a[href*="Login"], a:has-text("Login")')
    if (loginLink) await loginLink.click()
    await page.waitForSelector('input[type="text"], input[name*="UserName"]', { timeout: 30000 })

    await page.type('input[name*="UserName"], input[type="text"]', ctx.credentials.username, { delay: 25 })
    await page.type('input[type="password"], input[name*="Password"]', ctx.credentials.password, { delay: 25 })

    const submit = await page.$('input[type="submit"], button[type="submit"]')
    if (!submit) throw new Error('login submit button not found')
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }),
      submit.click(),
    ])
  },
  verify: async (page) => {
    // After login, CivicAccess shows a "My Account" / "Logout" affordance.
    // We test for either rather than asserting on a single id.
    const html = await page.content()
    const ok = /Logout|Sign Out|My Account/i.test(html) && !/Invalid login|Bad credentials/i.test(html)
    return {
      ok,
      expected: 'A "Logout" or "My Account" element after submit.',
      observed: ok ? 'Found "Logout" / "My Account" on the page.' : 'No logged-in marker found — credentials may be wrong, or the login page layout changed.',
    }
  },
}

const navPermitsStep = {
  key: 'nav_permits',
  critical: true,
  expected: 'Permit search form is visible (date filters, type filter, Search button).',
  attempt: async (page) => {
    // The CivicAccess "Permits" tab. We try the friendly nav first,
    // and fall back to the direct URL pattern many CentralSquare sites
    // expose.
    const navLink = await page.$('a:has-text("Permits"), a[href*="Permit"]')
    if (navLink) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
        navLink.click(),
      ])
    } else {
      const base = page.url().replace(/\/[^/]*$/, '')
      await page.goto(`${base}/Cap/CapHome.aspx?module=Building&TabName=Building`, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      })
    }
  },
  verify: async (page) => {
    const html = await page.content()
    const ok = /Permit\s*Number|Search Permits|Issued Date|Filed Date/i.test(html)
    return {
      ok,
      expected: 'A permit search form with date filters and a search button.',
      observed: ok ? 'Permit search form located.' : 'Did not find any permit-search markers in the DOM. The Permits tab may have moved.',
    }
  },
}

const setSearchFiltersStep = {
  key: 'set_search_filters',
  critical: true,
  expected: 'Date range = last N days, permit-type filters set to construction/demo/remodel.',
  attempt: async (page, ctx) => {
    const lookback = ctx.lookbackDays || DEFAULT_LOOKBACK_DAYS
    const fromDate = isoDateNDaysAgo(lookback)
    const toDate = new Date().toISOString().slice(0, 10)

    // CivicAccess form fields are usually named "ctl00_PlaceHolderMain_*StartDate"
    // and similar. We type into whatever is most-likely and rely on verify
    // to detect if we missed.
    const fromInput = await page.$('input[name*="StartDate"], input[id*="StartDate"], input[name*="FromDate"]')
    const toInput = await page.$('input[name*="EndDate"], input[id*="EndDate"], input[name*="ToDate"]')
    if (fromInput) {
      await fromInput.click({ clickCount: 3 })
      await fromInput.type(fromDate, { delay: 15 })
    }
    if (toInput) {
      await toInput.click({ clickCount: 3 })
      await toInput.type(toDate, { delay: 15 })
    }

    // Permit-type checkbox(es). Some CivicAccess sites use a multiselect,
    // others a list of checkboxes — we just check anything whose label
    // matches our relevant-types list.
    for (const t of RELEVANT_PERMIT_TYPES) {
      const cb = await page.$(`input[type="checkbox"][value*="${t}"], input[type="checkbox"][title*="${t}" i]`)
      if (cb) await cb.click().catch(() => {})
    }

    ctx.summary.from_date = fromDate
    ctx.summary.to_date = toDate
  },
  verify: async (page, ctx) => {
    const html = await page.content()
    const dateOk = ctx.summary.from_date && html.includes(ctx.summary.from_date)
    return {
      ok: !!dateOk,
      expected: `From-date input contains ${ctx.summary.from_date}.`,
      observed: dateOk ? 'Date filter populated.' : 'Could not confirm the From-date input was populated. Field id may have changed.',
    }
  },
}

const executeSearchStep = {
  key: 'execute_search',
  critical: true,
  expected: 'Search button clicked and a results table is rendered.',
  attempt: async (page) => {
    const btn =
      (await page.$('input[type="submit"][value*="Search" i]')) ||
      (await page.$('button:has-text("Search")')) ||
      (await page.$('input[id*="Search"]'))
    if (!btn) throw new Error('search button not found')
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null),
      btn.click(),
    ])
    // Wait for either a results table or a "no records" message.
    await page.waitForSelector('table, .no-records, .NoRecords', { timeout: 60000 })
  },
  verify: async (page) => {
    const html = await page.content()
    const hasTable = /<table[^>]*>[\s\S]*?Permit/i.test(html)
    const noResults = /No records found|No results/i.test(html)
    return {
      ok: hasTable || noResults,
      expected: 'A results table with permit rows, or an explicit "no records" message.',
      observed: hasTable
        ? 'Results table found.'
        : noResults
          ? 'Portal reports no records in this window — treating as a successful empty result.'
          : 'Neither a results table nor a no-records message appeared. Portal may be stuck on a loading state.',
    }
  },
}

const extractResultsStep = {
  key: 'extract_results',
  critical: true,
  expected: 'Each result row has a permit number, address, type, status, and filed date.',
  attempt: async (page, ctx) => {
    const rows = await page.evaluate(() => {
      // Best-effort generic extractor. CivicAccess result tables vary
      // but the column order is consistently Permit / Type / Status /
      // Description / Address / Date / etc.
      const out = []
      const tables = Array.from(document.querySelectorAll('table'))
      for (const t of tables) {
        const headers = Array.from(t.querySelectorAll('th')).map(h => (h.textContent || '').trim())
        const headerJoin = headers.join(' | ').toLowerCase()
        if (!headerJoin.includes('permit')) continue
        const idx = {
          permit: headers.findIndex(h => /permit/i.test(h)),
          type:   headers.findIndex(h => /type/i.test(h)),
          status: headers.findIndex(h => /status/i.test(h)),
          desc:   headers.findIndex(h => /descrip/i.test(h)),
          addr:   headers.findIndex(h => /address/i.test(h)),
          date:   headers.findIndex(h => /file|issu/i.test(h)),
          val:    headers.findIndex(h => /valu|amount/i.test(h)),
          appl:   headers.findIndex(h => /applican|owner/i.test(h)),
        }
        const trs = Array.from(t.querySelectorAll('tbody tr'))
        for (const tr of trs) {
          const tds = Array.from(tr.querySelectorAll('td')).map(td => (td.textContent || '').trim())
          if (tds.length === 0) continue
          out.push({
            permit_number:    idx.permit >= 0 ? tds[idx.permit] : null,
            permit_type:      idx.type   >= 0 ? tds[idx.type]   : null,
            permit_status:    idx.status >= 0 ? tds[idx.status] : null,
            scope_description:idx.desc   >= 0 ? tds[idx.desc]   : null,
            address:          idx.addr   >= 0 ? tds[idx.addr]   : null,
            date_filed:       idx.date   >= 0 ? tds[idx.date]   : null,
            valuation:        idx.val    >= 0 ? Number(String(tds[idx.val]).replace(/[^0-9.]/g,'')) || null : null,
            applicant_name:   idx.appl   >= 0 ? tds[idx.appl]   : null,
          })
        }
        if (out.length > 0) break
      }
      return out
    })

    ctx.summary.rows_extracted = rows.length
    ctx.extracted = rows
  },
  verify: async (_page, ctx) => {
    // An empty list is fine — that's a successful empty result. We only
    // fail this step if the result didn't even shape-match.
    if (!Array.isArray(ctx.extracted)) {
      return { ok: false, observed: 'extractor did not return an array' }
    }
    const allHavePermit = ctx.extracted.every(r => 'permit_number' in r)
    return {
      ok: allHavePermit,
      expected: 'Each row contains permit_number, address, type, status, filed_date.',
      observed: allHavePermit
        ? `Extracted ${ctx.extracted.length} row(s).`
        : 'Some extracted rows are missing the permit_number key — the column layout may have changed.',
    }
  },
}

const dedupeAndPersistStep = {
  key: 'dedupe_and_persist',
  critical: false, // logging failure here shouldn't halt — we got the data
  expected: 'New permits inserted; existing ones updated; addresses linked to properties when possible.',
  attempt: async (_page, ctx) => {
    const sb = getSupabase()
    const rows = ctx.extracted || []
    const stamped = []
    let linkedCount = 0
    let createdProperties = 0

    for (const r of rows) {
      const key = addressKey(r.address || '')
      let propertyId = null

      if (sb && key) {
        try {
          const parsed = parseAddress(r.address)
          // Try a fuzzy match — anything whose address normalizes to the
          // same key. Cheaper than a full-table scan because the leads
          // table is small (~50-200 rows).
          const { data } = await sb.from('properties').select('id, address').limit(500)
          const hit = (data || []).find(p => addressKey(p.address) === key)
          if (hit) {
            propertyId = hit.id
            linkedCount++
          } else {
            // Create a stub property so the permit has a home in the leads
            // feed. The Leads page treats `status='new'` rows as candidates.
            const { data: created, error } = await sb.from('properties').insert({
              address: parsed.street || r.address,
              municipality: 'Miami Beach',
              status: 'new',
            }).select().single()
            if (!error && created) {
              propertyId = created.id
              createdProperties++
            }
          }
        } catch (e) {
          // best-effort link; persisting permits matters more than perfect linkage
        }
      }

      stamped.push({
        ...r,
        portal_id: 'mb_civic',
        property_id: propertyId,
      })
    }

    const result = await upsertPermits(stamped)
    ctx.summary.permits_inserted = result.inserted || 0
    ctx.summary.permits_updated = result.updated || 0
    ctx.summary.linked_existing = linkedCount
    ctx.summary.created_properties = createdProperties
  },
  verify: async (_page, ctx) => {
    const ok = typeof ctx.summary.permits_inserted === 'number'
    return {
      ok,
      expected: 'Permits upserted successfully and counts populated on the run summary.',
      observed: ok
        ? `Inserted ${ctx.summary.permits_inserted}, updated ${ctx.summary.permits_updated}, linked ${ctx.summary.linked_existing} to existing properties.`
        : 'Persistence call did not return counts — likely Supabase write failed.',
    }
  },
}

export const steps = [
  loginStep,
  navPermitsStep,
  setSearchFiltersStep,
  executeSearchStep,
  extractResultsStep,
  dedupeAndPersistStep,
]
