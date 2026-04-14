// PraskForce1 — Quotes
//
// Seeded from kind=quotes uploads (StoneProfits exports), kept in sync
// via periodic delta scans. Each quote can be linked to a firm, a
// meeting, or a property after the fact.
//
// Supabase-first with localStorage fallback, same pattern as the other
// libs.

import { getSupabase } from '@/lib/supabase'
import { listFirms } from '@/lib/accounts'

const LS_KEY = 'pf1_quotes'

export const QUOTE_STATUS = {
  draft: { label: 'Draft', color: 'text-gray-600', bg: 'bg-gray-100' },
  sent: { label: 'Sent', color: 'text-blue-600', bg: 'bg-blue-50' },
  accepted: { label: 'Accepted', color: 'text-green-600', bg: 'bg-green-50' },
  expired: { label: 'Expired', color: 'text-amber-600', bg: 'bg-amber-50' },
  cancelled: { label: 'Cancelled', color: 'text-red-600', bg: 'bg-red-50' },
  unknown: { label: 'Unknown', color: 'text-gray-500', bg: 'bg-gray-100' },
}

// ── localStorage fallback ────────────────────────────────────────────

function lsList() {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}

function lsSave(list) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list))
  } catch (e) {
    throw new Error('Quotes exceeded localStorage quota. Connect Supabase to handle more quotes.')
  }
}

// ── Public CRUD ──────────────────────────────────────────────────────

export async function listQuotes(filter = {}) {
  const sb = getSupabase()
  if (sb) {
    try {
      let q = sb.from('quotes').select('*').order('quote_date', { ascending: false, nullsFirst: false })
      if (filter.firm_id) q = q.eq('firm_id', filter.firm_id)
      if (filter.meeting_id) q = q.eq('meeting_id', filter.meeting_id)
      if (filter.status) q = q.eq('status', filter.status)
      const { data, error } = await q
      if (error) throw error
      return data || []
    } catch (e) {
      console.warn('Supabase listQuotes failed, falling back to localStorage', e)
    }
  }
  let list = lsList()
  if (filter.firm_id) list = list.filter(q => q.firm_id === filter.firm_id)
  if (filter.meeting_id) list = list.filter(q => q.meeting_id === filter.meeting_id)
  if (filter.status) list = list.filter(q => q.status === filter.status)
  return list.sort((a, b) => (b.quote_date || '').localeCompare(a.quote_date || ''))
}

