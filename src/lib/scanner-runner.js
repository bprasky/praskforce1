// PraskForce1 — Permit scanner runner.
//
// Server-side only. Imported by the API route under
// /api/scanners/run/[scanner]/. Distinct from the legacy
// src/lib/agent-engine.js so it can evolve without disrupting the
// existing recipe runner.
//
// Atomic-step contract. Each scanner exports `steps[]` where each
// step is shaped:
//
//   {
//     key:        'login' | 'nav_permits' | …
//     critical:   true,                        // failure halts the run
//     preflight:  async (page, ctx) => { ok, reason }
//     attempt:    async (page, ctx) => any
//     verify:     async (page, ctx) => { ok, observed, expected }
//     fallback:   'vision' | 'halt' | null     // we use 'halt' for now
//   }
//
// On each step the runner records a workflow_steps row with status,
// duration_ms, expected, observed, screenshot_path (on failure),
// error_message. On run completion it sets workflow_runs.status to
// success | partial | failed and writes a `summary` JSONB blob with
// counts.
//
// The runner halts ONLY the affected scanner on failure — when the
// API runs multiple scanners in sequence (Run All), each gets its own
// workflow_runs row and a halt in one doesn't stop the others. That's
// implemented by the route, not here.

import { existsSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { startWorkflowRun, finishWorkflowRun, recordStep } from '@/lib/resolution.js'

const SCREENSHOT_ROOT = resolve(process.cwd(), 'screenshots')

async function launchBrowser() {
  const puppeteer = (await import('puppeteer-core')).default
  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  const headless = (process.env.PUPPETEER_HEADLESS || 'false').toLowerCase() === 'true'
  const slowMo = Number(process.env.PUPPETEER_SLOWMO || '50')

  if (!existsSync(executablePath)) {
    throw new Error(`Chrome not found at "${executablePath}". Set PUPPETEER_EXECUTABLE_PATH.`)
  }
  return puppeteer.launch({
    executablePath,
    headless,
    slowMo,
    defaultViewport: { width: 1366, height: 900 },
    args: ['--no-first-run', '--no-default-browser-check'],
  })
}

async function captureScreenshot(page, runId, stepIndex, stepKey) {
  const dir = resolve(SCREENSHOT_ROOT, runId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const path = resolve(dir, `${stepIndex}-${stepKey}.png`)
  try {
    const buf = await page.screenshot({ fullPage: false })
    await writeFile(path, buf)
    return path
  } catch (e) {
    return null
  }
}

/**
 * Run a single scanner end-to-end. Caller passes the scanner's
 * workflow key + steps. credentials and ctx are passed through to
 * each step's preflight/attempt/verify functions.
 *
 * Returns:
 *   {
 *     run_id,
 *     status:  'success' | 'partial' | 'failed',
 *     halted_at: { stepKey, stepIndex } | null,
 *     summary: { … },         // whatever the scanner appended
 *     steps:   [ { key, status, durationMs, errorMessage } ],
 *   }
 */
export async function runScanner({
  workflowKey,
  steps,
  trigger = 'manual',
  ctx: ctxIn = {},
}) {
  const run = await startWorkflowRun({ workflowKey, trigger })
  const runId = run.id

  let browser
  let page
  let halted = null
  const stepResults = []
  const summary = { workflow: workflowKey }

  try {
    browser = await launchBrowser()
    page = await browser.newPage()
  } catch (e) {
    await finishWorkflowRun(runId, { status: 'failed', summary: { error: e.message } })
    return {
      run_id: runId,
      status: 'failed',
      halted_at: { stepKey: 'launch', stepIndex: -1 },
      summary: { error: e.message },
      steps: [],
    }
  }

  const ctx = {
    ...ctxIn,
    summary,            // step.attempt() can mutate this — counts, ids, etc.
    captureWithVision: async () => {
      throw new Error("vision fallback not configured for this scanner — use 'halt'")
    },
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const t0 = Date.now()

    // Preflight
    if (typeof step.preflight === 'function') {
      try {
        const pre = await step.preflight(page, ctx)
        if (pre && pre.ok === false) {
          await recordStep(runId, {
            stepKey: step.key,
            stepIndex: i,
            status: 'skipped',
            critical: step.critical !== false,
            durationMs: Date.now() - t0,
            expected: step.expected || null,
            observed: pre.reason || 'preflight returned ok=false',
          })
          stepResults.push({ key: step.key, status: 'skipped' })
          if (step.critical !== false) {
            halted = { stepKey: step.key, stepIndex: i }
            break
          }
          continue
        }
      } catch (e) {
        await recordStep(runId, {
          stepKey: step.key,
          stepIndex: i,
          status: 'failed',
          critical: step.critical !== false,
          durationMs: Date.now() - t0,
          expected: step.expected || null,
          observed: 'preflight threw',
          errorMessage: e.message,
        })
        stepResults.push({ key: step.key, status: 'failed', errorMessage: e.message })
        if (step.critical !== false) {
          halted = { stepKey: step.key, stepIndex: i }
          break
        }
        continue
      }
    }

    // Attempt + verify
    let attemptError = null
    try {
      await step.attempt(page, ctx)
    } catch (e) {
      attemptError = e
    }

    let verifyResult = { ok: !attemptError, observed: attemptError?.message || null }
    if (!attemptError && typeof step.verify === 'function') {
      try {
        verifyResult = await step.verify(page, ctx)
      } catch (e) {
        verifyResult = { ok: false, observed: `verify threw: ${e.message}` }
      }
    }

    if (verifyResult.ok) {
      await recordStep(runId, {
        stepKey: step.key,
        stepIndex: i,
        status: 'success',
        critical: step.critical !== false,
        durationMs: Date.now() - t0,
        expected: step.expected || verifyResult.expected || null,
        observed: verifyResult.observed || null,
      })
      stepResults.push({ key: step.key, status: 'success' })
    } else {
      const screenshotPath = await captureScreenshot(page, runId, i, step.key)
      await recordStep(runId, {
        stepKey: step.key,
        stepIndex: i,
        status: 'failed',
        critical: step.critical !== false,
        durationMs: Date.now() - t0,
        expected: step.expected || verifyResult.expected || null,
        observed: verifyResult.observed || (attemptError ? attemptError.message : 'verify returned ok=false'),
        errorMessage: attemptError ? attemptError.message : null,
        screenshotPath,
      })
      stepResults.push({
        key: step.key,
        status: 'failed',
        errorMessage: attemptError?.message || verifyResult.observed,
        screenshotPath,
      })
      if (step.critical !== false) {
        halted = { stepKey: step.key, stepIndex: i }
        break
      }
    }
  }

  if (browser) {
    try { await browser.close() } catch {}
  }

  const status = halted ? 'failed' : (stepResults.some(s => s.status === 'failed' || s.status === 'skipped') ? 'partial' : 'success')
  await finishWorkflowRun(runId, { status, summary })

  return {
    run_id: runId,
    status,
    halted_at: halted,
    summary,
    steps: stepResults,
  }
}
