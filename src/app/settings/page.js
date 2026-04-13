'use client'
import { useState, useEffect } from 'react'
import Sidebar from '@/components/Sidebar'
import CredentialsTab from '@/components/CredentialsTab'
import AgentInstructionsTab from '@/components/AgentInstructionsTab'
import DataUploadTab from '@/components/DataUploadTab'
import { getConfig, saveConfig, resetConfig, DEFAULT_CONFIG } from '@/lib/config'
import { Globe, SlidersHorizontal, ShieldCheck, Database, Bell, RotateCcw, Plus, Trash2, Check, ExternalLink, ToggleLeft, ToggleRight, Save, AlertTriangle, Bot, BookOpen, Cloud, Upload } from 'lucide-react'

const TABS = [
  { id: 'portals', label: 'Portals', icon: Globe },
  { id: 'credentials', label: 'Credentials', icon: ShieldCheck },
  { id: 'instructions', label: 'Agent Instructions', icon: BookOpen },
  { id: 'data', label: 'Data Upload', icon: Upload },
  { id: 'filters', label: 'Scan Filters', icon: SlidersHorizontal },
  { id: 'ai', label: 'AI & Outreach', icon: Bot },
  { id: 'crm', label: 'CRM / StoneProfits', icon: Database },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'supabase', label: 'Database', icon: Cloud },
]

function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} className={`relative w-10 h-5 rounded-full transition-colors ${on ? 'bg-amber-500' : 'bg-gray-300'}`}>
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function Section({ title, desc, children }) {
  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">{title}</h3>
      {desc && <p className="text-xs text-gray-500 mb-4">{desc}</p>}
      {children}
    </div>
  )
}

