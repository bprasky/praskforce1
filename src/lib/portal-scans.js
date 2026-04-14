// PraskForce1 — Portal Scans
//
// Surfaces the state of permit portal scraping runs. Every portal in
// config.portals (enabled=true) can be scanned via a Claude-in-Chrome
// agent run. Results come back as structured JSON that maps cleanly
// to scan_log rows.
//
// Core principle: NO SILENT FAILURES. The ingestion code enforces that
// every enabled portal in the scan request gets a corresponding row in
// the result — if it's missing, we write a "failed" row with an
// explicit "not reported by agent" error. The UI treats anything that
// isn't an explicit "success" as a failure and shows it in red.
//
// Supabase-first, localStorage fallback, same pattern as the other libs.

import { getSupabase } from '@/lib/supabase'
import { upsertPermits } from '@/lib/permits'

const LS_KEY = 'pf1_scan_log'

export const SCAN_STATUS = {
  success: { label: 'Success', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
  partial: { label: 'Partial', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  failed: { label: 'Failed', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  skipped: { label: 'Skipped', color: 'text-gray-500', bg: 'bg-gray-100', border: 'border-gray-200' },
  pending: { label: 'Not Yet Run', color: 'text-gray-400', bg: 'bg-gray-50', border: 'border-gray-200' },
}

// ── localStorage fallback ────────────────────────────────────────────────────

function lsList() {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}

function lsSave(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list))
}

// ── Public CRUD ──────────────────────────────────────────────────────────────

export async function listScans(filter = {}) {
  const sb = getSupabase()
  if (sb) {
    try {
      let q = sb.from('scan_log').select('*').order('scanned_at', { ascending: false })
      if (filter.portal_id) q = q.eq('portal_id', filter.portal_id)
      if (filter.status) q = q.eq('status', filter.status)
      if (filter.limit) q = q.limit(filter.limit)
      const { data, error } = await q
      if (error) throw error
      return data || []
    } catch (e) {
      console.warn('Supabase listScans failed, falling back to localStorage', e)
    }
  }
  let list = lsList()
  if (filter.portal_id) list = list.filter(s => s.portal_id === filter.portal_id)
  if (filter.status) list = list.filter(s => s.status === filter.status)
  if (filter.limit) list = list.slice(0, filter.limit)
  return list
}

/**
 * Returns the most recent scan for each distinct portal_id.
 * Used by the UI to show a single row per portal with its current state.
 */
export async function getLatestPerPortal() {
  const all = await listScans({})
  const byPortal = {}
  for (const row of all) {
    if (!byPortal[row.portal_id] || row.scanned_at > byPortal[row.portal_id].scanned_at) {
      byPortal[row.portal_id] = row
    }
  }
  return byPortal
}

export async function createScanRows(rows) {
  if (!rows?.length) return []
  const stamped = rows.map(r => ({
    id: r.id || `scn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    property_id: r.property_id || null,
    portal: r.portal || null,
    portal_id: r.portal_id || null,
    scan_type: r.scan_type || 'portal_scan',
    status: r.status || 'success',
    result_summary: r.result_summary || null,
    error_details: r.error_details || null,
    permits_found: r.permits_found || 0,
    new_permits: r.new_permits || 0,
    found_new_data: (r.new_permits || 0) > 0,
    scanned_at: r.scanned_at || new Date().toISOString(),
  }))

  const sb = getSupabase()
  if (sb) {
    try {
      const insertRows = stamped.map(({ id, ...rest }) => rest)
      const { data, error } = await sb.from('scan_log').insert(insertRows).select()
      if (error) throw error
      return data || []
    } catch (e) {
      console.warn('Supabase createScanRows failed, falling back to localStorage', e)
    }
  }

  const list = [...stamped, ...lsList()]
  lsSave(list)
  return stamped
}

// ── Scan result ingestion ────────────────────────────────────────────────────

/**
 * Parse structured JSON returned from Claude-in-Chrome and write one
 * scan_log row per portal. Missing portals become explicit "failed"
 * rows — this is the "no silent failures" guarantee.
 *
 * Expected shape:
 * {
 *   "portal_results": [
 *     {
 *       "portal_id": "mb_civic",
 *       "portal_name": "Miami Beach Civic Access",
 *       "status": "success" | "partial" | "failed",
 *       "permits_found": 12,
 *       "new_permits": 3,
 *       "error": null | "Login timeout after 3 attempts",
 *       "summary": "Found 12 permits, 3 new since last scan"
 *     },
 *     ...
 *   ],
 *   "permits": [ ...new permit records... ]   // optional, ignored here
 * }
 *
 * @param {Object} parsed - the parsed JSON blob from the agent
 * @param {Array} requestedPortals - the portals we expected results for
 * @returns {Object} { rows, succeeded, failed, missing }
 */
export async function ingestScanResults(parsed, requestedPortals) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Expected a JSON object with a portal_results array')
  }
  const results = Array.isArray(parsed.portal_results) ? parsed.portal_results : null
  if (!results) {
    throw new Error('Missing required "portal_results" array. The agent must report per-portal status.')
  }

  // Index by portal_id for quick lookup
  const byId = {}
  for (const r of results) {
    if (r.portal_id) byId[r.portal_id] = r
  }

  const rows = []
  const seen = new Set()
  const requested = requestedPortals || []
  const nowIso = new Date().toISOString()

  // Walk the REQUESTED list, not the reported list. This is the core
  // of the no-silent-failures guarantee — if a portal was in the scan
  // request and didn't come back, we record it as failed.
  for (const portal of requested) {
    const reported = byId[portal.id]
    seen.add(portal.id)
    if (reported) {
      const status = ['success', 'partial', 'failed', 'skipped'].includes(reported.status) ? reported.status : 'failed'
      rows.push({
        portal: portal.name,
        portal_id: portal.id,
        scan_type: 'portal_scan',
        status,
        result_summary: reported.summary || null,
        error_details: status === 'failed' || status === 'partial' ? (reported.error || 'No error detail provided by agent') : null,
        permits_found: reported.permits_found || 0,
        new_permits: reported.new_permits || 0,
        scanned_at: nowIso,
      })
    } else {
      rows.push({
        portal: portal.name,
        portal_id: portal.id,
        scan_type: 'portal_scan',
        status: 'failed',
        result_summary: null,
        error_details: 'Agent did not report a result for this portal. It may have run out of time, hit a login wall, or silently skipped it. Retry this portal specifically.',
        permits_found: 0,
        new_permits: 0,
        scanned_at: nowIso,
      })
    }
  }

  // Also record any reported portals that weren't in the request
  // (shouldn't happen but better to log than drop)
  for (const r of results) {
    if (r.portal_id && !seen.has(r.portal_id)) {
      rows.push({
        portal: r.portal_name || r.portal_id,
        portal_id: r.portal_id,
        scan_type: 'portal_scan',
        status: 'partial',
        result_summary: r.summary || null,
        error_details: 'Portal reported but was not in scan request — verify portal_id matches config',
        permits_found: r.permits_found || 0,
        new_permits: r.new_permits || 0,
        scanned_at: nowIso,
      })
    }
  }

  const saved = await createScanRows(rows)
  const succeeded = saved.filter(r => r.status === 'success').length
  const failed = saved.filter(r => r.status === 'failed').length
  const partial = saved.filter(r => r.status === 'partial').length
  const missing = saved.filter(r => r.error_details?.includes('did not report')).length

  // Also write the actual permit records the agent returned into the
  // permits table. We don't fail the scan ingestion if this step errors
  // — the scan_log entries are already saved and are the source of
  // truth for "did the scan run?".
  let permitsIngested = { inserted: 0, updated: 0 }
  try {
    const rawPermits = Array.isArray(parsed.permits) ? parsed.permits : []
    if (rawPermits.length > 0) {
      permitsIngested = await upsertPermits(rawPermits)
    }
  } catch (e) {
    console.warn('Failed to upsert permits from scan results:', e)
  }

  return {
    rows: saved,
    succeeded,
    failed,
    partial,
    missing,
    total: saved.length,
    permits_inserted: permitsIngested.inserted,
    permits_updated: permitsIngested.updated,
  }
}
