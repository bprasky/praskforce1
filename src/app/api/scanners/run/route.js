// PraskForce1 — Scanner run API.
//
// POST /api/scanners/run
// Body:
//   {
//     scanner: 'miami_beach' | 'coral_gables' | 'miami_dade' | 'all',
//     credentials: { username, password, url? }   // optional, per-scanner
//                                                  // omit for portals
//                                                  // that don't require login
//     lookbackDays?: number
//     trigger?: 'manual' | 'scheduled'
//   }
//
// For scanner='all' we run each scanner sequentially. A halt in one
// does NOT stop the rest — each gets its own workflow_runs row.
//
// Returns: { runs: [{ scanner, run_id, status, halted_at, summary, steps }] }

import { NextResponse } from 'next/server'
import { runScanner } from '@/lib/scanner-runner.js'
import { getScanner, listScanners } from '@/lib/scanners/index.js'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req) {
  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }

  const { scanner, credentialsByScanner = {}, credentials = null, lookbackDays, trigger = 'manual' } = body || {}
  if (!scanner) return NextResponse.json({ error: 'scanner_required' }, { status: 400 })

  // Build the list of scanners to run.
  const scanners = scanner === 'all'
    ? listScanners()
    : (() => {
        const s = getScanner(scanner)
        return s ? [s] : []
      })()

  if (scanners.length === 0) {
    return NextResponse.json({ error: 'unknown_scanner', scanner }, { status: 400 })
  }

  const runs = []
  for (const s of scanners) {
    const creds = credentialsByScanner[s.id] || credentials || null
    if (s.requiresLogin && (!creds?.username || !creds?.password)) {
      runs.push({
        scanner: s.id,
        run_id: null,
        status: 'failed',
        halted_at: { stepKey: 'login', stepIndex: 0 },
        summary: { error: `${s.label} requires credentials but none were provided. Set them in Configuration → Credentials.` },
        steps: [],
      })
      continue
    }

    try {
      const result = await runScanner({
        workflowKey: s.workflowKey,
        steps: s.steps,
        trigger,
        ctx: {
          credentials: creds,
          lookbackDays: lookbackDays || 30,
          scannerId: s.id,
          portalId: s.portalId,
        },
      })
      runs.push({ scanner: s.id, ...result })
    } catch (e) {
      runs.push({
        scanner: s.id,
        run_id: null,
        status: 'failed',
        halted_at: { stepKey: 'launch', stepIndex: -1 },
        summary: { error: e.message },
        steps: [],
      })
    }
  }

  return NextResponse.json({ runs })
}

export async function GET() {
  // List available scanners — used by the Leads dropdown to render the menu.
  return NextResponse.json({
    scanners: listScanners().map(s => ({
      id: s.id,
      label: s.label,
      workflowKey: s.workflowKey,
      portalId: s.portalId,
      requiresLogin: s.requiresLogin,
      credentialKey: s.credentialKey,
    })),
  })
}
