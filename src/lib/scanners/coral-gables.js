// PraskForce1 — Coral Gables EdenWeb permit scanner.
//
// Workflow key:  permit_scan_coral_gables
// Portal:        https://edenweb.coralgables.com/   (Energov / EdenWeb)
//
// Step contract is identical to miami-beach.js — see scanner-runner.js
// for the runner contract. We keep these scanners in separate files so
// each portal's quirks (selectors, login flow, captcha behaviour) stay
// isolated.

import { addressKey, parseAddress } from '@/lib/address.js'
import { upsertPermits } from '@/lib/permits.js'
import { getSupabase } from '@/lib/supabase.js'

export const WORKFLOW_KEY = 'permit_scan_coral_gables'
export const PORTAL_ID = 'cg_eden'

const DEFAULT_PORTAL_URL = 'https://edenweb.coralgables.com/Default.aspx'
const DEFAULT_LOOKBACK_DAYS = 30

function isoDateNDaysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

const loginStep = {
  key: 'login',
  critical: true,
  expected: 'After credential submit, page shows a logged-in indicator (Logout link or username).',
  preflight: async (_page, ctx) => {
    const c = ctx.credentials
    if (!c?.username || !c?.password) {
      return { ok: false, reason: 'No Coral Gables EdenWeb credentials in vault. Add them in Configuration → Credentials.' }
    }
    return { ok: true }
  },
  attempt: async (page, ctx) => {
    const url = ctx.credentials?.url || DEFAULT_PORTAL_URL
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })

    // EdenWeb Login is in the masthead. Some installs land you on the
    // login page directly; we tolerate both flows.
    const loginLink = await page.$('a[href*="Login"], a:has-text("Login")')
    if (loginLink) await loginLink.click().catch(() => {})

    await page.waitForSelector('input[name*="UserName"], input[name*="Username"], input[type="text"]', { timeout: 30000 })
    await page.type('input[name*="UserName"], input[name*="Username"], input[type="text"]', ctx.credentials.username, { delay: 25 })
    await page.type('input[type="password"]', ctx.credentials.password, { delay: 25 })

    const submit = await page.$('input[type="submit"], button[type="submit"]')
    if (!submit) throw new Error('login submit button not found')
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }),
      submit.click(),
    ])
  },
  verify: async (page) => {
    const html = await page.content()
    const ok = /Logout|Sign Out/i.test(html) && !/Invalid login/i.test(html)
    return {
      ok,
      expected: 'Logout / Sign Out element appears after login.',
      observed: ok ? 'Logged-in marker found.' : 'No logged-in marker — credentials wrong or login page redesigned.',
    }
  },
}

const navPermitsStep = {
  key: 'nav_permits',
  critical: true,
  expected: 'Permit search form is visible.',
  attempt: async (page) => {
    const navLink = await page.$('a:has-text("Permits"), a[href*="Permit"]')
    if (navLink) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
        navLink.click(),
      ])
    }
  },
  verify: async (page) => {
    const html = await page.content()
    const ok = /Permit\s*Number|Search Permits|Issue Date|Application Date/i.test(html)
    return {
      ok,
      expected: 'Permit search form with date filters and Search button.',
      observed: ok ? 'Permit search form located.' : 'Did not find permit-search markers — Permits tab may have moved.',
    }
  },
}

const setSearchFiltersStep = {
  key: 'set_search_filters',
  critical: true,
  expected: 'Date range populated for last N days.',
  attempt: async (page, ctx) => {
    const lookback = ctx.lookbackDays || DEFAULT_LOOKBACK_DAYS
    const fromDate = isoDateNDaysAgo(lookback)
    const toDate = new Date().toISOString().slice(0, 10)

    const fromInput = await page.$('input[name*="StartDate"], input[name*="FromDate"], input[id*="StartDate"]')
    const toInput = await page.$('input[name*="EndDate"], input[name*="ToDate"], input[id*="EndDate"]')
    if (fromInput) {
      await fromInput.click({ clickCount: 3 })
      await fromInput.type(fromDate, { delay: 15 })
    }
    if (toInput) {
      await toInput.click({ clickCount: 3 })
      await toInput.type(toDate, { delay: 15 })
    }
    ctx.summary.from_date = fromDate
    ctx.summary.to_date = toDate
  },
  verify: async (page, ctx) => {
    const html = await page.content()
    const ok = ctx.summary.from_date && html.includes(ctx.summary.from_date)
    return {
      ok: !!ok,
      expected: `From-date input contains ${ctx.summary.from_date}.`,
      observed: ok ? 'Date filter populated.' : 'From-date input not populated — field id may have changed.',
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
      (await page.$('button:has-text("Search")'))
    if (!btn) throw new Error('search button not found')
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null),
      btn.click(),
    ])
    await page.waitForSelector('table, .no-records', { timeout: 60000 })
  },
  verify: async (page) => {
    const html = await page.content()
    const hasTable = /<table[^>]*>[\s\S]*?Permit/i.test(html)
    const noResults = /No records found|No results/i.test(html)
    return {
      ok: hasTable || noResults,
      expected: 'Results table or explicit no-records message.',
      observed: hasTable ? 'Results table found.' : noResults ? 'No records in window — empty success.' : 'Neither table nor no-records message — portal stuck loading.',
    }
  },
}

const extractResultsStep = {
  key: 'extract_results',
  critical: true,
  expected: 'Each row carries permit_number, address, type, status, filed_date.',
  attempt: async (page, ctx) => {
    const rows = await page.evaluate(() => {
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
          date:   headers.findIndex(h => /file|issu|appl/i.test(h)),
          val:    headers.findIndex(h => /valu|amount/i.test(h)),
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
    if (!Array.isArray(ctx.extracted)) return { ok: false, observed: 'extractor did not return an array' }
    return {
      ok: true,
      expected: 'Array of row objects.',
      observed: `Extracted ${ctx.extracted.length} row(s).`,
    }
  },
}

const dedupeAndPersistStep = {
  key: 'dedupe_and_persist',
  critical: false,
  expected: 'New permits inserted; addresses linked to properties when possible.',
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
          const { data } = await sb.from('properties').select('id, address').limit(500)
          const hit = (data || []).find(p => addressKey(p.address) === key)
          if (hit) {
            propertyId = hit.id
            linkedCount++
          } else {
            const { data: created, error } = await sb.from('properties').insert({
              address: parsed.street || r.address,
              municipality: 'Coral Gables',
              status: 'new',
            }).select().single()
            if (!error && created) {
              propertyId = created.id
              createdProperties++
            }
          }
        } catch {}
      }

      stamped.push({ ...r, portal_id: 'cg_eden', property_id: propertyId })
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
      expected: 'Permits upserted; counts populated on summary.',
      observed: ok
        ? `Inserted ${ctx.summary.permits_inserted}, updated ${ctx.summary.permits_updated}, linked ${ctx.summary.linked_existing}.`
        : 'Persistence call did not return counts.',
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
