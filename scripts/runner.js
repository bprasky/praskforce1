#!/usr/bin/env node
/**
 * PraskForce1 — Background Job Runner
 *
 * Polls the `agent_jobs` table in Supabase for queued work and dispatches
 * to per-kind handlers. Designed to run on a schedule (cron, systemd
 * timer, or GitHub Actions) so that portal scans, IG rundowns, and
 * StoneProfits quote creation happen automatically overnight instead of
 * requiring Brad to sit at the computer doing copy-paste.
 *
 * Current state: FOUNDATION. The dispatch loop, job claiming, error
 * handling, and result writing are all complete. The actual per-portal
 * scraping logic is stubbed — each handler logs what it WOULD do and
 * marks the job done. Real scrapers plug in at the handler functions
 * (marked with TODO).
 *
 * Run it:
 *
 *   # One-shot: process all queued jobs and exit
 *   NEXT_PUBLIC_SUPABASE_URL=https://... \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/runner.js
 *
 *   # Daemon mode: poll every 60s, keep running
 *   node scripts/runner.js --daemon
 *
 *   # Limit to one kind of job
 *   node scripts/runner.js --kind portal_scan
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL   — your Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — service role key (NOT the anon key)
 *                                server-side only, never ship to client
 */

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: Missing required env vars.')
  console.error('  NEXT_PUBLIC_SUPABASE_URL  =', SUPABASE_URL ? '(set)' : '(missing)')
  console.error('  SUPABASE_SERVICE_ROLE_KEY =', SERVICE_KEY ? '(set)' : '(missing)')
  console.error('')
  console.error('Get the service role key from Supabase Dashboard → Project Settings → API.')
  console.error('This key bypasses RLS — keep it secret. Never commit it.')
  process.exit(1)
}

