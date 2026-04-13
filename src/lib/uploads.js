// PraskForce1 — Bulk data uploads (CSVs seeded into the database)
//
// Design notes:
// - Browser-based CSV parser (no deps). Handles quoted fields, escaped quotes,
//   and CRLF line endings. Good enough for StoneProfits exports and similar.
// - Uploads are stored in Supabase when available, localStorage otherwise.
// - An "upload" is metadata (name, kind, description, column list, row count,
//   uploaded_at) plus the raw rows as JSON. Downstream agents query rows by
//   upload_id or kind so delta checks are cheap.
// - `kind` is a loose enum — callers can add new kinds without a migration.
//   Known kinds seed the UI dropdown but custom values are allowed.

import { getSupabase } from '@/lib/supabase'

const UPLOADS_KEY = 'pf1_uploads'
const ROWS_KEY_PREFIX = 'pf1_upload_rows_'

export const UPLOAD_KINDS = [
  { id: 'clients', label: 'Clients', desc: 'Client list from StoneProfits or similar CRM' },
  { id: 'contacts', label: 'Contacts', desc: 'Individual contacts (designers, architects, GCs)' },
  { id: 'properties', label: 'Properties / Projects', desc: 'Past or current project addresses' },
  { id: 'quotes', label: 'Historical Quotes', desc: 'Prior quotes with materials and pricing' },
  { id: 'email_history', label: 'Email History', desc: 'Exported email correspondence' },
  { id: 'instagram_watchlist', label: 'Instagram Watchlist', desc: 'IG handles to monitor daily' },
  { id: 'other', label: 'Other', desc: 'Anything else — provide a description' },
]

// ── CSV Parser ───────────────────────────────────────────────────────────────

export function parseCSV(text) {
  if (!text) return { headers: [], rows: [] }
  // Normalize line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  const rows = []
  let field = ''
  let row = []
  let inQuotes = false

  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i]
    if (inQuotes) {
      if (c === '"' && normalized[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        inQuotes = false
      } else {
        field += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === ',') {
        row.push(field)
        field = ''
      } else if (c === '\n') {
        row.push(field)
        rows.push(row)
        field = ''
        row = []
      } else {
        field += c
      }
    }
  }
  // Flush last field/row if file doesn't end with newline
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // First non-empty row is headers
  const headerRow = rows.shift() || []
  const headers = headerRow.map(h => (h || '').trim())

  const objects = rows
    .filter(r => r.length > 0 && r.some(cell => (cell || '').trim() !== ''))
    .map(r => {
      const obj = {}
      headers.forEach((h, idx) => {
        obj[h] = (r[idx] ?? '').trim()
      })
      return obj
    })

  return { headers, rows: objects }
}

// ── Storage (localStorage fallback) ──────────────────────────────────────────

function lsGetIndex() {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(UPLOADS_KEY) || '[]') } catch { return [] }
}

function lsSetIndex(list) {
  localStorage.setItem(UPLOADS_KEY, JSON.stringify(list))
}

function lsGetRows(id) {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(ROWS_KEY_PREFIX + id) || '[]') } catch { return [] }
}

function lsSetRows(id, rows) {
  try {
    localStorage.setItem(ROWS_KEY_PREFIX + id, JSON.stringify(rows))
  } catch (e) {
    // QuotaExceededError — CSV too large for localStorage
    throw new Error('CSV is too large for local storage (~5MB limit). Connect Supabase in Configuration → Database to handle larger files.')
  }
}

function lsDelete(id) {
  const list = lsGetIndex().filter(u => u.id !== id)
  lsSetIndex(list)
  localStorage.removeItem(ROWS_KEY_PREFIX + id)
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function listUploads() {
  const sb = getSupabase()
  if (sb) {
    try {
      const { data, error } = await sb
        .from('uploads')
        .select('id, name, kind, description, row_count, headers, uploaded_at')
        .order('uploaded_at', { ascending: false })
      if (error) throw error
      return data || []
    } catch (e) {
      console.warn('Supabase listUploads failed, falling back to localStorage', e)
    }
  }
  return lsGetIndex()
}

export async function createUpload({ name, kind, description, headers, rows }) {
  const id = `upl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const record = {
    id,
    name: name || 'Untitled upload',
    kind: kind || 'other',
    description: description || '',
    headers: headers || [],
    row_count: rows?.length || 0,
    uploaded_at: new Date().toISOString(),
  }

  const sb = getSupabase()
  if (sb) {
    try {
      const { error: upErr } = await sb.from('uploads').insert({ ...record, rows })
      if (upErr) throw upErr
      return record
    } catch (e) {
      console.warn('Supabase createUpload failed, falling back to localStorage', e)
    }
  }

  // localStorage fallback
  const list = lsGetIndex()
  list.unshift(record)
  lsSetIndex(list)
  lsSetRows(id, rows)
  return record
}

export async function deleteUpload(id) {
  const sb = getSupabase()
  if (sb) {
    try {
      const { error } = await sb.from('uploads').delete().eq('id', id)
      if (error) throw error
      return true
    } catch (e) {
      console.warn('Supabase deleteUpload failed, falling back to localStorage', e)
    }
  }
  lsDelete(id)
  return true
}

export async function getUploadRows(id) {
  const sb = getSupabase()
  if (sb) {
    try {
      const { data, error } = await sb.from('uploads').select('rows').eq('id', id).single()
      if (error) throw error
      return data?.rows || []
    } catch (e) {
      console.warn('Supabase getUploadRows failed, falling back to localStorage', e)
    }
  }
  return lsGetRows(id)
}
