// PraskForce1 — Permits
//
// CRUD for the permits table. Consumed by the Leads page to render
// real permit activity from portal scan results. Falls back silently
// to an empty list when the database is empty, so the UI can show its
// own empty state or demo data.
//
// Upserts by (portal_id + permit_number) so re-running a scan doesn't
// duplicate rows — it only adds new permits and updates existing ones.

import { getSupabase } from '@/lib/supabase'

const LS_KEY = 'pf1_permits'

// ── localStorage fallback ────────────────────────────────────────────

function lsList() {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}

function lsSave(list) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list))
  } catch (e) {
    throw new Error('Permits exceeded localStorage quota. Connect Supabase for larger permit history.')
  }
}

// ── Public CRUD ──────────────────────────────────────────────────────

export async function listPermits(filter = {}) {
  const sb = getSupabase()
  if (sb) {
    try {
      let q = sb.from('permits').select('*').order('date_filed', { ascending: false, nullsFirst: false })
      if (filter.portal_source) q = q.eq('portal_source', filter.portal_source)
      if (filter.property_id) q = q.eq('property_id', filter.property_id)
      if (filter.limit) q = q.limit(filter.limit)
      const { data, error } = await q
      if (error) throw error
      return data || []
    } catch (e) {
      console.warn('Supabase listPermits failed, falling back to localStorage', e)
    }
  }
  let list = lsList()
  if (filter.portal_source) list = list.filter(p => p.portal_source === filter.portal_source)
  if (filter.limit) list = list.slice(0, filter.limit)
  return list.sort((a, b) => (b.date_filed || '').localeCompare(a.date_filed || ''))
}

/**
 * Upsert permits from a scan result. Stable id is derived from
 * portal_id + permit_number so re-runs deduplicate naturally.
 * Permits without a permit_number get a random id (less common,
 * usually portal structure issues — still worth persisting).
 */
export async function upsertPermits(permits) {
  if (!permits?.length) return { inserted: 0, updated: 0 }

  const stamped = permits.map(p => {
    const stableId = p.permit_number && p.portal_id
      ? `prm_${p.portal_id}_${String(p.permit_number).replace(/[^a-zA-Z0-9]/g, '')}`
      : p.id || `prm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    return {
      id: stableId,
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
      portal_source: p.portal_id || p.portal_source || null,
      // Denormalized address lives in raw_data so we don't need to
      // modify the permits schema. The Leads page reads it from there.
      raw_data: {
        ...(p.raw_data || {}),
        address: p.address || p.raw_data?.address || null,
        raw_link: p.raw_link || p.raw_data?.raw_link || null,
      },
      scanned_at: p.scanned_at || new Date().toISOString(),
    }
  })

  const sb = getSupabase()
  if (sb) {
    try {
      // Supabase's `permits` table uses a uuid primary key in the existing
      // schema, so we can't upsert by our text id. Strip the id and let
      // Postgres generate a uuid. Dedup by (portal_source, permit_number)
      // via a delete-then-insert pattern to stay simple.
      const portalSources = [...new Set(stamped.map(p => p.portal_source).filter(Boolean))]
      const permitNumbers = stamped.map(p => p.permit_number).filter(Boolean)
      if (portalSources.length && permitNumbers.length) {
        // Remove existing rows that will be re-inserted
        await sb
          .from('permits')
          .delete()
          .in('portal_source', portalSources)
          .in('permit_number', permitNumbers)
      }
      const insertRows = stamped.map(({ id, ...rest }) => rest)
      const { data, error } = await sb.from('permits').insert(insertRows).select()
      if (error) throw error
      return { inserted: data?.length || 0, updated: 0 }
    } catch (e) {
      console.warn('Supabase upsertPermits failed, falling back to localStorage', e)
    }
  }

  // localStorage merge-by-id
  const existing = lsList()
  const byId = {}
  for (const p of existing) byId[p.id] = p
  let inserted = 0
  let updated = 0
  for (const p of stamped) {
    if (byId[p.id]) updated++
    else inserted++
    byId[p.id] = { ...byId[p.id], ...p }
  }
  lsSave(Object.values(byId))
  return { inserted, updated }
}

export async function deleteAllPermits() {
  const sb = getSupabase()
  if (sb) {
    try {
      const { error } = await sb.from('permits').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (error) throw error
      return true
    } catch (e) {
      console.warn('Supabase deleteAllPermits failed, falling back to localStorage', e)
    }
  }
  lsSave([])
  return true
}