const args = process.argv.slice(2)
const flags = {
  daemon: args.includes('--daemon'),
  kind: args.includes('--kind') ? args[args.indexOf('--kind') + 1] : null,
  pollInterval: 60_000, // ms
  maxJobsPerCycle: 20,
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

// ── Per-kind handlers ────────────────────────────────────────────────

/**
 * Portal scan handler.
 *
 * TODO: wire this up to a real scraper. Options:
 *  a) fetch + cheerio for public portals with HTML search forms
 *     (Miami-Dade County, Coral Gables EdenWeb, Sunbiz, Property
 *     Appraiser) — cheap, fast, no browser needed
 *  b) Playwright for credentialed portals (Miami Beach Civic, City
 *     of Miami iBuild, PropertyReports) — needs `npm i playwright`
 *     and `npx playwright install chromium`. Credentials via env.
 *
 * The stub below just pretends to scan and returns an empty result
 * so the dispatch loop and ingestion contract can be verified end
 * to end before the real scraping is added.
 *
 * Contract: return an object with the same shape ingestScanResults
 * expects in src/lib/portal-scans.js:
 *   {
 *     portal_results: [{ portal_id, status, permits_found, new_permits, error, summary }],
 *     permits: [{ portal_id, permit_number, address, permit_type, ... }]
 *   }
 */
async function handlePortalScan(job) {
  const portalIds = job.payload?.portal_ids || []
  console.log(`  [portal_scan] stub handler — would scan ${portalIds.length} portal(s):`, portalIds.join(', '))

  // TODO: for each portal_id, call a scraper like:
  //   const result = await scrapePortal(portalId, job.payload.filters)
  //
  // For now, return a dry-run response so the flow can be tested.
  const dryRun = {
    portal_results: portalIds.map(pid => ({
      portal_id: pid,
      status: 'skipped',
      permits_found: 0,
      new_permits: 0,
      error: 'Runner stub — real scraper not yet implemented. See scripts/runner.js:handlePortalScan.',
      summary: null,
    })),
    permits: [],
  }
  return dryRun
}

/** Instagram daily rundown — stub. */
async function handleIgDailyScroll(job) {
  console.log('  [ig_daily_scroll] stub handler — Claude-in-Chrome is the intended runtime for this one.')
  return { posts: [], note: 'Runner stub. Claude-in-Chrome produces the real output; runner is not the right runtime for IG.' }
}

/** StoneProfits quote creation — stub. */
async function handleSpQuote(job) {
  console.log(`  [sp_quote] stub handler — would create quote for ${job.payload?.contact || '(unknown)'}`)
  return { note: 'Runner stub — StoneProfits quote automation requires browser automation + credentials. Not yet implemented.' }
}

/** Outlook recap send — stub. */
async function handleOutlookRecap(job) {
  console.log(`  [outlook_recap] stub handler — recap is drafted client-side; runner would only handle the browser send step.`)
  return { note: 'Runner stub — actual send requires Outlook browser automation.' }
}

const HANDLERS = {
  portal_scan: handlePortalScan,
  ig_daily_scroll: handleIgDailyScroll,
  sp_quote: handleSpQuote,
  outlook_recap: handleOutlookRecap,
}

// ── Queue processing ─────────────────────────────────────────────────

async function claimNextJob() {
  // Select the oldest queued job (optionally filtered to one kind).
  // We do select-then-update rather than a stored procedure so the
  // runner stays simple — for a single-worker setup this is fine.
  let q = sb.from('agent_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
  if (flags.kind) q = q.eq('kind', flags.kind)

  const { data, error } = await q
  if (error) {
    console.error('Failed to fetch queued jobs:', error.message)
    return null
  }
  if (!data?.length) return null

  const job = data[0]

  // Claim it
  const { error: claimErr } = await sb
    .from('agent_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', job.id)
    .eq('status', 'queued')  // guard against races

  if (claimErr) {
    console.error('Failed to claim job', job.id, claimErr.message)
    return null
  }
  return job
}

async function completeJob(job, result) {
  const { error } = await sb
    .from('agent_jobs')
    .update({
      status: 'done',
      result,
      completed_at: new Date().toISOString(),
    })
    .eq('id', job.id)
  if (error) console.error('Failed to mark job done', job.id, error.message)
}

async function failJob(job, errorMessage) {
  const { error } = await sb
    .from('agent_jobs')
    .update({
      status: 'failed',
      error: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', job.id)
  if (error) console.error('Failed to mark job failed', job.id, error.message)
}

async function processCycle() {
  let processed = 0
  for (let i = 0; i < flags.maxJobsPerCycle; i++) {
    const job = await claimNextJob()
    if (!job) break

    console.log(`[${new Date().toISOString()}] Running job ${job.id} (${job.kind})`)
    processed++

    const handler = HANDLERS[job.kind]
    if (!handler) {
      await failJob(job, `No handler registered for kind: ${job.kind}`)
      continue
    }

    try {
      const result = await handler(job)
      await completeJob(job, result)
      console.log(`  ✓ done`)
    } catch (e) {
      console.error(`  ✗ failed:`, e.message)
      await failJob(job, e.message)
    }
  }
  return processed
}

// ── Main loop ────────────────────────────────────────────────────────

async function main() {
  console.log('PraskForce1 runner starting')
  console.log(`  mode: ${flags.daemon ? 'daemon' : 'one-shot'}`)
  console.log(`  kind filter: ${flags.kind || '(all)'}`)
  console.log(`  supabase: ${SUPABASE_URL}`)

  const cycle = async () => {
    try {
      const n = await processCycle()
      if (n > 0) console.log(`Processed ${n} job(s) this cycle`)
      else if (flags.daemon) console.log('No queued jobs')
    } catch (e) {
      console.error('Cycle error:', e)
    }
  }

  if (flags.daemon) {
    while (true) {
      await cycle()
      await new Promise(r => setTimeout(r, flags.pollInterval))
    }
  } else {
    await cycle()
    process.exit(0)
  }
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
