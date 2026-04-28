'use client'
import { useEffect, useState } from 'react'
import { ChevronDown, Play, AlertTriangle, CheckCircle2, Loader2, X, Camera } from 'lucide-react'
import { isVaultUnlocked, getCredentialForPortal } from '@/lib/vault'

// One-button dropdown for the Leads page header.
// Posts to /api/scanners/run and renders the result inline.
//
// Three notable behaviours:
//   1. Credentials are pulled from the local Vault (server never sees
//      master password). We pass per-scanner creds in
//      `credentialsByScanner`.
//   2. Vault must be unlocked first. If not, surface the affordance
//      "Unlock Vault to scan" instead of attempting the run.
//   3. The result panel surfaces halt-info loudly — step that failed,
//      expected/observed, and the screenshot path. That's the
//      "no silent failures" contract.

export default function RunPermitScan() {
  const [scanners, setScanners] = useState([])
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(null)        // scanner id or 'all'
  const [results, setResults] = useState(null)        // last run result
  const [vaultOk, setVaultOk] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/scanners/run')
      .then(r => r.json())
      .then(j => setScanners(j.scanners || []))
      .catch(() => setScanners([]))
    setVaultOk(isVaultUnlocked())
  }, [])

  async function handleRun(scannerId) {
    setOpen(false)
    setError(null)
    setRunning(scannerId)
    setResults(null)

    try {
      // Collect credentials for the scanners that require login.
      const targetScanners = scannerId === 'all' ? scanners : scanners.filter(s => s.id === scannerId)
      const credentialsByScanner = {}
      for (const s of targetScanners) {
        if (!s.requiresLogin) continue
        if (!isVaultUnlocked()) {
          setError('Unlock the Vault first (Configuration → Credentials).')
          setRunning(null)
          return
        }
        try {
          const cred = await getCredentialForPortal(s.credentialKey)
          if (!cred) {
            setError(`No credential stored for ${s.label}. Add one in Configuration → Credentials.`)
            setRunning(null)
            return
          }
          credentialsByScanner[s.id] = {
            username: cred.username,
            password: cred.password,
            url: cred.url || null,
          }
        } catch (e) {
          setError(`Failed to read credential for ${s.label}: ${e.message}`)
          setRunning(null)
          return
        }
      }

      const res = await fetch('/api/scanners/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanner: scannerId, credentialsByScanner }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message || data.error || 'Scan failed')
      } else {
        setResults(data.runs || [])
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        disabled={!!running}
        className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-500 flex items-center gap-1.5"
      >
        {running ? (
          <><Loader2 size={12} className="animate-spin" /> Running {running === 'all' ? 'all portals' : running}…</>
        ) : (
          <><Play size={12} /> Run Permit Scan <ChevronDown size={12} /></>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden">
          {scanners.map(s => (
            <button
              key={s.id}
              onClick={() => handleRun(s.id)}
              className="w-full px-3 py-2 text-left text-xs hover:bg-amber-50 flex items-center justify-between border-b border-gray-100 last:border-b-0"
            >
              <span className="text-gray-800">{s.label}</span>
              {s.requiresLogin ? (
                <span className="text-[9px] text-gray-400 uppercase">login</span>
              ) : (
                <span className="text-[9px] text-gray-400 uppercase">public</span>
              )}
            </button>
          ))}
          <button
            onClick={() => handleRun('all')}
            className="w-full px-3 py-2 text-left text-xs hover:bg-amber-50 bg-amber-50/40 font-semibold text-amber-700 flex items-center gap-1"
          >
            <Play size={11} /> All portals
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mt-2 absolute right-0 w-96 bg-red-50 border border-red-200 rounded-lg p-3 z-20">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1 text-[11px] text-red-800">{error}</div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700">
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Result panel */}
      {results && (
        <div className="mt-2 absolute right-0 w-[480px] bg-white border border-gray-200 rounded-lg shadow-xl z-20 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900">Scan results</h3>
            <button onClick={() => setResults(null)} className="text-gray-300 hover:text-gray-500">
              <X size={14} />
            </button>
          </div>
          <div className="space-y-3">
            {results.map((r, i) => (
              <div key={i} className={`rounded-lg p-3 border ${
                r.status === 'success' ? 'bg-green-50 border-green-200' :
                r.status === 'partial' ? 'bg-amber-50 border-amber-200' :
                'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  {r.status === 'success' ? <CheckCircle2 size={12} className="text-green-600" /> :
                    <AlertTriangle size={12} className={r.status === 'partial' ? 'text-amber-600' : 'text-red-600'} />}
                  <span className="text-xs font-semibold text-gray-900">{r.scanner}</span>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider">{r.status}</span>
                </div>
                {r.halted_at && (
                  <div className="text-[11px] text-red-800 mb-1">
                    Halted at step <code className="font-mono bg-white/50 px-1 rounded">{r.halted_at.stepKey}</code>
                    {' '}(index {r.halted_at.stepIndex})
                  </div>
                )}
                {r.summary?.error && (
                  <div className="text-[11px] text-red-700 mb-1">{r.summary.error}</div>
                )}
                {r.summary?.permits_inserted !== undefined && (
                  <div className="text-[11px] text-gray-700">
                    {r.summary.permits_inserted} new permits, {r.summary.permits_updated} updated, {r.summary.linked_existing || 0} linked to existing properties.
                  </div>
                )}
                {r.steps?.some(s => s.screenshotPath) && (
                  <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
                    <Camera size={10} /> Screenshot saved: <code className="font-mono">{r.steps.find(s => s.screenshotPath)?.screenshotPath}</code>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
