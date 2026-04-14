// PraskForce1 — POST /api/agents/run
// Body: { taskId: string, credentials: { username, password, url? } }
// Returns: { runId } immediately. Run executes async; poll /api/agents/run/[runId].

import { NextResponse } from 'next/server'
import { startRun } from '@/lib/agent-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req) {
  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { taskId, credentials } = body || {}
  if (!taskId) {
    return NextResponse.json({ ok: false, error: 'taskId is required' }, { status: 400 })
  }

  try {
    const { runId } = startRun({ taskId, credentials })
    return NextResponse.json({ ok: true, runId })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 })
  }
}
