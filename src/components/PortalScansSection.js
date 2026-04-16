'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { getConfig } from '@/lib/config'
import { generateAgentPrompt } from '@/lib/agent-prompts'
import { getLatestPerPortal, ingestScanResults, SCAN_STATUS } from '@/lib/portal-scans'
import { createJob, updateJob, listJobs } from '@/lib/agent-jobs'
import { isAutoPortal } from '@/lib/scraper-registry'
import {
  Globe, Play, Copy, Check, ClipboardPaste, X, AlertTriangle,
  ExternalLink, RefreshCw, ShieldCheck, ShieldAlert, ChevronDown, ChevronRight, CheckCircle2,
  Bot, Clipboard, Loader2, Search, Building2, User, FileSearch
} from 'lucide-react'

// Portal roles grouped for the UI. Order = display order on /leads.
const ROLE_GROUPS = [
  { role: 'discovery',         label: 'Discovery',          desc: 'sources of new target addresses', Icon: Search },
  { role: 'enrichment',        label: 'Permit Enrichment',  desc: 'look up permits for a known address', Icon: Building2 },
  { role: 'property_research', label: 'Property Research',  desc: 'sales, ownership, folio', Icon: FileSearch },
  { role: 'entity_research',   label: 'Entity Research',    desc: 'LLCs, officers, registered agents', Icon: User },
]

