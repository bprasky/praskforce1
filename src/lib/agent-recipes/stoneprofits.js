// PraskForce1 — Recipe: StoneProfits Quote Extraction (SP-QUOTES-001)
//
// Strategy:
//   1. Navigate to login page
//   2. Fill credentials, submit
//   3. Navigate to Presales > Quotes
//   4. Try DOM extraction first (fast path)
//   5. If DOM yields zero rows or throws, screenshot + Claude vision fallback
//
// All selectors below are marked `// TODO: verify against live DOM` because we
// haven't seen the real StoneProfits HTML yet. They're best guesses based on
// common CRM patterns. Run this once headed, watch where it stops, fix the
// selectors that fail.
//
// The vision fallback means the recipe will still produce data even when DOM
// selectors are wrong — it just costs an Anthropic API call per page.

const DEFAULT_LOGIN_URL = 'https://arca.stoneprofits.com'

// Quote schema we want Claude (or DOM) to produce
const QUOTE_SCHEMA = `[
  {
    "quote_number": "string|null",
    "quote_date":   "YYYY-MM-DD|null",
    "customer":     "string|null",
    "contact":      "string|null",
    "project":      "string|null",
    "materials":    ["string"],
    "total":        "number|null",
    "status":       "Draft|Sent|Accepted|Expired|null",
    "salesperson":  "string|null"
  }
]`

async function login({ page, log, credentials }) {
  const url = credentials.url || DEFAULT_LOGIN_URL
  await log('info', 'login.navigate', `Opening ${url}`)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })

  if (!credentials.username || !credentials.password) {
    throw new Error(
      'Missing StoneProfits credentials. Add them to the vault and try again.'
    )
  }

  // TODO: verify against live DOM — these are guesses
  const userSel = 'input[name="username"], input[type="email"], #username, #UserName'
  const passSel = 'input[name="password"], input[type="password"], #password, #Password'
  const submitSel = 'button[type="submit"], input[type="submit"], #LoginButton, button.login'

  await log('info', 'login.fill', 'Filling credentials')
  await page.waitForSelector(userSel, { timeout: 15000 })
  await page.type(userSel, credentials.username, { delay: 30 })
  await page.type(passSel, credentials.password, { delay: 30 })

  await log('info', 'login.submit', 'Submitting login form')
  await Promise.all([
    page.click(submitSel),
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
  ])

  // Detect failed login by URL still containing "login"
  const after = page.url()
  if (/login|signin/i.test(after)) {
    throw new Error(`Login appears to have failed — still at ${after}`)
  }
  await log('success', 'login.done', `Logged in (now at ${after})`)
}

async function navigateToQuotes({ page, log }) {
  await log('info', 'nav.quotes', 'Navigating to Presales > Quotes')
  // TODO: verify against live DOM. StoneProfits likely uses either:
  //  (a) a sidebar link with text "Quotes" under a "Presales" group, or
  //  (b) a direct URL like /presales/quotes
  // Try the link approach first, fall back to a URL guess.
  try {
    // Try clicking a "Quotes" link
    const handle = await page.waitForSelector('a ::-p-text(Quotes)', { timeout: 5000 }).catch(() => null)
    if (handle) {
      await Promise.all([
        handle.click(),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
      ])
    } else {
      // URL fallback
      const base = new URL(page.url()).origin
      await page.goto(`${base}/Presales/Quotes`, { waitUntil: 'networkidle2', timeout: 30000 })
    }
  } catch (err) {
    await log('warn', 'nav.quotes', `Direct nav failed: ${err.message}`)
  }
  await log('success', 'nav.quotes', `At ${page.url()}`)
}

