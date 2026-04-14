// PraskForce1 — Puppeteer Agent Engine
// Server-side only. Imported by API routes under /api/agents/*.
//
// Responsibilities:
//   1. Launch your local Chrome via puppeteer-core (executablePath from env).
//   2. Manage per-run lifecycle: create runId, store events, expose live log.
//   3. Dispatch to recipe modules (src/lib/agent-recipes/*).
//   4. Provide Claude vision fallback for extraction when DOM selectors fail.
//
// IMPORTANT: this file imports puppeteer-core and node:fs. Do NOT import it
// from client components — only from API route handlers.

import { existsSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { recipes } from '@/lib/agent-recipes'
import { recordRun, recordEvent, finalizeRun } from '@/lib/memory'

// ── Run registry (in-memory, server lifetime) ──
// Lets the UI poll /api/agents/run/[runId] for live logs.
const RUNS = new Map()

function newRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function makeRun(taskId) {
  const run = {
    id: newRunId(),
    taskId,
    status: 'pending',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    error: null,
    result: null,
    events: [],
  }
  RUNS.set(run.id, run)
  return run
}

export function getRun(runId) {
  return RUNS.get(runId) || null
}

export function listRuns() {
  return Array.from(RUNS.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

// ── Logging ──
function makeLogger(run) {
  return async function log(level, step, message, data) {
    const evt = { ts: new Date().toISOString(), level, step, message, data: data ?? null }
    run.events.push(evt)
    // Also persist to Supabase if available — fire and forget
    try { await recordEvent(run.id, evt) } catch {}
    // And echo to server console for terminal debugging
    const tag = level.toUpperCase().padEnd(7)
    console.log(`[${run.id}] ${tag} ${step || '-'} :: ${message}`)
  }
}

// ── Puppeteer launch ──
async function launchBrowser(log) {
  const puppeteer = (await import('puppeteer-core')).default

  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  const headless = (process.env.PUPPETEER_HEADLESS || 'false').toLowerCase() === 'true'
  const slowMo = Number(process.env.PUPPETEER_SLOWMO || '50')

  await log('info', 'launch', 'Launching Chrome', { executablePath, headless, slowMo })

  if (!existsSync(executablePath)) {
    throw new Error(
      `Chrome not found at "${executablePath}". Set PUPPETEER_EXECUTABLE_PATH in .env.local.`
    )
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless,
    slowMo,
    defaultViewport: { width: 1366, height: 900 },
    args: ['--no-first-run', '--no-default-browser-check'],
  })
  await log('success', 'launch', 'Chrome launched')
  return browser
}

// ── Screenshot helper (stores under .agent-runs/) ──
export async function saveScreenshot(page, runId, label) {
  const dir = resolve(process.cwd(), '.agent-runs', runId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const path = resolve(dir, `${Date.now()}-${label}.png`)
  const buf = await page.screenshot({ fullPage: false })
  await writeFile(path, buf)
  return { path, base64: buf.toString('base64') }
}

// ── Claude vision fallback ──
// Sends a screenshot + extraction instructions to Claude and asks for JSON.
export async function extractWithClaude({ base64, instructions, schemaHint }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set in .env.local — cannot use vision fallback')
  }
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey })
  const model = process.env.ANTHROPIC_MODEL || 'claude-opus-4-6'

  const sys =
    'You are a data-extraction assistant. Look at the screenshot and return ' +
    'STRICT JSON only — no prose, no markdown fences. If a field is not ' +
    'visible, use null. If extracting a list, return an array.'

  const userText = `${instructions}\n\nReturn JSON matching this shape:\n${schemaHint}`

  const resp = await client.messages.create({
    model,
    max_tokens: 4096,
    system: sys,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
          { type: 'text', text: userText },
        ],
      },
    ],
  })

  const text = resp.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim()

  // Tolerate stray fences just in case
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch (err) {
    throw new Error(`Claude returned non-JSON: ${cleaned.slice(0, 200)}...`)
  }
}

// ── Public: kick off a run ──
// Returns immediately with { runId }; the run executes async.
// `credentials` is the decrypted credential object POSTed from the client.
export function startRun({ taskId, credentials }) {
  const recipe = recipes[taskId]
  if (!recipe) {
    throw new Error(`Unknown taskId: ${taskId}. Available: ${Object.keys(recipes).join(', ')}`)
  }

  const run = makeRun(taskId)
  const log = makeLogger(run)

  // Fire and forget — UI polls run state
  ;(async () => {
    const t0 = Date.now()
    run.status = 'running'
    await log('info', 'start', `Starting recipe ${taskId}`)
    await recordRun(run)

    let browser
    try {
      browser = await launchBrowser(log)
      const ctx = {
        run,
        log,
        browser,
        credentials: credentials || {},
        saveScreenshot: (page, label) => saveScreenshot(page, run.id, label),
        extractWithClaude,
      }
      const result = await recipe.execute(ctx)
      run.result = result
      run.status = 'success'
      await log('success', 'done', 'Recipe completed', { itemCount: Array.isArray(result?.items) ? result.items.length : undefined })
    } catch (err) {
      run.status = 'error'
      run.error = err.message
      await log('error', 'fail', err.message, { stack: err.stack })
    } finally {
      if (browser) {
        try { await browser.close() } catch {}
      }
      run.finishedAt = new Date().toISOString()
      run.durationMs = Date.now() - t0
      try { await finalizeRun(run) } catch {}
    }
  })()

  return { runId: run.id }
}

// ── Public: smoke test (no recipe, just google.com + screenshot) ──
export async function runSmokeTest() {
  const run = makeRun('SMOKE')
  const log = makeLogger(run)
  const t0 = Date.now()
  run.status = 'running'
  let browser
  try {
    browser = await launchBrowser(log)
    const page = await browser.newPage()
    await log('info', 'navigate', 'Going to https://www.google.com')
    await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
    const title = await page.title()
    await log('info', 'inspect', `page title = ${title}`)
    const shot = await saveScreenshot(page, run.id, 'google')
    run.result = { title, screenshot: shot.path }
    run.status = 'success'
    await log('success', 'done', 'Smoke test passed', { title })
  } catch (err) {
    run.status = 'error'
    run.error = err.message
    await log('error', 'fail', err.message)
  } finally {
    if (browser) { try { await browser.close() } catch {} }
    run.finishedAt = new Date().toISOString()
    run.durationMs = Date.now() - t0
  }
  return run
}