function formatDate(iso) {
  if (!iso) return 'never'
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function StatusPill({ status }) {
  const info = SCAN_STATUS[status] || SCAN_STATUS.pending
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${info.bg} ${info.color} border ${info.border}`}>
      {info.label}
    </span>
  )
}

function PortalRow({ p, isFirst, latest, activeJobsCount, onRun }) {
  const status = latest?.status || 'pending'
  const isFailed = status === 'failed' || status === 'partial'
  const missingCred = p.login_required && !p.credential_key
  const auto = isAutoPortal(p.id)
  // Best-effort running indicator. We don't currently track which
  // portal each in-flight job covers.
  const isRunning = activeJobsCount > 0

  return (
    <div className={`px-4 py-3 flex items-center gap-3 ${isFirst ? '' : 'border-t border-gray-100'} ${isFailed ? 'bg-red-50/30' : ''}`}>
      <div className="flex items-center gap-2 shrink-0 w-6">
        {p.login_required ? (
          missingCred
            ? <ShieldAlert size={14} className="text-red-500" />
            : <ShieldCheck size={14} className="text-gray-400" />
        ) : (
          <Globe size={14} className="text-gray-300" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-sm font-semibold text-gray-900 truncate">{p.name}</span>
          <StatusPill status={status} />
          {auto ? (
            <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
              <Bot size={8} /> AUTO
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">
              <Clipboard size={8} /> MANUAL
            </span>
          )}
          {isRunning && auto && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
              <Loader2 size={10} className="animate-spin" /> running
            </span>
          )}
          {p.municipality && <span className="text-[10px] text-gray-400">{p.municipality}</span>}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <span>Last scan: {formatDate(latest?.scanned_at)}</span>
          {latest?.permits_found > 0 && (
            <span>{latest.permits_found} permits · {latest.new_permits || 0} new</span>
          )}
          {latest?.error_details && (
            <span className="text-red-600 truncate max-w-md" title={latest.error_details}>
              ⚠ {latest.error_details}
            </span>
          )}
          {missingCred && <span className="text-red-600">⚠ no credential configured</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {p.url && (
          <a href={p.url} target="_blank" rel="noreferrer" className="p-1.5 text-gray-400 hover:text-amber-600 rounded" title="Open portal">
            <ExternalLink size={12} />
          </a>
        )}
        <button
          onClick={() => onRun(p)}
          disabled={missingCred}
          className="px-2 py-1 text-[10px] font-medium bg-gray-100 hover:bg-amber-100 hover:text-amber-700 text-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          title={missingCred ? 'Set credential first' : 'Scan only this portal'}
        >
          Scan
        </button>
      </div>
    </div>
  )
}

export default function PortalScansSection() {
  const [portals, setPortals] = useState([])
  const [filters, setFilters] = useState({})
  const [latestByPortal, setLatestByPortal] = useState({})
  const [loading, setLoading] = useState(true)
  const [promptOpen, setPromptOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [generatedPrompt, setGeneratedPrompt] = useState('')
  const [requestedPortals, setRequestedPortals] = useState([])
  const [promptJobId, setPromptJobId] = useState(null)
  const [pasteText, setPasteText] = useState('')
  const [pasteError, setPasteError] = useState(null)
  const [ingestResult, setIngestResult] = useState(null)
  const [copied, setCopied] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const [expanded, setExpanded] = useState(true)
  // activeJobs: { [jobId]: { status, kind, created_at } } — jobs we've
  // queued from this session and are watching for completion
  const [activeJobs, setActiveJobs] = useState({})
  const [runnerHint, setRunnerHint] = useState(null)
  const pollRef = useRef(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const config = getConfig()
      const allPortals = config.portals || []
      setPortals(allPortals)
      setFilters(config.filters || {})
      const latest = await getLatestPerPortal()
      setLatestByPortal(latest)
    } catch (e) {
      console.warn('Failed to load portal scans', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Poll agent_jobs for active portal_scan jobs queued from this session.
  // When any flips to done/failed, refresh the portal status and clear
  // it from the active set. The runner (node scripts/runner.js --daemon)
  // is what actually processes these — the poll is just for UI feedback.
  useEffect(() => {
    if (Object.keys(activeJobs).length === 0) {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }
    if (pollRef.current) return

    pollRef.current = setInterval(async () => {
      try {
        const jobs = await listJobs({ kind: 'portal_scan' })
        const jobsById = {}
        for (const j of jobs) jobsById[j.id] = j

        let anyCompleted = false
        const nextActive = { ...activeJobs }
        for (const id of Object.keys(activeJobs)) {
          const latest = jobsById[id]
          if (!latest) continue
          if (latest.status === 'done' || latest.status === 'failed' || latest.status === 'needs_review') {
            delete nextActive[id]
            anyCompleted = true
          } else {
            nextActive[id] = { status: latest.status, kind: latest.kind, created_at: latest.created_at }
          }
        }

        if (anyCompleted || Object.keys(nextActive).length !== Object.keys(activeJobs).length) {
          setActiveJobs(nextActive)
          await refresh()
        }
      } catch (e) {
        console.warn('Polling failed:', e)
      }
    }, 3000)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [activeJobs, refresh])

  const enabledPortals = portals.filter(p => p.enabled)
  const scannablePortals = enabledPortals.filter(p => !p.login_required || p.credential_key)
  const missingCreds = enabledPortals.filter(p => p.login_required && !p.credential_key)

  // Split enabled+scannable portals into auto (has a Playwright scraper
  // registered) and manual (falls back to Claude-in-Chrome copy-paste)
  const autoPortals = scannablePortals.filter(p => isAutoPortal(p.id))
  const manualPortals = scannablePortals.filter(p => !isAutoPortal(p.id))

  // Summary counters for the header
  const counts = { success: 0, partial: 0, failed: 0, pending: 0 }
  for (const p of enabledPortals) {
    const latest = latestByPortal[p.id]
    if (!latest) counts.pending++
    else if (latest.status === 'success') counts.success++
    else if (latest.status === 'partial') counts.partial++
    else counts.failed++
  }

  /**
   * Queue a scan. Splits the target portal list into "auto" (has a
   * registered Playwright scraper in scripts/scrapers/) and "manual"
   * (needs Claude-in-Chrome copy-paste).
   *
   * Auto portals: queue one job, surface it in activeJobs so the
   *   polling loop watches for completion. Runner picks it up.
   * Manual portals: queue one job AND generate the Claude-in-Chrome
   *   prompt for the user to copy-paste, same as before.
   *
   * If the target list mixes auto and manual, we queue two separate
   * jobs so the auto one can complete independently of the manual one.
   */
  async function handleRun(portalsToScan) {
    if (!portalsToScan.length) return
    setRunnerHint(null)

    const auto = portalsToScan.filter(p => isAutoPortal(p.id))
    const manual = portalsToScan.filter(p => !isAutoPortal(p.id))

    try {
      // Auto job — runner will process this one
      if (auto.length > 0) {
        const autoJob = await createJob({
          kind: 'portal_scan',
          priority: 3,
          payload: {
            portal_ids: auto.map(p => p.id),
            portal_count: auto.length,
            filters,
            runtime: 'runner',
          },
        })
        setActiveJobs(prev => ({ ...prev, [autoJob.id]: { status: 'queued', kind: 'portal_scan', created_at: autoJob.created_at } }))
        setRunnerHint(
          `Queued ${auto.length} auto portal${auto.length > 1 ? 's' : ''} for the runner. ` +
          `Make sure \`node scripts/runner.js --daemon\` is running in another terminal — ` +
          `the job will pick up within ~5 seconds and results will stream in here.`
        )
      }

      // Manual job — user copy-pastes into Claude-in-Chrome
      if (manual.length > 0) {
        const prompt = generateAgentPrompt('SCAN-ALL-PORTALS-001', {
          portals: manual,
          filters,
        })
        const manualJob = await createJob({
          kind: 'portal_scan',
          priority: 3,
          payload: {
            portal_ids: manual.map(p => p.id),
            portal_count: manual.length,
            filters,
            runtime: 'claude_in_chrome',
          },
        })
        setGeneratedPrompt(prompt)
        setRequestedPortals(manual)
        setPromptJobId(manualJob.id)
        setPromptOpen(true)
        setPasteOpen(false)
        setIngestResult(null)
        setPasteError(null)
      }
    } catch (e) {
      setPasteError('Failed to queue scan: ' + e.message)
    }
  }

  function handleRunAll() {
    handleRun(scannablePortals)
  }

  function handleRunOne(portal) {
    if (portal.login_required && !portal.credential_key) {
      setPasteError(`${portal.name} requires login but no credential is set in Configuration → Portals.`)
      return
    }
    handleRun([portal])
  }

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(generatedPrompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  async function handleIngest() {
    setPasteError(null)
    setIngestResult(null)

    const text = pasteText.trim()
    if (!text) {
      setPasteError('Paste the JSON output from Claude-in-Chrome first.')
      return
    }

    const cleaned = text.replace(/```json|```/g, '').trim()
    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch (e) {
      setPasteError("That doesn't look like valid JSON. The agent should return an object with a portal_results array.")
      return
    }

    setIngesting(true)
    try {
      const result = await ingestScanResults(parsed, requestedPortals)
      setIngestResult(result)
      if (promptJobId) {
        await updateJob(promptJobId, {
          status: result.failed > 0 ? 'needs_review' : 'done',
          result: { succeeded: result.succeeded, failed: result.failed, partial: result.partial, missing: result.missing },
          completed_at: new Date().toISOString(),
        })
      }
      setPasteText('')
      await refresh()
    } catch (e) {
      setPasteError(e.message)
    } finally {
      setIngesting(false)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wider hover:text-gray-900"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Globe size={14} className="text-gray-400" />
          Portal Scans
          <span className="text-[10px] text-gray-400 font-normal normal-case">
            ({enabledPortals.length} enabled)
          </span>
        </button>
        <div className="flex items-center gap-3">
          {/* Header status counters */}
          <div className="flex items-center gap-2 text-[10px]">
            {counts.success > 0 && (
              <span className="flex items-center gap-1 text-green-700"><CheckCircle2 size={10} /> {counts.success}</span>
            )}
            {counts.partial > 0 && (
              <span className="flex items-center gap-1 text-amber-700"><AlertTriangle size={10} /> {counts.partial}</span>
            )}
            {counts.failed > 0 && (
              <span className="flex items-center gap-1 text-red-700 font-semibold"><AlertTriangle size={10} /> {counts.failed} failed</span>
            )}
            {counts.pending > 0 && (
              <span className="flex items-center gap-1 text-gray-400">· {counts.pending} not yet run</span>
            )}
          </div>
          <button
            onClick={refresh}
            className="p-1.5 text-gray-500 hover:text-amber-600 rounded-lg hover:bg-gray-100"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={handleRunAll}
            disabled={scannablePortals.length === 0}
            className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-500 flex items-center gap-1.5"
          >
            <Play size={12} /> Scan All Portals
          </button>
          <button
            onClick={() => setPasteOpen(!pasteOpen)}
            className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 flex items-center gap-1.5"
          >
            <ClipboardPaste size={12} /> Paste Results
          </button>
        </div>
      </div>

      {expanded && (
        <>
          {/* Runner hint — shown after queuing an auto job */}
          {runnerHint && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
              <div className="flex items-start gap-2">
                <Bot size={14} className="text-green-600 mt-0.5 shrink-0" />
                <div className="flex-1 text-[11px] text-green-800 leading-relaxed">
                  {runnerHint}
                </div>
                <button onClick={() => setRunnerHint(null)} className="text-green-600 hover:text-green-800">
                  <X size={12} />
                </button>
              </div>
            </div>
          )}

          {/* Missing credentials warning */}
          {missingCreds.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
              <div className="flex items-start gap-2">
                <ShieldAlert size={14} className="text-red-500 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="text-xs font-semibold text-red-800 mb-1">
                    {missingCreds.length} enabled portal{missingCreds.length > 1 ? 's' : ''} require login but {missingCreds.length > 1 ? 'have' : 'has'} no credential set
                  </div>
                  <div className="text-[11px] text-red-700">
                    {missingCreds.map(p => p.name).join(', ')} — these will be skipped until you set a 1Password item name in <a href="/settings" className="underline">Configuration → Portals</a>.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Prompt panel */}
          {promptOpen && (
            <div className="bg-white rounded-lg border border-amber-200 p-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Globe size={14} className="text-amber-500" />
                  <span className="text-sm font-semibold text-gray-900">
                    Scan prompt for {requestedPortals.length} portal{requestedPortals.length > 1 ? 's' : ''}
                  </span>
                </div>
                <button onClick={() => setPromptOpen(false)} className="text-gray-300 hover:text-gray-500">
                  <X size={16} />
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mb-3">
                Copy this into Claude-in-Chrome. It will demand a status report for every portal listed — silent failures will be impossible. When it finishes, come back and paste the JSON.
              </p>
              <textarea
                value={generatedPrompt}
                readOnly
                rows={8}
                className="w-full text-[10px] font-mono bg-gray-50 border border-gray-200 rounded-lg p-3 outline-none resize-y"
              />
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={handleCopyPrompt}
                  className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 flex items-center gap-1.5"
                >
                  <Copy size={12} /> {copied ? 'Copied!' : 'Copy Prompt'}
                </button>
                <button
                  onClick={() => setPasteOpen(true)}
                  className="px-3 py-1.5 text-amber-600 hover:text-amber-800 text-xs font-medium"
                >
                  → Ready to paste results
                </button>
              </div>
            </div>
          )}

          {/* Paste results panel */}
          {pasteOpen && (
            <div className="bg-white rounded-lg border border-blue-200 p-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ClipboardPaste size={14} className="text-blue-500" />
                  <span className="text-sm font-semibold text-gray-900">Paste Claude-in-Chrome output</span>
                </div>
                <button onClick={() => { setPasteOpen(false); setPasteText(''); setPasteError(null); setIngestResult(null) }} className="text-gray-300 hover:text-gray-500">
                  <X size={16} />
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mb-2">
                Paste the JSON object the agent returned. Every requested portal <strong>must</strong> appear in portal_results — anything missing gets recorded as a failed scan.
              </p>
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                rows={6}
                placeholder='{"portal_results": [{"portal_id": "mb_civic", "status": "success", ...}], "permits": [...]}'
                className="w-full text-[10px] font-mono bg-gray-50 border border-gray-200 rounded-lg p-3 outline-none resize-y"
              />
              {pasteError && (
                <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2 flex items-start gap-2">
                  <AlertTriangle size={12} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-red-700">{pasteError}</p>
                </div>
              )}
              {ingestResult && (
                <div className={`mt-2 rounded-lg p-2 text-[11px] border ${ingestResult.failed > 0 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                  <div className="font-semibold flex items-center gap-1.5">
                    {ingestResult.failed > 0 ? <AlertTriangle size={12} /> : <Check size={12} />}
                    Ingested {ingestResult.total} portal results
                  </div>
                  <div className="mt-0.5">
                    {ingestResult.succeeded} succeeded · {ingestResult.partial} partial · <strong>{ingestResult.failed} failed</strong>
                    {ingestResult.missing > 0 && <> · <strong>{ingestResult.missing} silently skipped by agent (now recorded as failed)</strong></>}
                  </div>
                  {(ingestResult.permits_inserted > 0 || ingestResult.permits_updated > 0) && (
                    <div className="mt-0.5">
                      → {ingestResult.permits_inserted} new permits, {ingestResult.permits_updated} updated in permits table
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={handleIngest}
                  disabled={ingesting || !pasteText.trim()}
                  className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-500 flex items-center gap-1.5"
                >
                  {ingesting ? 'Ingesting…' : <><Check size={12} /> Ingest & Record</>}
                </button>
              </div>
            </div>
          )}

          {/* Portal rows */}
          {loading ? (
            <div className="text-xs text-gray-400 py-4">Loading…</div>
          ) : enabledPortals.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
              <Globe size={20} className="mx-auto text-gray-300 mb-2" />
              <p className="text-xs text-gray-500">No portals enabled. Enable portals in <a href="/settings" className="text-amber-600 hover:underline">Configuration → Portals</a>.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {ROLE_GROUPS.map(group => {
                const portalsInGroup = enabledPortals.filter(p => (p.role || 'enrichment') === group.role)
                if (portalsInGroup.length === 0) return null
                return (
                  <div key={group.role}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <group.Icon size={12} className="text-gray-400" />
                      <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{group.label}</h3>
                      <span className="text-[10px] text-gray-400 font-normal">{group.desc}</span>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      {portalsInGroup.map((p, i) => (
                        <PortalRow
                          key={p.id}
                          p={p}
                          isFirst={i === 0}
                          latest={latestByPortal[p.id]}
                          activeJobsCount={Object.keys(activeJobs).length}
                          onRun={handleRunOne}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </>
  )
}