async function extractQuotesFromDom({ page, log }) {
  await log('info', 'extract.dom', 'Attempting DOM extraction')

  // TODO: verify against live DOM. Generic table heuristic — looks for any
  // table with a header row containing "Quote" and parses each row.
  const items = await page.evaluate(() => {
    function text(el) { return (el?.textContent || '').trim() }

    // Find candidate table
    const tables = Array.from(document.querySelectorAll('table'))
    const target = tables.find(t => {
      const headers = Array.from(t.querySelectorAll('thead th, thead td, tr:first-child th, tr:first-child td'))
        .map(h => text(h).toLowerCase())
      return headers.some(h => h.includes('quote'))
    })
    if (!target) return []

    const headerCells = Array.from(target.querySelectorAll('thead th, thead td'))
    const headers = headerCells.length
      ? headerCells.map(h => text(h).toLowerCase())
      : Array.from(target.querySelectorAll('tr:first-child th, tr:first-child td')).map(h => text(h).toLowerCase())

    function colIdx(...names) {
      for (const n of names) {
        const i = headers.findIndex(h => h.includes(n))
        if (i >= 0) return i
      }
      return -1
    }

    const idx = {
      quote_number: colIdx('quote #', 'quote no', 'quote number', 'quote'),
      date:         colIdx('date'),
      customer:     colIdx('customer', 'company', 'account'),
      contact:      colIdx('contact'),
      project:      colIdx('project', 'job', 'address'),
      total:        colIdx('total', 'amount', 'value'),
      status:       colIdx('status'),
      salesperson:  colIdx('salesperson', 'sales rep', 'rep'),
    }

    const bodyRows = target.querySelectorAll('tbody tr')
    const rows = bodyRows.length ? Array.from(bodyRows) : Array.from(target.querySelectorAll('tr')).slice(1)

    return rows.map(r => {
      const cells = Array.from(r.querySelectorAll('td')).map(text)
      const totalRaw = idx.total >= 0 ? cells[idx.total] : null
      const total = totalRaw ? Number(totalRaw.replace(/[^0-9.\-]/g, '')) || null : null
      return {
        quote_number: idx.quote_number >= 0 ? cells[idx.quote_number] : null,
        quote_date:   idx.date >= 0 ? cells[idx.date] : null,
        customer:     idx.customer >= 0 ? cells[idx.customer] : null,
        contact:      idx.contact >= 0 ? cells[idx.contact] : null,
        project:      idx.project >= 0 ? cells[idx.project] : null,
        materials:    [],
        total,
        status:       idx.status >= 0 ? cells[idx.status] : null,
        salesperson:  idx.salesperson >= 0 ? cells[idx.salesperson] : null,
      }
    }).filter(q => q.quote_number)
  })

  await log('info', 'extract.dom', `DOM extraction found ${items.length} quotes`)
  return items
}

async function extractQuotesWithVision({ page, log, saveScreenshot, extractWithClaude, run }) {
  await log('info', 'extract.vision', 'Falling back to Claude vision extraction')
  const shot = await saveScreenshot(page, 'quotes-page')
  await log('info', 'extract.vision', `Screenshot saved: ${shot.path}`)
  const items = await extractWithClaude({
    base64: shot.base64,
    instructions:
      'This is the StoneProfits CRM Presales > Quotes page. Extract every quote ' +
      'visible in the table. Convert dates to YYYY-MM-DD. Convert dollar totals ' +
      'to plain numbers (no $ or commas). If the materials column lists products, ' +
      'split into an array of strings.',
    schemaHint: QUOTE_SCHEMA,
  })
  const arr = Array.isArray(items) ? items : (items?.quotes || [])
  await log('info', 'extract.vision', `Claude extracted ${arr.length} quotes`)
  return arr
}

// Task-tree spawning policy for this recipe.
// Called by the agent engine after execute() succeeds. Returns an
// array of task defs that become children of the auto-created origin.
//
// For SP-QUOTES we spawn one FOLLOW_UP per extracted quote — a
// lightweight "check status / update CRM" nudge. Quotes already in
// terminal states (Accepted with a recent date, Expired) get a
// CRM_UPDATE instead of a FOLLOW_UP so the task category reflects the
// real work.
function spawnTasks(result) {
  const items = Array.isArray(result?.items) ? result.items : []
  if (items.length === 0) return []

  return items.map(q => {
    const status = (q.status || '').toLowerCase()
    const isTerminal = ['accepted', 'expired', 'cancelled', 'closed'].includes(status)
    const type = isTerminal ? 'CRM_UPDATE' : 'FOLLOW_UP'
    const title = isTerminal
      ? `Record ${q.status} status for ${q.quote_number || 'quote'}`
      : `Follow up on ${q.quote_number || 'quote'} (${q.customer || 'unknown customer'})`
    return {
      type,
      title,
      description: [
        q.quote_number ? `Quote ${q.quote_number}` : null,
        q.customer ? `for ${q.customer}` : null,
        q.project ? `— ${q.project}` : null,
        q.total ? `— $${Number(q.total).toLocaleString()}` : null,
        q.status ? `(${q.status})` : null,
      ].filter(Boolean).join(' '),
      contact: q.contact || null,
      property: q.project || null,
      materials: Array.isArray(q.materials) ? q.materials.join(', ') : null,
      priority: isTerminal ? 'low' : 'medium',
      value: q.total || null,
      quoteRef: q.quote_number || null,
    }
  })
}

export default {
  id: 'SP-QUOTES-001',
  label: 'Extract StoneProfits Quotes',
  spawnTasks,
  async execute(ctx) {
    const { browser, log } = ctx
    const page = await browser.newPage()

    await login({ page, ...ctx })
    await navigateToQuotes({ page, ...ctx })

    let items = []
    let extractionMode = 'dom'

    try {
      items = await extractQuotesFromDom({ page, ...ctx })
    } catch (err) {
      await log('warn', 'extract.dom', `DOM extraction threw: ${err.message}`)
      items = []
    }

    if (!items.length) {
      extractionMode = 'vision'
      items = await extractQuotesWithVision({ page, ...ctx })
    }

    return {
      source: 'stoneprofits',
      extractionMode,
      count: items.length,
      items,
    }
  },
}
