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
 * Dispatches to per-portal scrapers registered in scripts/scrapers/
 * by portal_id. Portals without a registered scraper are marked
 * "skipped" with a clear error, so the UI knows to offer the
 * Claude-in-Chrome copy-paste fallback for them.
 *
 * After scrapers run, this handler writes results directly to the
 * scan_log and permits tables in Supabase — the same way the UI's
 * ingestScanResults does when processing a copy-paste paste-back,
 * but implemented server-side since the runner has its own Supabase
 * client.
 *
 * Contract returned (matches ingestScanResults input shape):
 *   {
 *     portal_results: [{ portal_id, status, permits_found, new_permits, error, summary }],
 *     permits: [...]
 *   }
 */
async function handlePortalScan(job) {
  const { getScraper, hasScraper } = require('./scrapers')
  const portalIds = job.payload?.portal_ids || []
  const filters = job.payload?.filters || {}

  console.log(`  [portal_scan] processing ${portalIds.length} portal(s): ${portalIds.join(', ')}`)

  const portalResults = []
  const allPermits = []

  for (const portalId of portalIds) {
    if (!hasScraper(portalId)) {
      console.log(`    ${portalId}: no scraper registered, skipping`)
      portalResults.push({
        portal_id: portalId,
        status: 'skipped',
        permits_found: 0,
        new_permits: 0,
        error: 'No automated scraper registered for this portal. Use the Claude-in-Chrome copy-paste flow on /leads for manual scans.',
        summary: null,
      })
      continue
    }

    console.log(`    ${portalId}: running scraper...`)
    const scraper = getScraper(portalId)
    try {
      const result = await scraper({
        filters,
        logger: msg => console.log(`      ${msg}`),
      })
      portalResults.push({
        portal_id: portalId,
        status: result.status,
        permits_found: result.permits_found || result.permits?.length || 0,
        new_permits: result.new_permits || 0,
        error: result.error,
        summary: result.summary,
      })
      if (Array.isArray(result.permits)) {
        allPermits.push(...result.permits)
      }
      console.log(`    ${portalId}: ${result.status} (${result.permits_found || 0} permits)`)
    } catch (e) {
      console.error(`    ${portalId}: scraper threw —`, e.message)
      portalResults.push({
        portal_id: portalId,
        status: 'failed',
        permits_found: 0,
        new_permits: 0,
        error: `Scraper threw: ${e.message}`,
        summary: null,
      })
    }
  }

  // Write scan_log rows and upsert permits directly to Supabase. This
  // duplicates some logic from src/lib/portal-scans.js — acceptable
  // for now since the lib uses the browser Supabase client and we're
  // in Node. Can be refactored into a shared module later.
  const nowIso = new Date().toISOString()
  const scanLogRows = portalResults.map(r => ({
    portal: r.portal_id,
    portal_id: r.portal_id,
    scan_type: 'portal_scan',
    status: r.status,
    result_summary: r.summary || null,
    error_details: (r.status === 'failed' || r.status === 'partial' || r.status === 'skipped')
      ? (r.error || 'No error detail provided by scraper')
      : null,
    permits_found: r.permits_found || 0,
    new_permits: r.new_permits || 0,
    found_new_data: (r.new_permits || 0) > 0,
    scanned_at: nowIso,
  }))

  if (scanLogRows.length > 0) {
    const { error: logErr } = await sb.from('scan_log').insert(scanLogRows)
    if (logErr) console.error('Failed to write scan_log rows:', logErr.message)
    else console.log(`    wrote ${scanLogRows.length} scan_log rows`)
  }

  if (allPermits.length > 0) {
    // Dedup by (portal_source, permit_number) via delete-then-insert
    const portalSources = [...new Set(allPermits.map(p => p.portal_id).filter(Boolean))]
    const permitNumbers = allPermits.map(p => p.permit_number).filter(Boolean)
    if (portalSources.length && permitNumbers.length) {
      await sb.from('permits').delete()
        .in('portal_source', portalSources)
        .in('permit_number', permitNumbers)
    }
    const insertRows = allPermits.map(p => ({
      permit_number: p.permit_number || null,
      permit_type: p.permit_type || null,
      permit_status: p.permit_status || null,
      date_filed: p.date_filed || null,
      date_issued: p.date_issued || null,
      valuation: typeof p.valuation === 'number' ? p.valuation : null,
      scope_description: p.scope_description || null,
      applicant_name: p.applicant_name || null,
      contractor_name: p.contractor_name || null,
      contractor_license: p.contractor_license || null,
      architect_name: p.architect_name || null,
      architect_license: p.architect_license || null,
      engineer_name: p.engineer_name || null,
      arca_tier: p.arca_tier || null,
      portal_source: p.portal_id || null,
      raw_data: {
        address: p.address || null,
        raw_link: p.raw_link || null,
      },
      scanned_at: nowIso,
    }))
    const { error: permErr } = await sb.from('permits').insert(insertRows)
    if (permErr) console.error('Failed to insert permits:', permErr.message)
    else console.log(`    inserted ${insertRows.length} permit rows`)
  }

  return {
    portal_results: portalResults,
    permits_count: allPermits.length,
  }
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