function Input({ label, value, onChange, placeholder, type = 'text', mono }) {
  return (
    <label className="block mb-3">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-100 ${mono ? 'font-mono text-xs' : ''}`}
      />
    </label>
  )
}

// ── PORTALS TAB ──
function PortalsTab({ config, setConfig }) {
  const portals = config.portals || []

  const update = (idx, field, val) => {
    const next = [...portals]
    next[idx] = { ...next[idx], [field]: val }
    setConfig({ ...config, portals: next })
  }

  const remove = (idx) => {
    setConfig({ ...config, portals: portals.filter((_, i) => i !== idx) })
  }

  const add = () => {
    setConfig({ ...config, portals: [...portals, { id: `custom_${Date.now()}`, name: '', url: '', municipality: '', login_required: false, credential_key: null, enabled: true, last_scan: null }] })
  }

  const missingCreds = portals.filter(p => p.enabled && p.login_required && !p.credential_key)

  return (
    <>
      {missingCreds.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-500 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-red-800">Missing Credentials</div>
              <p className="text-xs text-red-700 mt-1">The following portals require login but have no 1Password item mapped. Scans will fail on these portals:</p>
              <ul className="mt-2 space-y-1">
                {missingCreds.map(p => (
                  <li key={p.id} className="text-xs text-red-600 font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    {p.name || 'Unnamed portal'} — <span className="text-red-500 font-mono">no credential key set</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-red-600 mt-2">Set a "1Password item name" for each, or disable the portal to suppress this warning.</p>
            </div>
          </div>
        </div>
      )}
      <Section title="Permit & Data Portals" desc="Configure the portals that PraskForce1 scans for permits, property data, and LLC info. The Chrome agent will navigate these portals using your 1Password credentials.">
        <div className="space-y-3">
          {portals.map((p, i) => (
            <div key={p.id || i} className={`border rounded-lg p-4 transition-colors ${p.enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Toggle on={p.enabled} onChange={v => update(i, 'enabled', v)} />
                  <input
                    value={p.name}
                    onChange={e => update(i, 'name', e.target.value)}
                    placeholder="Portal name"
                    className="font-medium text-sm bg-transparent outline-none border-b border-transparent focus:border-amber-400"
                  />
                </div>
                <div className="flex items-center gap-2">
                  {p.last_scan && <span className="text-[10px] text-gray-400">Last: {p.last_scan}</span>}
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noopener" className="text-gray-400 hover:text-amber-500"><ExternalLink size={14} /></a>
                  )}
                  <button onClick={() => remove(i)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <input value={p.url || ''} onChange={e => update(i, 'url', e.target.value)} placeholder="Portal URL" className="text-xs font-mono bg-gray-50 border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-amber-400" />
                <input value={p.municipality || ''} onChange={e => update(i, 'municipality', e.target.value)} placeholder="Municipality (e.g. Miami Beach)" className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-amber-400" />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input type="checkbox" checked={p.login_required} onChange={e => update(i, 'login_required', e.target.checked)} className="rounded border-gray-300" />
                    Login required
                  </label>
                  {p.login_required && (
                    <input value={p.credential_key || ''} onChange={e => update(i, 'credential_key', e.target.value)} placeholder="1Password item name" className="text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1.5 outline-none focus:border-amber-400 flex-1" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={add} className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-600 hover:text-amber-700">
          <Plus size={14} /> Add Portal
        </button>
      </Section>
    </>
  )
}

// ── FILTERS TAB ──
function FiltersTab({ config, setConfig }) {
  const f = config.filters || {}
  const setF = (k, v) => setConfig({ ...config, filters: { ...f, [k]: v } })

  return (
    <>
      <Section title="Property Sale Filters" desc="Set the criteria for which recently sold properties enter your pipeline.">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Minimum Sale Price ($)" value={f.price_floor} onChange={v => setF('price_floor', Number(v) || 0)} placeholder="3000000" type="number" mono />
          <Input label="Maximum Sale Price ($)" value={f.price_ceiling} onChange={v => setF('price_ceiling', v ? Number(v) : null)} placeholder="No ceiling" type="number" mono />
        </div>
        <Input label="Days Lookback" value={f.days_lookback} onChange={v => setF('days_lookback', Number(v) || 90)} placeholder="90" type="number" mono />
      </Section>

      <Section title="Target Zip Codes" desc="Comma-separated zip codes to scan. Leave empty to scan all.">
        <textarea
          value={(f.zip_codes || []).join(', ')}
          onChange={e => setF('zip_codes', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-amber-400"
          placeholder="33139, 33140, 33141, 33143, 33156, 33138"
        />
      </Section>

      <Section title="Target Neighborhoods" desc="One per line. Properties in these neighborhoods get priority scoring.">
        <textarea
          value={(f.neighborhoods || []).join('\n')}
          onChange={e => setF('neighborhoods', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
          rows={6}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-amber-400"
          placeholder="Pine Tree&#10;Sunset Islands&#10;Venetian Islands&#10;Di Lido&#10;Cocoplum"
        />
      </Section>

      <Section title="Permit Relevance Tiers" desc="How permit types map to stone opportunity levels.">
        {Object.entries(config.permit_tiers || {}).map(([key, tier]) => (
          <div key={key} className="border border-gray-200 rounded-lg p-3 mb-3 bg-white">
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-3 h-3 rounded-full ${key === 'tier1' ? 'bg-red-500' : key === 'tier2' ? 'bg-orange-500' : 'bg-gray-400'}`} />
              <span className="text-xs font-semibold text-gray-700">{tier.label}</span>
            </div>
            <div className="text-xs text-gray-500 font-mono">{tier.types.join(', ')}</div>
            {tier.min_valuation && <div className="text-xs text-gray-400 mt-1">Min valuation: ${tier.min_valuation.toLocaleString()}</div>}
          </div>
        ))}
      </Section>
    </>
  )
}

// ── 1PASSWORD TAB ──
function OnePasswordTab({ config, setConfig }) {
  const op = config.onepassword || {}
  const setOP = (k, v) => setConfig({ ...config, onepassword: { ...op, [k]: v } })

  return (
    <>
      <Section title="1Password Integration" desc="Connect 1Password so the Chrome agent can securely access portal logins without exposing credentials.">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <KeyRound size={20} className="text-amber-600 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-amber-900">How it works</div>
              <ol className="text-xs text-amber-800 mt-2 space-y-1.5 list-decimal list-inside">
                <li>Install the 1Password Chrome extension and sign in</li>
                <li>Create a vault named <span className="font-mono bg-amber-100 px-1 rounded">{op.vault_name || 'PraskForce1 Portals'}</span></li>
                <li>Save each portal login as a separate item (name must match the "1Password item name" in Portal settings)</li>
                <li>When the Chrome agent hits a login page, it pulls from 1Password with your approval</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <span className="text-sm text-gray-700">Enable 1Password</span>
          <Toggle on={op.enabled} onChange={v => setOP('enabled', v)} />
        </div>

        <Input label="Vault Name" value={op.vault_name} onChange={v => setOP('vault_name', v)} placeholder="PraskForce1 Portals" />

        <div className="mt-4">
          <div className="text-xs font-medium text-gray-600 mb-2">Portal Credential Mapping</div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Portal</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Login Required</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">1Password Item</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {(config.portals || []).filter(p => p.login_required).map(p => (
                  <tr key={p.id} className="border-b border-gray-100">
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="px-3 py-2 text-red-500">Yes</td>
                    <td className="px-3 py-2 font-mono text-amber-700">{p.credential_key || '—'}</td>
                    <td className="px-3 py-2">{p.credential_key ? <span className="text-green-600">Mapped</span> : <span className="text-red-500">Needs setup</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>
    </>
  )
}

// ── CRM TAB ──
function CRMTab({ config, setConfig }) {
  const crm = config.crm || {}
  const setCRM = (k, v) => setConfig({ ...config, crm: { ...crm, [k]: v } })

  return (
    <>
      <Section title="CRM / StoneProfits Integration" desc="Import your contractor and architect lists to cross-reference against permit filings. When a known contact appears on a new permit, PraskForce1 flags it as a warm lead.">
        <div className="flex items-center gap-4 mb-4">
          <span className="text-sm text-gray-700">Enable CRM Cross-Reference</span>
          <Toggle on={crm.enabled} onChange={v => setCRM('enabled', v)} />
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={crm.import_contractors} onChange={e => setCRM('import_contractors', e.target.checked)} className="rounded" />
            Import Contractors
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={crm.import_architects} onChange={e => setCRM('import_architects', e.target.checked)} className="rounded" />
            Import Architects
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={crm.import_projects} onChange={e => setCRM('import_projects', e.target.checked)} className="rounded" />
            Import Active Projects
          </label>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="text-xs font-medium text-gray-600 mb-2">Import CSV from StoneProfits</div>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <Database size={24} className="mx-auto text-gray-300 mb-2" />
            <p className="text-xs text-gray-500">Drag & drop CSV file here, or click to browse</p>
            <p className="text-[10px] text-gray-400 mt-1">Expected columns: name, company, role, email, phone</p>
          </div>
          {crm.last_sync && <div className="text-[10px] text-gray-400 mt-2">Last sync: {crm.last_sync}</div>}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1">Known Contractors ({(crm.known_contractors || []).length})</div>
            <div className="bg-white border border-gray-200 rounded-lg p-3 h-32 overflow-y-auto">
              {(crm.known_contractors || []).length === 0 ? (
                <p className="text-xs text-gray-400 italic">No contractors imported yet</p>
              ) : (
                crm.known_contractors.map((c, i) => <div key={i} className="text-xs py-0.5">{c}</div>)
              )}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1">Known Architects ({(crm.known_architects || []).length})</div>
            <div className="bg-white border border-gray-200 rounded-lg p-3 h-32 overflow-y-auto">
              {(crm.known_architects || []).length === 0 ? (
                <p className="text-xs text-gray-400 italic">No architects imported yet</p>
              ) : (
                crm.known_architects.map((a, i) => <div key={i} className="text-xs py-0.5">{a}</div>)
              )}
            </div>
          </div>
        </div>
      </Section>
    </>
  )
}

// ── NOTIFICATIONS TAB ──
function NotificationsTab({ config, setConfig }) {
  const n = config.notifications || {}
  const setN = (k, v) => setConfig({ ...config, notifications: { ...n, [k]: v } })

  return (
    <>
      <Section title="Alert Settings" desc="Get notified when new high-value leads enter the pipeline or permits are filed on tracked properties.">
        <Input label="Notification Email" value={n.email} onChange={v => setN('email', v)} placeholder="you@example.com" />

        <div className="space-y-3 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-700">New permit alerts</div>
              <div className="text-xs text-gray-500">Get notified when a permit is filed on a tracked property</div>
            </div>
            <Toggle on={n.notify_new_permits} onChange={v => setN('notify_new_permits', v)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-700">New sale alerts</div>
              <div className="text-xs text-gray-500">Get notified when a property matching your filters sells</div>
            </div>
            <Toggle on={n.notify_new_sales} onChange={v => setN('notify_new_sales', v)} />
          </div>
        </div>

        <div className="mt-4">
          <Input label="Minimum score to alert" value={n.notify_score_threshold} onChange={v => setN('notify_score_threshold', Number(v) || 0)} placeholder="70" type="number" mono />
        </div>

        <div className="mt-4">
          <span className="text-xs font-medium text-gray-600">Frequency</span>
          <div className="flex gap-2 mt-1">
            {['realtime', 'daily', 'weekly'].map(f => (
              <button
                key={f}
                onClick={() => setN('frequency', f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${n.frequency === f ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </Section>
    </>
  )
}

// ── OUTLOOK TAB ──
// ── AI & OUTREACH TAB (merged Outlook + AI Drafting) ──
function AIOutreachTab({ config, setConfig }) {
  const ai = config.ai || {}
  const setAI = (k, v) => setConfig({ ...config, ai: { ...ai, [k]: v } })
  const o = config.outlook || {}
  const setO = (k, v) => setConfig({ ...config, outlook: { ...o, [k]: v } })

  return (
    <>
      <Section title="Email & Sender" desc="Outreach preferences — your Outlook login is stored in the Credentials vault. These control how emails are composed.">
        <Input label="Sender Email" value={o.email} onChange={v => setO('email', v)} placeholder="bprasky@arcaww.com" />
        <Input label="Send-As Alias (optional)" value={o.send_as} onChange={v => setO('send_as', v)} placeholder="Leave blank to send from sender email" />
        <label className="block mb-3">
          <span className="text-xs font-medium text-gray-600">Email Signature</span>
          <textarea
            value={o.signature || ''}
            onChange={e => setO('signature', e.target.value)}
            rows={3}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-amber-400"
            placeholder="Brad Prasky&#10;Senior Sales Executive&#10;ARCA Worldwide"
          />
        </label>
      </Section>

      <Section title="AI Model" desc="Configure the AI that drafts personalized outreach using property intel, owner background, and product targeting.">
        <div className="flex items-center gap-4 mb-4">
          <span className="text-sm text-gray-700">Enable AI Drafting</span>
          <Toggle on={ai.enabled} onChange={v => setAI('enabled', v)} />
        </div>

        {!ai.enabled && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={16} className="text-amber-500 mt-0.5" />
              <p className="text-xs text-amber-700">AI drafting is disabled. Enable it and add an API key to the Credentials vault to use outreach drafting.</p>
            </div>
          </div>
        )}

        <div className="mb-4">
          <span className="text-xs font-medium text-gray-600">Provider</span>
          <div className="flex gap-2 mt-1">
            {[{ id: 'anthropic', label: 'Anthropic (Claude)' }, { id: 'openai', label: 'OpenAI (GPT)' }].map(p => (
              <button key={p.id} onClick={() => setAI('provider', p.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${ai.provider === p.id ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{p.label}</button>
            ))}
          </div>
        </div>

        <Input label="Model" value={ai.model} onChange={v => setAI('model', v)} placeholder="claude-sonnet-4-20250514" mono />
        <Input label="API Key (required for AI drafting)" value={ai.api_key || ''} onChange={v => setAI('api_key', v)} placeholder="sk-ant-api03-..." type="password" mono />
        <p className="text-[10px] text-gray-400 -mt-2 mb-3">Get yours at console.anthropic.com → API Keys. Stored locally in your browser config — never sent anywhere except Anthropic's API.</p>
      </Section>

      <Section title="Drafting Preferences" desc="Tone and context used for every outreach draft.">
        <div className="mb-4">
          <span className="text-xs font-medium text-gray-600">Tone</span>
          <div className="flex gap-2 mt-1">
            {[{ id: 'formal', label: 'Formal' }, { id: 'professional_casual', label: 'Professional Casual' }, { id: 'casual', label: 'Casual' }].map(t => (
              <button key={t.id} onClick={() => setAI('tone', t.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${ai.tone === t.id ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{t.label}</button>
            ))}
          </div>
        </div>
        <label className="block mb-3">
          <span className="text-xs font-medium text-gray-600">Company Context (included in every AI prompt)</span>
          <textarea
            value={ai.context || ''}
            onChange={e => setAI('context', e.target.value)}
            rows={5}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-amber-400"
            placeholder="Describe your company, products, and differentiators..."
          />
        </label>
      </Section>
    </>
  )
}

// ── DATABASE / SUPABASE TAB ──
function SupabaseTab({ config, setConfig }) {
  const sb = config.supabase || {}
  const setSB = (k, v) => setConfig({ ...config, supabase: { ...sb, [k]: v } })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  async function handleTest() {
    if (!sb.url || !sb.anon_key) { setTestResult({ ok: false, msg: 'Enter both URL and anon key', debug: null }); return }
    setTesting(true)
    setTestResult(null)

    const url = sb.url.replace(/\/+$/, '').trim()
    const key = sb.anon_key.trim()

    const debug = {
      url: url,
      key_preview: key.slice(0, 20) + '...' + key.slice(-8),
      key_length: key.length,
      tests: [],
    }

    // Test 1: Use the actual Supabase JS client (same as the app will use)
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const testClient = createClient(url, key)
      // Try a simple RPC health check — doesn't need any tables
      const { data, error } = await testClient.from('_does_not_exist_test').select('*').limit(1)

      // 42P01 = relation doesn't exist = AUTH WORKED, table just missing (expected before schema.sql)
      // PGRST116 = no rows = also fine
      if (error) {
        const code = error.code || ''
        const msg = error.message || ''
        debug.tests.push({ method: 'supabase-js', error_code: code, error_msg: msg })

        if (code === '42P01' || code === 'PGRST116' || msg.includes('does not exist') || msg.includes('Not Found')) {
          setTestResult({ ok: true, msg: `Connected to ${url}. Tables not created yet — run schema.sql in the SQL Editor to set them up.`, debug })
          setTesting(false)
          return
        } else if (code === 'PGRST301' || msg.includes('JWT')) {
          setTestResult({ ok: false, msg: `Auth failed: ${msg}. Try copying a fresh anon key from Supabase → Settings → API.`, debug })
          setTesting(false)
          return
        }
      }

      // If we got here with no error or a benign error, we're connected
      debug.tests.push({ method: 'supabase-js', status: 'ok', data })
      setTestResult({ ok: true, msg: `Connected to ${url}`, debug })
      setTesting(false)
      return

    } catch (e) {
      debug.tests.push({ method: 'supabase-js', exception: e.message })
    }

    // Test 2: Fallback raw fetch with URL param
    try {
      const res = await fetch(`${url}/rest/v1/?apikey=${encodeURIComponent(key)}`)
      const body = await res.text().catch(() => '')
      debug.tests.push({ method: 'fetch-url-param', status: res.status, body: body.slice(0, 200) })

      if (res.ok) {
        setTestResult({ ok: true, msg: `Connected to ${url} (via URL param)`, debug })
        setTesting(false)
        return
      }
    } catch (e) {
      debug.tests.push({ method: 'fetch-url-param', exception: e.message })
    }

    // Test 3: Can we even reach the server?
    try {
      const res = await fetch(`${url}/auth/v1/settings`)
      debug.tests.push({ method: 'auth-settings', status: res.status })
    } catch (e) {
      debug.tests.push({ method: 'auth-settings', exception: e.message })
    }

    setTestResult({ ok: false, msg: 'All connection methods failed. Check debug details below.', debug })
    setTesting(false)
  }

  const isConnected = sb.url && sb.anon_key

  return (
    <>
      <Section title="Database Connection" desc="Connect to Supabase for persistent data storage. Without this, all data lives in your browser's localStorage and resets if you clear it.">
        {!isConnected && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={16} className="text-amber-500 mt-0.5" />
              <div className="text-xs text-amber-800">
                <div className="font-semibold mb-1">Running in Demo Mode</div>
                <p>All data is stored in localStorage. Connect Supabase to persist properties, accounts, tasks, and outreach history.</p>
              </div>
            </div>
          </div>
        )}

        {isConnected && !testResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2 text-xs text-green-700">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="font-medium">Supabase configured</span>
              <span className="text-green-600">— click Test Connection to verify</span>
            </div>
          </div>
        )}

        {testResult && (
          <div className={`border rounded-lg p-3 mb-4 ${testResult.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className={`flex items-center gap-2 text-xs ${testResult.ok ? 'text-green-700' : 'text-red-700'}`}>
              {testResult.ok ? <div className="w-2 h-2 rounded-full bg-green-500" /> : <AlertTriangle size={12} />}
              <span className="font-medium">{testResult.msg}</span>
            </div>
            {testResult.debug && (
              <details className="mt-2">
                <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-700">Show debug details</summary>
                <pre className="mt-1 text-[10px] text-gray-600 font-mono bg-white border border-gray-200 rounded p-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(testResult.debug, null, 2)}</pre>
              </details>
            )}
          </div>
        )}

        <Input label="Supabase Project URL" value={sb.url || ''} onChange={v => setSB('url', v.trim().replace(/\/+$/, ''))} placeholder="https://your-project.supabase.co" mono />
        <Input label="Anon / Public Key" value={sb.anon_key || ''} onChange={v => setSB('anon_key', v.trim())} placeholder="eyJhbGciOiJIUzI1NiIs..." type="password" mono />
        <p className="text-[10px] text-gray-400 -mt-2 mb-3">Supabase → Settings → API → Project API keys → copy <span className="font-semibold">anon public</span> (not service_role). Starts with "eyJ".</p>

        <button onClick={handleTest} disabled={testing} className={`mt-2 px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 ${testing ? 'bg-gray-200 text-gray-500' : 'bg-amber-500 text-white hover:bg-amber-600'}`}>
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
      </Section>

      <Section title="Setup Instructions" desc="One-time setup to create your database tables.">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <ol className="text-xs text-gray-700 space-y-3 list-decimal list-inside">
            <li>Go to <a href="https://supabase.com" target="_blank" rel="noopener" className="text-amber-600 hover:text-amber-700 underline">supabase.com</a> and create a free project</li>
            <li>Once created, go to <span className="font-mono bg-gray-100 px-1 rounded">Settings → API</span> and copy your <span className="font-semibold">Project URL</span> and <span className="font-semibold">anon public key</span></li>
            <li>Paste them above and click Test Connection</li>
            <li>Go to the <span className="font-mono bg-gray-100 px-1 rounded">SQL Editor</span> in your Supabase dashboard</li>
            <li>Run <span className="font-mono bg-gray-100 px-1 rounded">supabase/schema.sql</span> from the PraskForce1 project folder — this creates all tables</li>
            <li>Run <span className="font-mono bg-gray-100 px-1 rounded">supabase/seed.sql</span> to load your 15 researched properties</li>
            <li>Save configuration here and restart the dev server</li>
          </ol>
        </div>

        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="text-xs text-blue-800">
            <span className="font-semibold">After connecting:</span> The app writes your Supabase credentials to <span className="font-mono bg-blue-100 px-1 rounded">.env.local</span> automatically on save. Restart the dev server (<span className="font-mono bg-blue-100 px-1 rounded">Ctrl+C</span> then <span className="font-mono bg-blue-100 px-1 rounded">npm run dev</span>) for the connection to go live. Properties, tasks, accounts, and outreach will then persist in Postgres.
          </div>
        </div>
      </Section>

      <Section title="Database Status" desc="Current data storage locations.">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Properties', stored: isConnected ? 'Supabase' : 'Demo data (hardcoded)' },
            { label: 'Accounts', stored: isConnected ? 'Supabase' : 'Demo data (hardcoded)' },
            { label: 'Tasks', stored: 'localStorage' },
            { label: 'Meetings', stored: 'localStorage' },
            { label: 'Credentials', stored: 'localStorage (encrypted)' },
            { label: 'Agent Instructions', stored: 'localStorage' },
            { label: 'Configuration', stored: 'localStorage' },
            { label: 'Outreach Log', stored: 'localStorage' },
          ].map((item, i) => (
            <div key={i} className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg ${item.stored.includes('Supabase') ? 'bg-green-50 text-green-700' : item.stored.includes('encrypted') ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'}`}>
              <span className="font-medium">{item.label}</span>
              <span className="text-[10px]">{item.stored}</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  )
}

// ── MAIN SETTINGS PAGE ──
export default function SettingsPage() {
  const [tab, setTab] = useState('portals')
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [saved, setSaved] = useState(false)

  useEffect(() => { setConfig(getConfig()) }, [])

  const handleSave = () => {
    saveConfig(config)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleReset = () => {
    if (confirm('Reset all settings to defaults?')) {
      const fresh = resetConfig()
      setConfig(fresh)
    }
  }

  const TabContent = {
    portals: PortalsTab,
    credentials: CredentialsTab,
    instructions: AgentInstructionsTab,
    data: DataUploadTab,
    filters: FiltersTab,
    ai: AIOutreachTab,
    crm: CRMTab,
    notifications: NotificationsTab,
    supabase: SupabaseTab,
  }[tab]

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-56">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Configuration</h1>
            <p className="text-xs text-gray-500">Manage portals, scan filters, credentials, and integrations</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleReset} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-500 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-red-200 transition-colors">
              <RotateCcw size={12} /> Reset
            </button>
            <button onClick={handleSave} className={`flex items-center gap-1.5 text-xs font-medium px-4 py-1.5 rounded-lg transition-all ${saved ? 'bg-green-500 text-white' : 'bg-amber-500 text-white hover:bg-amber-600'}`}>
              {saved ? <><Check size={12} /> Saved</> : <><Save size={12} /> Save Configuration</>}
            </button>
          </div>
        </header>

        <div className="p-6">
          <div className="flex gap-6">
            {/* Tab nav */}
            <div className="w-48 shrink-0">
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {TABS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors border-b border-gray-100 last:border-0 ${
                      tab === t.id ? 'bg-amber-50 text-amber-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <t.icon size={15} />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 max-w-3xl">
              <TabContent config={config} setConfig={setConfig} />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
