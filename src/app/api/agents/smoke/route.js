// PraskForce1 — POST /api/agents/smoke
// Launches Chrome, navigates to google.com, screenshots, returns the run.
// No credentials, no recipe — just verifies the engine works end-to-end.

import { NextResponse } from 'next/server'
import { runSmokeTest } from '@/lib/agent-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const run = await runSmokeTest()
    return NextResponse.json({
      ok: run.status === 'success',
      runId: run.id,
      status: run.status,
      durationMs: run.durationMs,
      error: run.error,
      result: run.result,
      events: run.events,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
