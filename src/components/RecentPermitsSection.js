'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { listPermits } from '@/lib/permits'
import { getConfig } from '@/lib/config'
import { FileText, RefreshCw, ExternalLink, Search, ChevronDown, ChevronRight } from 'lucide-react'

function fmtMoney(n) {
  if (n == null) return '—'
  return n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${(n / 1e3).toFixed(0)}K`
}

function fmtDate(s) {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

export default function RecentPermitsSection() {
  const [permits, setPermits] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [portalFilter, setPortalFilter] = useState('all')
  const [expanded, setExpanded] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listPermits({ limit: 500 })
      setPermits(data || [])
    } catch (e) {
      console.warn('Failed to load permits', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Resolve portal_id -> human name from config so the table shows
  // "Miami Beach Civic Access" instead of "mb_civic".
  const portalNameById = useMemo(() => {
    const config = getConfig()
    const map = {}
    for (const p of (config.portals || [])) map[p.id] = p.name
    return map
  }, [])

  const filtered = useMemo(() => {
    let list = permits
    if (portalFilter !== 'all') list = list.filter(p => p.portal_source === portalFilter)
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(p => {
        const hay = [
          p.permit_number,
          p.permit_type,
          p.permit_status,
          p.scope_description,
          p.contractor_name,
          p.applicant_name,
          p.raw_data?.address,
        ].filter(Boolean).join(' ').toLowerCase()
        return hay.includes(s)
      })
    }
    return list
  }, [permits, search, portalFilter])

  const portalOptions = useMemo(() => {
    const ids = [...new Set(permits.map(p => p.portal_source).filter(Boolean))]
    return ids.map(id => ({ id, name: portalNameById[id] || id }))
  }, [permits, portalNameById])

  const totalValue = filtered.reduce((s, p) => s + (p.valuation || 0), 0)

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wider hover:text-gray-900"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <FileText size={14} className="text-gray-400" />
          Recent Permits
          <span className="text-[10px] text-gray-400 font-normal normal-case">
            ({permits.length} total · live from portal scans)
          </span>
        </button>
        <div className="flex items-center gap-2">
          {permits.length > 0 && (
            <span className="text-[10px] text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5 font-medium">Live</span>
          )}
          <button
            onClick={refresh}
            className="p-1.5 text-gray-500 hover:text-amber-600 rounded-lg hover:bg-gray-100"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {expanded && (
        loading ? (
          <div className="text-xs text-gray-400 py-4">Loading…</div>
        ) : permits.length === 0 ? (
          <div className="bg-white rounded-lg border border-dashed border-gray-300 p-6 text-center">
            <FileText size={20} className="mx-auto text-gray-300 mb-2" />
            <p className="text-xs text-gray-500 mb-1">No permits yet</p>
            <p className="text-[11px] text-gray-400">Run a portal scan above and paste the results. Permits from the response will populate this table automatically.</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg border border-gray-200 px-3 py-2 mb-2 flex items-center gap-3">
              <Search size={12} className="text-gray-400" />
              <input
                type="text"
                placeholder="Search permit #, type, contractor, address..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 text-xs outline-none placeholder:text-gray-300"
              />
              <select
                value={portalFilter}
                onChange={e => setPortalFilter(e.target.value)}
                className="text-[11px] border border-gray-200 rounded px-2 py-1 outline-none bg-white"
              >
                <option value="all">All portals</option>
                {portalOptions.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <span className="text-[10px] text-gray-400">{filtered.length} shown · {fmtMoney(totalValue)}</span>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-[10px] font-semibold text-gray-500 uppercase">
                    <th className="py-2 px-3 text-left">Permit #</th>
                    <th className="py-2 px-3 text-left">Filed</th>
                    <th className="py-2 px-3 text-left">Address</th>
                    <th className="py-2 px-3 text-left">Type</th>
                    <th className="py-2 px-3 text-left">Scope</th>
                    <th className="py-2 px-3 text-left">Contractor</th>
                    <th className="py-2 px-3 text-right">Valuation</th>
                    <th className="py-2 px-3 text-left">Portal</th>
                    <th className="py-2 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const address = p.raw_data?.address
                    const link = p.raw_data?.raw_link
                    return (
                      <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                        <td className="py-2 px-3 font-mono text-gray-700">{p.permit_number || '—'}</td>
                        <td className="py-2 px-3 text-gray-500">{fmtDate(p.date_filed)}</td>
                        <td className="py-2 px-3 text-gray-800 truncate max-w-48">{address || '—'}</td>
                        <td className="py-2 px-3 text-gray-600 truncate max-w-32">{p.permit_type || '—'}</td>
                        <td className="py-2 px-3 text-gray-500 truncate max-w-48">{p.scope_description || '—'}</td>
                        <td className="py-2 px-3 text-gray-600 truncate max-w-32">{p.contractor_name || '—'}</td>
                        <td className="py-2 px-3 text-right font-mono text-gray-700">{fmtMoney(p.valuation)}</td>
                        <td className="py-2 px-3 text-gray-500 truncate max-w-32">{portalNameById[p.portal_source] || p.portal_source || '—'}</td>
                        <td className="py-2 px-3">
                          {link && (
                            <a href={link} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-amber-600">
                              <ExternalLink size={11} />
                            </a>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )
      )}
    </div>
  )
}
