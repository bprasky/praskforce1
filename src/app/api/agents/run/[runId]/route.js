// PraskForce1 — GET /api/agents/run/[runId]
// Returns the live state of a run (status + events + result).
// UI polls this every ~1s while a run is in progress.

import { NextResponse } from 'next/server'
import { getRun } from '@/lib/agent-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req, { params }) {
  const { runId } = await params
  const run = getRun(runId)
  if (!run) {
    return NextResponse.json({ ok: false, error: 'Run not found' }, { status: 404 })
  }
  return NextResponse.json({
    ok: true,
    runId: run.id,
    taskId: run.taskId,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.durationMs,
    error: run.error,
    result: run.result,
    events: run.events,
  })
}
