'use client'
import { useState, useEffect, useRef } from 'react'
import { parseCSV, listUploads, createUpload, deleteUpload, UPLOAD_KINDS } from '@/lib/uploads'
import { Upload, FileText, Trash2, Check, AlertTriangle, Database, X, FileSpreadsheet } from 'lucide-react'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function DataUploadTab() {
  const [uploads, setUploads] = useState([])
  const [loading, setLoading] = useState(true)
  const [staged, setStaged] = useState(null) // { file, headers, rows, name, kind, description }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [lastSeedResult, setLastSeedResult] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => { refresh() }, [])

  async function refresh() {
    setLoading(true)
    try {
      const list = await listUploads()
      setUploads(list)
    } catch (e) {
      setError('Failed to load uploads: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleFile(file) {
    if (!file) return
    setError(null)
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Only .csv files are supported for now. Export from StoneProfits → Download as CSV.')
      return
    }
    try {
      const text = await file.text()
      const { headers, rows } = parseCSV(text)
      if (rows.length === 0) {
        setError('CSV looks empty — no data rows found after the header line.')
        return
      }
      setStaged({
        file,
        size: file.size,
        headers,
        rows,
        name: file.name.replace(/\.csv$/i, ''),
        kind: 'clients',
        description: '',
      })
    } catch (e) {
      setError('Failed to parse CSV: ' + e.message)
    }
  }

  async function handleSave() {
    if (!staged) return
    setSaving(true)
    setError(null)
    setLastSeedResult(null)
    try {
      const result = await createUpload({
        name: staged.name,
        kind: staged.kind,
        description: staged.description,
        headers: staged.headers,
        rows: staged.rows,
      })
      if (result?.seed_result) setLastSeedResult(result.seed_result)
      if (result?.seed_error) setError('Seeding failed: ' + result.seed_error)
      setStaged(null)
      if (fileRef.current) fileRef.current.value = ''
      await refresh()
    } catch (e) {
      setError('Failed to save upload: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this upload? Agents will no longer be able to query it.')) return
    try {
      await deleteUpload(id)
      await refresh()
    } catch (e) {
      setError('Failed to delete: ' + e.message)
    }
  }

  return (
    <>
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Bulk Data Upload</h3>
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          Drop in CSVs from StoneProfits, Outlook, or anywhere else to seed the database.
          Agents use these uploads as the baseline for delta detection — much cheaper than
          populating from scratch via browser automation. Rows are stored in Supabase when
          connected, localStorage otherwise.
        </p>

        {/* Drop zone */}
        {!staged && (
          <div
            onDragOver={e => { e.preventDefault() }}
            onDrop={e => {
              e.preventDefault()
              const file = e.dataTransfer.files?.[0]
              if (file) handleFile(file)
            }}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-300 hover:border-amber-400 rounded-lg p-8 text-center cursor-pointer transition-colors bg-white"
          >
            <Upload size={28} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-700 mb-1">Drop a CSV here or click to browse</p>
            <p className="text-[11px] text-gray-400">StoneProfits exports, contact lists, historical quotes, IG watchlists</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => handleFile(e.target.files?.[0])}
            />
          </div>
        )}

        {/* Staged preview */}
        {staged && (
          <div className="bg-white border border-amber-200 rounded-lg p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                  <FileSpreadsheet size={18} className="text-amber-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">{staged.file.name}</div>
                  <div className="text-[11px] text-gray-500">
                    {staged.rows.length.toLocaleString()} rows · {staged.headers.length} columns · {formatBytes(staged.size)}
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setStaged(null); if (fileRef.current) fileRef.current.value = '' }}
                className="text-gray-300 hover:text-red-500"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <label className="block">
                <span className="text-[11px] font-medium text-gray-600">Name</span>
                <input
                  value={staged.name}
                  onChange={e => setStaged({ ...staged, name: e.target.value })}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-gray-600">Kind</span>
                <select
                  value={staged.kind}
                  onChange={e => setStaged({ ...staged, kind: e.target.value })}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400 bg-white"
                >
                  {UPLOAD_KINDS.map(k => (
                    <option key={k.id} value={k.id}>{k.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block mb-3">
              <span className="text-[11px] font-medium text-gray-600">Description</span>
              <textarea
                value={staged.description}
                onChange={e => setStaged({ ...staged, description: e.target.value })}
                rows={2}
                placeholder="What's in this file? e.g. 'StoneProfits client list export, Dec 2025 — includes all active accounts with contact info'"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400 leading-relaxed"
              />
            </label>

            {/* Column preview */}
            <div className="mb-3">
              <div className="text-[11px] font-medium text-gray-600 mb-1.5">Detected columns</div>
              <div className="flex flex-wrap gap-1.5">
                {staged.headers.map((h, i) => (
                  <span key={i} className="text-[10px] font-mono bg-gray-50 border border-gray-200 text-gray-600 px-2 py-0.5 rounded">
                    {h || `col_${i}`}
                  </span>
                ))}
              </div>
            </div>

            {/* Row preview */}
            <div className="mb-4">
              <div className="text-[11px] font-medium text-gray-600 mb-1.5">First 3 rows</div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-gray-200">
                      {staged.headers.slice(0, 6).map((h, i) => (
                        <th key={i} className="px-2 py-1.5 text-left font-semibold text-gray-500 truncate max-w-32">{h}</th>
                      ))}
                      {staged.headers.length > 6 && <th className="px-2 py-1.5 text-left text-gray-400">+{staged.headers.length - 6} more</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {staged.rows.slice(0, 3).map((r, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0">
                        {staged.headers.slice(0, 6).map((h, j) => (
                          <td key={j} className="px-2 py-1 text-gray-700 truncate max-w-32">{r[h] || '—'}</td>
                        ))}
                        {staged.headers.length > 6 && <td className="px-2 py-1 text-gray-400">...</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${saving ? 'bg-gray-200 text-gray-500' : 'bg-amber-500 text-white hover:bg-amber-600'}`}
              >
                {saving ? <>Saving...</> : <><Check size={14} /> Save Upload</>}
              </button>
              <button
                onClick={() => { setStaged(null); if (fileRef.current) fileRef.current.value = '' }}
                className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {lastSeedResult && !error && (
          <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Check size={14} className="text-green-600 mt-0.5 shrink-0" />
              <div className="text-xs text-green-800">
                {lastSeedResult.kind === 'clients' && (
                  <>Seeded <strong>{lastSeedResult.firms}</strong> firms and <strong>{lastSeedResult.contacts}</strong> contacts on the Accounts tab.</>
                )}
                {lastSeedResult.kind === 'quotes' && (
                  <>Seeded <strong>{lastSeedResult.quotes}</strong> quotes {lastSeedResult.linkedToFirm > 0 && <>({lastSeedResult.linkedToFirm} auto-linked to firms)</>}. View them on the Pipeline tab.</>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Upload list */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Stored Uploads</h3>
        <p className="text-xs text-gray-500 mb-4">Datasets available to agents for cross-reference and delta detection.</p>

        {loading ? (
          <div className="text-xs text-gray-400">Loading...</div>
        ) : uploads.length === 0 ? (
          <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-6 text-center">
            <Database size={24} className="mx-auto text-gray-300 mb-2" />
            <p className="text-xs text-gray-500">No uploads yet. Drop a CSV above to seed the database.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {uploads.map(u => {
              const kind = UPLOAD_KINDS.find(k => k.id === u.kind) || { label: u.kind, desc: '' }
              return (
                <div key={u.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                    <FileText size={16} className="text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-gray-900 truncate">{u.name}</span>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                        {kind.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {(u.row_count || 0).toLocaleString()} rows · {(u.headers || []).length} cols · uploaded {formatDate(u.uploaded_at)}
                    </div>
                    {u.description && (
                      <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">{u.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(u.id)}
                    className="text-gray-300 hover:text-red-500 shrink-0"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
