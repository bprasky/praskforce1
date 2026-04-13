'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Settings, Radar, Users, FileText, Database, Zap, CheckSquare } from 'lucide-react'

const NAV = [
  { href: '/', label: 'Pipeline', icon: LayoutDashboard },
  { href: '/accounts', label: 'Accounts', icon: Users },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/agents', label: 'Run Agents', icon: Radar },
  { href: '/settings', label: 'Configuration', icon: Settings },
]

export default function Sidebar() {
  const path = usePathname()
  const [dbStatus, setDbStatus] = useState('loading')

  useEffect(() => {
    try {
      const config = JSON.parse(localStorage.getItem('pf1_config') || '{}')
      const hasEnv = !!process.env.NEXT_PUBLIC_SUPABASE_URL
      const hasConfig = !!(config.supabase?.url && config.supabase?.anon_key)
      setDbStatus(hasEnv || hasConfig ? 'connected' : 'demo')
    } catch {
      setDbStatus('demo')
    }
  }, [])

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-56 bg-pf-sidebar border-r border-neutral-800 flex flex-col z-50">
      {/* Logo */}
      <div className="px-5 pt-5 pb-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-extrabold text-white tracking-wide">PRASKFORCE1</div>
            <div className="text-[10px] text-neutral-500 tracking-widest">LEAD INTEL</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3">
        <div className="text-[10px] font-semibold text-neutral-600 uppercase tracking-widest px-2 mb-2">System</div>
        {NAV.map(item => {
          const active = path === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm mb-0.5 transition-all ${
                active
                  ? 'bg-neutral-800 text-amber-500 font-medium'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
              }`}
            >
              <item.icon size={16} />
              {item.label}
            </Link>
          )
        })}

        <div className="text-[10px] font-semibold text-neutral-600 uppercase tracking-widest px-2 mb-2 mt-6">Coming Soon</div>
        {[
          { label: 'Data Sources', icon: Database },
        ].map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm mb-0.5 text-neutral-600 cursor-not-allowed"
          >
            <item.icon size={16} />
            {item.label}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-neutral-800">
        <div className="text-[10px] text-neutral-600">
          v0.1 — {dbStatus === 'loading' ? (
            <span className="text-neutral-600">...</span>
          ) : dbStatus === 'connected' ? (
            <span className="text-green-600">DB Connected</span>
          ) : (
            <span className="text-amber-600">Demo Mode</span>
          )}
        </div>
      </div>
    </aside>
  )
}
