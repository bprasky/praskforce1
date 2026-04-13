'use client'
import { useState } from 'react'
import Sidebar from '@/components/Sidebar'
import { DEMO_ACCOUNTS } from '@/lib/accounts'
import { PRODUCT_TIERS } from '@/lib/targeting'
import { ChevronDown, ChevronRight, ExternalLink, Building2, Link2, Users, Search, DollarSign, Send, Instagram, Linkedin, Mail, MessageSquare, Layers, AlertTriangle } from 'lucide-react'

function fmt(n) {
  if (!n) return '—'
  return n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : `$${(n/1e3).toFixed(0)}K`
}

function AccountCard({ acct, open, toggle }) {
  const tier = PRODUCT_TIERS[acct.tier]
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-3">
      {/* Header */}
      <div onClick={toggle} className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 transition-colors">
        <div className="flex items-center gap-4">
          {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
          <div>
            <div className="font-semibold text-gray-900">{acct.name}</div>
            <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
              <span className="capitalize">{acct.type.replace('_', ' ')}</span>
              <span className="text-gray-300">·</span>
              <span>{acct.property_count} {acct.property_count === 1 ? 'property' : 'properties'}</span>
              <span className="text-gray-300">·</span>
              <span className="font-mono">{fmt(acct.total_known_value)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Quick action buttons */}
          <div className="flex items-center gap-1">
            {acct.research.linkedin && (
              <a href={acct.research.linkedin} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors" title="LinkedIn">
                <Linkedin size={14} />
              </a>
            )}
            {acct.research.instagram && (
              <a href={acct.research.instagram} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} className="p-1.5 rounded-lg hover:bg-pink-50 text-gray-400 hover:text-pink-600 transition-colors" title="Instagram">
                <Instagram size={14} />
              </a>
            )}
            {acct.research.likely_email && (
              <a href={`mailto:${acct.research.likely_email}`} onClick={e => e.stopPropagation()} className="p-1.5 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors" title={acct.research.likely_email}>
                <Mail size={14} />
              </a>
            )}
            <button onClick={e => { e.stopPropagation(); alert('AI draft coming — connect API key in settings') }} className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors" title="AI Draft Outreach">
              <Send size={14} />
            </button>
          </div>

          {/* Product tier badge */}
          {tier && (
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${tier.bg} ${tier.text}`}>
              {tier.label}
            </span>
          )}

          {/* Outreach status */}
          {acct.outreach_count > 0 ? (
            <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-green-50 text-green-600">{acct.outreach_count} outreach</span>
          ) : (
            <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-400">No contact</span>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-gray-100 px-5 py-5">
          <div className="grid grid-cols-3 gap-6">
            {/* Column 1: Entities & Properties */}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Building2 size={12} /> Entities & Properties
              </div>
              {acct.entities.map((ent, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3 mb-2">
                  <div className="text-sm font-medium text-gray-900">{ent.name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {ent.doc && <span className="font-mono text-gray-400">{ent.doc}</span>}
                    {ent.role && <span> · {ent.role}</span>}
                  </div>
                  {ent.property && (
                    <div className="mt-2 text-xs flex items-center gap-1.5 text-gray-700">
                      <span className="text-gray-400">→</span>
                      <span className="font-medium">{ent.property}</span>
                      {ent.price && <span className="font-mono text-gray-500">{fmt(ent.price)}</span>}
                    </div>
                  )}
                </div>
              ))}

              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 mt-5 flex items-center gap-1.5">
                <Layers size={12} /> Known Projects
              </div>
              <ul className="space-y-1.5">
                {acct.known_projects.map((proj, i) => (
                  <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                    <span className="text-gray-300 mt-0.5">·</span>
                    {proj}
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 2: Connections */}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Link2 size={12} /> Network / Connections
              </div>
              {acct.connections.length > 0 ? (
                acct.connections.map((conn, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-500">
                      {conn.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{conn.name}</div>
                      <div className="text-xs text-gray-500">
                        {conn.relationship}
                        {conn.entity && <span className="text-gray-400"> · {conn.entity}</span>}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-400 italic">No known connections yet</p>
              )}

              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 mt-5 flex items-center gap-1.5">
                <Search size={12} /> Research Links
              </div>
              <div className="space-y-2">
                {acct.research.linkedin && (
                  <a href={acct.research.linkedin} target="_blank" rel="noopener" className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800">
                    <Linkedin size={12} /> LinkedIn Profile <ExternalLink size={10} />
                  </a>
                )}
                {acct.research.instagram && (
                  <a href={acct.research.instagram} target="_blank" rel="noopener" className="flex items-center gap-2 text-xs text-pink-600 hover:text-pink-800">
                    <Instagram size={12} /> Instagram <ExternalLink size={10} />
                  </a>
                )}
                {acct.research.likely_email && (
                  <div className="flex items-center gap-2 text-xs text-gray-700">
                    <Mail size={12} /> <span className="font-mono">{acct.research.likely_email}</span>
                  </div>
                )}
                {!acct.research.linkedin && !acct.research.instagram && !acct.research.likely_email && (
                  <div className="flex items-center gap-2 text-xs text-amber-600">
                    <AlertTriangle size={12} /> No contact info found — needs deeper research
                  </div>
                )}
                <button className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg">
                  <Search size={12} /> Run Deep Research
                </button>
              </div>
            </div>

            {/* Column 3: Notes & Outreach */}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Intel Notes</div>
              <p className="text-sm text-gray-700 leading-relaxed">{acct.notes}</p>

              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 mt-5 flex items-center gap-1.5">
                <Send size={12} /> Quick Actions
              </div>
              <div className="space-y-2">
                <button className="w-full flex items-center gap-2 text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 px-3 py-2 rounded-lg transition-colors">
                  <Send size={12} /> AI Draft Outreach Email
                </button>
                <button className="w-full flex items-center gap-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg transition-colors">
                  <MessageSquare size={12} /> Log Outreach
                </button>
                <button className="w-full flex items-center gap-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg transition-colors">
                  <Search size={12} /> Find LinkedIn / Instagram / Email
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AccountsPage() {
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState(null)

  const accounts = DEMO_ACCOUNTS.filter(a => {
    if (!search) return true
    const s = search.toLowerCase()
    return a.name.toLowerCase().includes(s) ||
      a.entities.some(e => e.name.toLowerCase().includes(s)) ||
      (a.notes || '').toLowerCase().includes(s)
  })

  const totalValue = DEMO_ACCOUNTS.reduce((s, a) => s + a.total_known_value, 0)
  const totalProperties = DEMO_ACCOUNTS.reduce((s, a) => s + a.property_count, 0)
  const totalEntities = DEMO_ACCOUNTS.reduce((s, a) => s + a.entities.length, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-56">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Accounts</h1>
            <p className="text-xs text-gray-500">Entity networks — see who controls what across LLCs, properties, and connections</p>
          </div>
        </header>

        <div className="p-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { l: 'Accounts', v: DEMO_ACCOUNTS.length, icon: Users, c: 'text-gray-900' },
              { l: 'Total Entities', v: totalEntities, icon: Building2, c: 'text-blue-600' },
              { l: 'Properties Tracked', v: totalProperties, icon: Layers, c: 'text-amber-600' },
              { l: 'Known Value', v: fmt(totalValue), icon: DollarSign, c: 'text-green-600' },
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

          {/* Search */}
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 mb-4 flex items-center gap-3">
            <Search size={16} className="text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, LLC, or keyword..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-sm outline-none placeholder:text-gray-300"
            />
          </div>

          {/* Account cards */}
          {accounts.map(acct => (
            <AccountCard
              key={acct.id}
              acct={acct}
              open={openId === acct.id}
              toggle={() => setOpenId(openId === acct.id ? null : acct.id)}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
