'use client'
import { useState, useMemo, useEffect } from 'react'
import { DEMO_PROPERTIES } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import SocialSignalsSection from '@/components/SocialSignalsSection'
import PortalScansSection from '@/components/PortalScansSection'
import RecentPermitsSection from '@/components/RecentPermitsSection'
import { Search, SlidersHorizontal, Building2, MapPin, DollarSign, FileText, Users, AlertTriangle, ChevronDown, ChevronRight, Flame, Clock, Database } from 'lucide-react'

const PRI = {
  highest: { label: 'HIGHEST', bg: 'bg-red-600', text: 'text-white', dot: 'bg-red-500' },
  high: { label: 'HIGH', bg: 'bg-orange-100', text: 'text-orange-800', dot: 'bg-orange-500' },
  medium: { label: 'MEDIUM', bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500' },
  low: { label: 'LOW', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
}

const STAT = {
  new: { label: 'New', color: 'text-blue-600', bg: 'bg-blue-50' },
  researching: { label: 'Researching', color: 'text-purple-600', bg: 'bg-purple-50' },
  contacted: { label: 'Contacted', color: 'text-amber-600', bg: 'bg-amber-50' },
  active: { label: 'Active', color: 'text-green-600', bg: 'bg-green-50' },
  closed: { label: 'Closed', color: 'text-gray-600', bg: 'bg-gray-100' },
}

const TYPE = {
  teardown: '🔨 Teardown',
  major_reno: '🏗️ Major Reno',
  new_build: '🏠 New Build',
  unknown: '❓ Unknown',
}

function fmt(n) {
  if (!n) return '—'
  return n >= 1e6 ? `$${(n/1e6).toFixed(n%1e6===0?0:1)}M` : `$${(n/1e3).toFixed(0)}K`
}

function Row({ p, open, toggle }) {
  const pri = PRI[p.priority] || PRI.medium
  const stat = STAT[p.status] || STAT.new
  return (
    <>
      <tr onClick={toggle} className="border-b border-gray-100 hover:bg-gray-50/80 cursor-pointer transition-colors">
        <td className="py-3 px-3">
          <div className="flex items-center gap-2">
            {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
            <span className={`w-2 h-2 rounded-full ${pri.dot}`} />
          </div>
        </td>
        <td className="py-3 px-3">
          <div className="font-semibold text-sm text-gray-900">{p.address}</div>
          <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><MapPin size={10} /> {p.area || p.municipality}</div>
        </td>
        <td className="py-3 px-3 font-mono text-sm font-semibold">{fmt(p.sale_price)}</td>
        <td className="py-3 px-3 text-xs">{TYPE[p.property_type] || TYPE.unknown}</td>
        <td className="py-3 px-3">
          <div className="text-sm text-gray-900 truncate max-w-48">{p.owner}</div>
          <div className="text-xs text-gray-500">{p.entity_type}</div>
        </td>
        <td className="py-3 px-3">
          {p.active_permits > 0
            ? <div className="flex items-center gap-1"><Flame size={12} className="text-orange-500" /><span className="text-xs font-medium text-orange-600">{p.active_permits} active</span></div>
            : <span className="text-xs text-gray-400">None</span>}
        </td>
        <td className="py-3 px-3">
          <div className="flex items-center gap-2">
            <div className="w-12 bg-gray-200 rounded-full h-1.5">
              <div className="h-1.5 rounded-full bg-gradient-to-r from-amber-500 to-red-500" style={{ width: `${p.total_score}%` }} />
            </div>
            <span className="text-xs font-mono font-medium text-gray-600">{p.total_score}</span>
          </div>
        </td>
        <td className="py-3 px-3">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${pri.bg} ${pri.text}`}>{pri.label}</span>
        </td>
        <td className="py-3 px-3">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${stat.bg} ${stat.color}`}>{stat.label}</span>
        </td>
      </tr>
      {open && (
        <tr className="bg-gray-50/50">
          <td colSpan={9} className="px-8 py-4">
            <div className="grid grid-cols-3 gap-6 text-sm">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Owner Intel</div>
                <p className="text-gray-700 leading-relaxed">{p.background}</p>
                {p.is_developer && <span className="inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-700">DEVELOPER</span>}
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Permits</div>
                {p.permit_summary ? <p className="text-gray-700">{p.permit_summary}</p> : <p className="text-gray-400 italic">No permits on file</p>}
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Details</div>
                <div className="space-y-1 text-gray-600 text-sm">
                  <div><span className="text-gray-400">Municipality:</span> {p.municipality}</div>
                  <div><span className="text-gray-400">Sold:</span> {p.sale_date}</div>
                  {p.arca_rep && <div><span className="text-gray-400">Rep:</span> <span className="font-medium text-green-600">{p.arca_rep}</span></div>}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function Dashboard() {
  const [search, setSearch] = useState('')
  const [priFil, setPriFil] = useState('all')
  const [statFil, setStatFil] = useState('all')
  const [openId, setOpenId] = useState(null)
  const [dbConnected, setDbConnected] = useState(false)

  // Keep the header badge in sync with actual Supabase connection state.
  // Checks env vars + stored config — same logic as the sidebar footer.
  useEffect(() => {
    try {
      const config = JSON.parse(localStorage.getItem('pf1_config') || '{}')
      const hasEnv = !!process.env.NEXT_PUBLIC_SUPABASE_URL
      const hasConfig = !!(config.supabase?.url && config.supabase?.anon_key)
      setDbConnected(hasEnv || hasConfig)
    } catch {}
  }, [])

  const props = DEMO_PROPERTIES
  const filtered = useMemo(() =>
    props.filter(p => {
      if (search && ![p.address, p.owner, p.area || ''].some(s => s.toLowerCase().includes(search.toLowerCase()))) return false
      if (priFil !== 'all' && p.priority !== priFil) return false
      if (statFil !== 'all' && p.status !== statFil) return false
      return true
    }).sort((a, b) => b.total_score - a.total_score)
  , [props, search, priFil, statFil])

  const stats = useMemo(() => ({
    total: props.length,
    highest: props.filter(p => p.priority === 'highest').length,
    permits: props.filter(p => p.active_permits > 0).length,
    devs: props.filter(p => p.is_developer).length,
    value: props.reduce((s, p) => s + (p.sale_price || 0), 0),
  }), [props])

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-56">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Leads</h1>
            <p className="text-xs text-gray-500">Permit activity & social signals — ranked by compatibility score</p>
          </div>
          {dbConnected ? (
            <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1">
              <Database size={12} /> DB Connected
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
              <Clock size={12} /> Demo Mode
            </div>
          )}
        </header>

        <div className="p-6">
          {/* Stats */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            {[
              { l: 'Properties', v: stats.total, icon: Building2, c: 'text-gray-900' },
              { l: 'Highest Priority', v: stats.highest, icon: AlertTriangle, c: 'text-red-600' },
              { l: 'Active Permits', v: stats.permits, icon: FileText, c: 'text-orange-600' },
              { l: 'Known Developers', v: stats.devs, icon: Users, c: 'text-blue-600' },
              { l: 'Pipeline Value', v: fmt(stats.value), icon: DollarSign, c: 'text-green-600' },
            ].map((s, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-gray-500 uppercase tracking-wider">{s.l}</span>
                  <s.icon size={14} className="text-gray-300" />
                </div>
                <div className={`text-xl font-bold ${s.c}`}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 mb-4 flex items-center gap-4">
            <div className="flex items-center gap-2 flex-1">
              <Search size={16} className="text-gray-400" />
              <input type="text" placeholder="Search address, owner, area..." value={search} onChange={e => setSearch(e.target.value)} className="w-full text-sm outline-none placeholder:text-gray-300" />
            </div>
            <SlidersHorizontal size={14} className="text-gray-400" />
            <select value={priFil} onChange={e => setPriFil(e.target.value)} className="text-xs border border-gray-200 rounded px-2 py-1 outline-none">
              <option value="all">All Priority</option>
              <option value="highest">Highest</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select value={statFil} onChange={e => setStatFil(e.target.value)} className="text-xs border border-gray-200 rounded px-2 py-1 outline-none">
              <option value="all">All Status</option>
              <option value="new">New</option>
              <option value="researching">Researching</option>
              <option value="contacted">Contacted</option>
              <option value="active">Active</option>
            </select>
            <div className="text-xs text-gray-400">{filtered.length} results</div>
          </div>

          {/* Portal scan status */}
          <div className="mb-6">
            <PortalScansSection />
          </div>

          {/* Live permits from portal scans */}
          <RecentPermitsSection />

          {/* Target properties (curated pipeline — demo data for now) */}
          <div className="flex items-center gap-2 mb-2 mt-2">
            <Building2 size={14} className="text-gray-400" />
            <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Target Properties</h2>
            <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-medium">Demo Data</span>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['','Address','Price','Type','Owner','Permits','Score','Priority','Status'].map((h,i) => (
                    <th key={i} className={`py-2.5 px-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider ${i===0?'w-12':''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => <Row key={p.id} p={p} open={openId === p.id} toggle={() => setOpenId(openId === p.id ? null : p.id)} />)}
              </tbody>
            </table>
          </div>

          {/* Social Signals */}
          <SocialSignalsSection />
        </div>
      </main>
    </div>
  )
}
