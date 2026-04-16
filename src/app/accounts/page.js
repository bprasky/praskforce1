'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'
import { listFirms, listFirmContacts, DEMO_ACCOUNTS, deleteFirm } from '@/lib/accounts'
import { listQuotes, QUOTE_STATUS } from '@/lib/quotes'
import { getAccountTreeRollup } from '@/lib/task-tree-stats'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Building2, Users, Mail, Phone, Instagram, Linkedin, Search, ExternalLink, FileText, Upload, Trash2, RefreshCw, Network, Trophy, TrendingDown } from 'lucide-react'

function fmtMoney(n) {
  if (n == null) return '—'
  return n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${(n / 1e3).toFixed(0)}K`
}

function formatDate(s) {
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AccountsPage() {
  const [firms, setFirms] = useState([])
  const [contactsByFirm, setContactsByFirm] = useState({})
  const [quotesByFirm, setQuotesByFirm] = useState({})
  const [treeRollup, setTreeRollup] = useState({})  // { [accountId]: { totalTrees, treesWon, ... } }
  const [openId, setOpenId] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [f, allContacts, allQuotes, rollup] = await Promise.all([
        listFirms(),
        listFirmContacts(),
        listQuotes(),
        getAccountTreeRollup(),
      ])
      setTreeRollup(rollup || {})
      setFirms(f || [])
      const cMap = {}
      for (const c of allContacts || []) {
        if (!cMap[c.firm_id]) cMap[c.firm_id] = []
        cMap[c.firm_id].push(c)
      }
      setContactsByFirm(cMap)
      const qMap = {}
      for (const q of allQuotes || []) {
        if (q.firm_id) {
          if (!qMap[q.firm_id]) qMap[q.firm_id] = []
          qMap[q.firm_id].push(q)
        }
      }
      setQuotesByFirm(qMap)
    } catch (e) {
      console.warn('Failed to load accounts', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const filtered = useMemo(() => {
    if (!search) return firms
    const q = search.toLowerCase()
    return firms.filter(f => {
      if (f.name?.toLowerCase().includes(q)) return true
      if (f.type?.toLowerCase().includes(q)) return true
      if (f.city?.toLowerCase().includes(q)) return true
      const contacts = contactsByFirm[f.id] || []
      if (contacts.some(c => c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q))) return true
      return false
    })
  }, [firms, contactsByFirm, search])

  const stats = useMemo(() => {
    const totalContacts = Object.values(contactsByFirm).reduce((s, arr) => s + arr.length, 0)
    const totalQuotes = Object.values(quotesByFirm).reduce((s, arr) => s + arr.length, 0)
    const totalValue = Object.values(quotesByFirm).reduce((s, arr) => s + arr.reduce((ss, q) => ss + (q.total_value || 0), 0), 0)
    return {
      firms: firms.length,
      contacts: totalContacts,
      quotes: totalQuotes,
      value: totalValue,
    }
  }, [firms, contactsByFirm, quotesByFirm])

  async function handleDelete(id) {
    if (!confirm('Delete this firm and all its contacts? Quotes will be unlinked but kept.')) return
    await deleteFirm(id)
    await refresh()
  }

  const showingDemoFallback = !loading && firms.length === 0

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-56">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Accounts</h1>
            <p className="text-xs text-gray-500">Firms, contacts, and quote history — seeded from your client list uploads</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} className="p-2 text-gray-500 hover:text-amber-600 rounded-lg hover:bg-gray-100" title="Refresh">
              <RefreshCw size={14} />
            </button>
            <a
              href="/settings"
              className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 bg-amber-500 text-white hover:bg-amber-600"
            >
              <Upload size={14} /> Upload Clients CSV
            </a>
          </div>
        </header>

        <div className="p-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { l: 'Firms', v: stats.firms, c: 'text-gray-900' },
              { l: 'Contacts', v: stats.contacts, c: 'text-blue-600' },
              { l: 'Quotes', v: stats.quotes, c: 'text-purple-600' },
              { l: 'Quote Value', v: fmtMoney(stats.value), c: 'text-green-600' },
            ].map((s, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
                <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">{s.l}</div>
                <div className={`text-xl font-bold ${s.c}`}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 mb-4 flex items-center gap-3">
            <Search size={14} className="text-gray-400" />
            <input
              type="text"
              placeholder="Search firms, contacts, emails, cities..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 text-sm outline-none placeholder:text-gray-300"
            />
            <span className="text-xs text-gray-400">{filtered.length} results</span>
          </div>

          {/* Empty / demo state */}
          {showingDemoFallback && (
            <div className="bg-white rounded-lg border border-dashed border-gray-300 p-8 text-center mb-6">
              <Building2 size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-700 mb-1">No firms loaded yet</p>
              <p className="text-xs text-gray-500 mb-4">
                Upload a client list CSV to seed your accounts. Each unique company becomes a firm, and every row becomes a contact under it.
              </p>
              <a
                href="/settings"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600"
              >
                <Upload size={14} /> Go to Data Upload
              </a>
              {DEMO_ACCOUNTS?.length > 0 && (
                <p className="text-[10px] text-gray-400 mt-4 italic">
                  {DEMO_ACCOUNTS.length} hardcoded demo accounts hidden until you delete them or upload real data
                </p>
              )}
            </div>
          )}

          {/* Firm list */}
          {!showingDemoFallback && filtered.length === 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <p className="text-sm text-gray-500">No firms match your search.</p>
            </div>
          )}

          {!showingDemoFallback && filtered.map(firm => {
            const isOpen = openId === firm.id
            const contacts = contactsByFirm[firm.id] || []
            const quotes = quotesByFirm[firm.id] || []
            const firmValue = quotes.reduce((s, q) => s + (q.total_value || 0), 0)
            const tree = treeRollup[firm.id]
            return (
              <div key={firm.id} className="bg-white rounded-lg border border-gray-200 mb-3 overflow-hidden">
                <div
                  onClick={() => setOpenId(isOpen ? null : firm.id)}
                  className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {isOpen ? <ChevronDown size={16} className="text-gray-400 shrink-0" /> : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
                    <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                      <Building2 size={16} className="text-amber-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{firm.name}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5 flex-wrap">
                        {firm.type && <span className="capitalize">{firm.type}</span>}
                        {firm.city && <><span className="text-gray-300">·</span><span>{firm.city}{firm.state ? `, ${firm.state}` : ''}</span></>}
                        <span className="text-gray-300">·</span>
                        <span>{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</span>
                        {quotes.length > 0 && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span>{quotes.length} quote{quotes.length !== 1 ? 's' : ''}</span>
                          </>
                        )}
                        {tree && tree.totalTrees > 0 && (
                          <>
                            <span className="text-gray-300">·</span>
                            <Link
                              href={`/tasks?view=tree&account=${encodeURIComponent(firm.id)}`}
                              onClick={e => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-amber-700 hover:text-amber-900"
                              title="View task trees for this firm"
                            >
                              <Network size={10} />
                              {tree.totalTrees} tree{tree.totalTrees !== 1 ? 's' : ''}
                              {tree.activeTrees > 0 && <span className="text-blue-700 ml-1">({tree.activeTrees} active)</span>}
                            </Link>
                            {tree.treesWon > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-green-700">
                                <Trophy size={10} /> {tree.treesWon}
                              </span>
                            )}
                            {tree.treesLost > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-red-600">
                                <TrendingDown size={10} /> {tree.treesLost}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {firmValue > 0 && <span className="text-sm font-mono font-semibold text-green-700">{fmtMoney(firmValue)}</span>}
                    {firm.source === 'upload' && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">upload</span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(firm.id) }}
                      className="text-gray-300 hover:text-red-500"
                      title="Delete firm"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-4">
                    {/* Contacts */}
                    <div className="mb-4">
                      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Users size={11} /> Contacts ({contacts.length})
                      </div>
                      {contacts.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No contacts on file</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {contacts.map(c => (
                            <div key={c.id} className="bg-white rounded-lg border border-gray-200 p-3">
                              <div className="text-sm font-semibold text-gray-900">{c.name}</div>
                              {c.title && <div className="text-[11px] text-gray-500 mb-1">{c.title}</div>}
                              <div className="space-y-0.5 text-[11px] text-gray-600">
                                {c.email && (
                                  <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 hover:text-amber-600 truncate">
                                    <Mail size={10} /> {c.email}
                                  </a>
                                )}
                                {c.phone && (
                                  <div className="flex items-center gap-1.5">
                                    <Phone size={10} /> {c.phone}
                                  </div>
                                )}
                                {c.instagram && (
                                  <a href={`https://instagram.com/${c.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-pink-600">
                                    <Instagram size={10} /> {c.instagram}
                                  </a>
                                )}
                                {c.linkedin && (
                                  <a href={c.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-blue-600 truncate">
                                    <Linkedin size={10} /> LinkedIn
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Quotes */}
                    {quotes.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <FileText size={11} /> Quotes ({quotes.length})
                        </div>
                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr className="text-[10px] font-semibold text-gray-500 uppercase">
                                <th className="py-1.5 px-3 text-left">Quote #</th>
                                <th className="py-1.5 px-3 text-left">Date</th>
                                <th className="py-1.5 px-3 text-left">Project</th>
                                <th className="py-1.5 px-3 text-left">Status</th>
                                <th className="py-1.5 px-3 text-right">Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {quotes.map(q => {
                                const st = QUOTE_STATUS[q.status] || QUOTE_STATUS.unknown
                                return (
                                  <tr key={q.id} className="border-b border-gray-100 last:border-0">
                                    <td className="py-1.5 px-3 font-mono text-gray-700">{q.quote_number || '—'}</td>
                                    <td className="py-1.5 px-3 text-gray-600">{formatDate(q.quote_date)}</td>
                                    <td className="py-1.5 px-3 text-gray-700 truncate max-w-48">{q.project_name || q.address || '—'}</td>
                                    <td className="py-1.5 px-3">
                                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${st.bg} ${st.color}`}>{st.label}</span>
                                    </td>
                                    <td className="py-1.5 px-3 text-right font-mono text-gray-700">{fmtMoney(q.total_value)}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {firm.notes && (
                      <div className="mt-4">
                        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Notes</div>
                        <p className="text-xs text-gray-600 leading-relaxed">{firm.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