export async function createQuotes(quotes) {
  if (!quotes?.length) return []
  const stamped = quotes.map(q => ({
    id: q.id || `qt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    quote_number: q.quote_number || null,
    quote_date: q.quote_date || null,
    customer_name: q.customer_name || null,
    contact_name: q.contact_name || null,
    project_name: q.project_name || null,
    address: q.address || null,
    materials: q.materials || null,
    total_value: q.total_value ?? null,
    status: q.status || 'unknown',
    firm_id: q.firm_id || null,
    meeting_id: q.meeting_id || null,
    property_id: q.property_id || null,
    source: q.source || 'manual',
    source_upload_id: q.source_upload_id || null,
    raw_data: q.raw_data || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))

  const sb = getSupabase()
  if (sb) {
    try {
      const { data, error } = await sb.from('quotes').upsert(stamped, { onConflict: 'id' }).select()
      if (error) throw error
      return data || []
    } catch (e) {
      console.warn('Supabase createQuotes failed, falling back to localStorage', e)
    }
  }

  const existing = lsList()
  const byId = {}
  for (const q of existing) byId[q.id] = q
  for (const q of stamped) byId[q.id] = { ...byId[q.id], ...q }
  lsSave(Object.values(byId))
  return stamped
}

export async function updateQuote(id, updates) {
  const next = { ...updates, updated_at: new Date().toISOString() }
  const sb = getSupabase()
  if (sb) {
    try {
      const { data, error } = await sb.from('quotes').update(next).eq('id', id).select().single()
      if (error) throw error
      return data
    } catch (e) {
      console.warn('Supabase updateQuote failed, falling back to localStorage', e)
    }
  }
  const list = lsList()
  const idx = list.findIndex(q => q.id === id)
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...next }
    lsSave(list)
    return list[idx]
  }
  return null
}

export async function deleteQuote(id) {
  const sb = getSupabase()
  if (sb) {
    try {
      const { error } = await sb.from('quotes').delete().eq('id', id)
      if (error) throw error
      return true
    } catch (e) {
      console.warn('Supabase deleteQuote failed, falling back to localStorage', e)
    }
  }
  lsSave(lsList().filter(q => q.id !== id))
  return true
}

// ── Utilities ────────────────────────────────────────────────────────

function findColumn(headers, ...candidates) {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const c of candidates) {
    const match = headers.find(h => norm(h) === norm(c))
    if (match) return match
  }
  for (const c of candidates) {
    const match = headers.find(h => norm(h).includes(norm(c)))
    if (match) return match
  }
  return null
}

function parseMoney(v) {
  if (v == null || v === '') return null
  const cleaned = String(v).replace(/[$,\s]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseDate(v) {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function normalizeStatus(v) {
  if (!v) return 'unknown'
  const s = String(v).toLowerCase().trim()
  if (s.includes('draft')) return 'draft'
  if (s.includes('sent') || s.includes('open')) return 'sent'
  if (s.includes('accept') || s.includes('won') || s.includes('closed won')) return 'accepted'
  if (s.includes('expir') || s.includes('stale')) return 'expired'
  if (s.includes('cancel') || s.includes('lost') || s.includes('dead')) return 'cancelled'
  return 'unknown'
}

// Try to match a quote's customer_name to an existing firm by fuzzy
// comparison. Returns the firm_id if found, null otherwise.
async function findFirmIdForCustomer(customerName, firms) {
  if (!customerName) return null
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const target = norm(customerName)
  if (!target) return null
  for (const f of firms) {
    if (norm(f.name) === target) return f.id
  }
  // Substring fallback
  for (const f of firms) {
    if (norm(f.name).includes(target) || target.includes(norm(f.name))) return f.id
  }
  return null
}

// ── Seeding from uploads ─────────────────────────────────────────────

/**
 * Turn a kind=quotes upload into quote records. Tries to link each
 * quote to an existing firm by fuzzy name match — no LLM call, just
 * string comparison.
 */
export async function seedQuotesFromRows(rows, upload) {
  if (!rows?.length) return { quotes: 0, linkedToFirm: 0 }

  const headers = Object.keys(rows[0] || {})
  const cols = {
    number: findColumn(headers, 'quote number', 'quote #', 'quote_number', 'number', 'quote id'),
    date: findColumn(headers, 'quote date', 'date', 'created'),
    customer: findColumn(headers, 'customer', 'customer name', 'client', 'account', 'company'),
    contact: findColumn(headers, 'contact', 'contact name', 'attention'),
    project: findColumn(headers, 'project', 'project name', 'job name'),
    address: findColumn(headers, 'address', 'site address', 'job address', 'property'),
    materials: findColumn(headers, 'materials', 'products', 'items', 'description'),
    total: findColumn(headers, 'total', 'total value', 'amount', 'quote total', 'grand total'),
    status: findColumn(headers, 'status', 'state', 'quote status'),
  }

  const firms = await listFirms()

  const quotes = []
  let linkedCount = 0

  for (const row of rows) {
    const customerName = cols.customer ? row[cols.customer] : null
    const firmId = await findFirmIdForCustomer(customerName, firms)
    if (firmId) linkedCount++

    const quoteNumber = cols.number ? row[cols.number] : null
    // Use quote_number as stable id when available so re-uploads update in place
    const id = quoteNumber ? `qt_${String(quoteNumber).replace(/[^a-zA-Z0-9]/g, '')}` : undefined

    quotes.push({
      id,
      quote_number: quoteNumber,
      quote_date: cols.date ? parseDate(row[cols.date]) : null,
      customer_name: customerName,
      contact_name: cols.contact ? row[cols.contact] : null,
      project_name: cols.project ? row[cols.project] : null,
      address: cols.address ? row[cols.address] : null,
      materials: cols.materials ? row[cols.materials] : null,
      total_value: cols.total ? parseMoney(row[cols.total]) : null,
      status: cols.status ? normalizeStatus(row[cols.status]) : 'unknown',
      firm_id: firmId,
      source: 'upload',
      source_upload_id: upload?.id || null,
      raw_data: row,
    })
  }

  await createQuotes(quotes)

  return { quotes: quotes.length, linkedToFirm: linkedCount }
}
