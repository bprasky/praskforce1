'use client'
import { useState, useEffect, useCallback } from 'react'
import { listUploads, getUploadRows } from '@/lib/uploads'
import { listSignals, ingestIgScroll, updateSignal, deleteSignal, SIGNAL_STATUS } from '@/lib/social-signals'
import { generateAgentPrompt } from '@/lib/agent-prompts'
import { createJob, updateJob, listJobs } from '@/lib/agent-jobs'
import {
  Instagram, Users, Mail, Play, Copy, Check, ClipboardPaste, X,
  Trash2, ExternalLink, AlertTriangle, Sparkles, RefreshCw, UserPlus
} from 'lucide-react'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ScoreBar({ score }) {
  const color = score >= 90 ? 'from-green-500 to-emerald-500'
    : score >= 70 ? 'from-amber-500 to-orange-500'
    : score >= 50 ? 'from-blue-400 to-indigo-400'
    : 'from-gray-300 to-gray-400'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-10 bg-gray-200 rounded-full h-1.5 overflow-hidden">
        <div className={`h-1.5 rounded-full bg-gradient-to-r ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] font-mono text-gray-500 w-6">{score}</span>
    </div>
  )
}

export default function SocialSignalsSection() {
  const [uploads, setUploads] = useState([])
  const [signals, setSignals] = useState([])
  const [loading, setLoading] = useState(true)
  const [promptOpen, setPromptOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [generatedPrompt, setGeneratedPrompt] = useState('')
  const [promptJobId, setPromptJobId] = useState(null)
  const [pasteText, setPasteText] = useState('')
  const [pasteError, setPasteError] = useState(null)
  const [pasteResult, setPasteResult] = useState(null)
  const [copied, setCopied] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const [lastRunAt, setLastRunAt] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [u, s, jobs] = await Promise.all([listUploads(), listSignals(), listJobs({ kind: 'ig_daily_scroll' })])
      setUploads(u)
      setSignals(s)
      const lastDone = jobs.filter(j => j.status === 'done').sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))[0]
      setLastRunAt(lastDone?.completed_at || null)
    } catch (e) {
      console.warn('Failed to load social section', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const watchlistUpload = uploads.find(u => u.kind === 'instagram_watchlist')
  const clientUpload = uploads.find(u => u.kind === 'clients')
  const notConfigured = !watchlistUpload || !clientUpload

  async function handleRunRundown() {
    if (!watchlistUpload) {
      setPasteError('Upload an Instagram watchlist CSV first (Configuration → Data Upload, kind: Instagram Watchlist).')
      return
    }
    try {
      const watchlist = await getUploadRows(watchlistUpload.id)
      const prompt = generateAgentPrompt('IG-DAILY-001', {
        watchlist,
        lastRun: lastRunAt ? new Date(lastRunAt).toLocaleString() : null,
        lookbackDays: 7,
      })
      const job = await createJob({
        kind: 'ig_daily_scroll',
        priority: 5,
        payload: {
          watchlist_upload_id: watchlistUpload.id,
          watchlist_size: watchlist.length,
          prompt_preview: prompt.slice(0, 500),
        },
      })
      setGeneratedPrompt(prompt)
      setPromptJobId(job.id)
      setPromptOpen(true)
    } catch (e) {
      setPasteError('Failed to build rundown prompt: ' + e.message)
    }
  }

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(generatedPrompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: user can still select manually
    }
  }

  async function handleIngest() {
    setPasteError(null)
    setPasteResult(null)

    const text = pasteText.trim()
    if (!text) {
      setPasteError('Paste the JSON output from Claude-in-Chrome first.')
      return
    }

    // Tolerate markdown fencing
    const cleaned = text.replace(/```json|```/g, '').trim()

    let posts
    try {
      const parsed = JSON.parse(cleaned)
      posts = Array.isArray(parsed) ? parsed : parsed.posts || []
    } catch (e) {
      setPasteError('That doesn\'t look like valid JSON. The agent should return an array of post objects.')
      return
    }

    if (!posts.length) {
      setPasteError('Parsed OK but the array was empty. Nothing to ingest.')
      return
    }

    setIngesting(true)
    try {
      const result = await ingestIgScroll(posts)
      setPasteResult(result)
      if (promptJobId) {
        await updateJob(promptJobId, {
          status: 'done',
          result,
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

  async function handleMarkReviewed(id) {
    await updateSignal(id, { status: 'reviewed' })
    await refresh()
  }

  async function handleDismiss(id) {
    await updateSignal(id, { status: 'dismissed' })
    await refresh()
  }

  async function handleConvertToLead(id) {
    await updateSignal(id, { status: 'converted_to_lead' })
    await refresh()
    // TODO: also insert into properties/leads table once that flow is defined
  }

  async function handleDelete(id) {
    if (!confirm('Delete this signal?')) return
    await deleteSignal(id)
    await refresh()
  }

  // Only show new + reviewed (not dismissed/converted) on the main view
  const visibleSignals = signals.filter(s => s.status === 'new' || s.status === 'reviewed')

  return (
    <>
      <div className="flex items-center justify-between mb-2 mt-8">
        <div className="flex items-center gap-2">
          <Instagram size={14} className="text-gray-400" />
          <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Social Signals</h2>
          {notConfigured && (
            <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-medium">Setup required</span>
          )}
          {!notConfigured && lastRunAt && (
            <span className="text-[10px] text-gray-400">Last run: {formatDate(lastRunAt)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="p-1.5 text-gray-500 hover:text-amber-600 rounded-lg hover:bg-gray-100"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={handleRunRundown}
            disabled={!watchlistUpload}
            className="px-3 py-1.5 bg-pink-500 text-white rounded-lg text-xs font-medium hover:bg-pink-600 disabled:bg-gray-200 disabled:text-gray-500 flex items-center gap-1.5"
            title={watchlistUpload ? 'Generate the Claude-in-Chrome prompt' : 'Upload an instagram_watchlist CSV first'}
          >
            <Play size={12} /> Run Daily Rundown
          </button>
          <button
            onClick={() => setPasteOpen(!pasteOpen)}
            className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 flex items-center gap-1.5"
          >
            <ClipboardPaste size={12} /> Paste Results
          </button>
        </div>
      </div>

      {/* Setup help */}
      {notConfigured && (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-4 mb-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center shrink-0">
              <Instagram size={16} className="text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Set up social monitoring</h3>
              <p className="text-xs text-gray-600 leading-relaxed mb-3">
                Upload two CSVs in <a href="/settings" className="text-amber-600 hover:underline">Configuration → Data Upload</a>:
              </p>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${clientUpload ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                  {clientUpload ? <Check size={12} /> : <Users size={12} />}
                  <div className="flex-1">
                    <div className="font-semibold">Client List</div>
                    <div className="text-[10px]">{clientUpload ? `${clientUpload.row_count} clients loaded` : 'Upload with kind = Clients'}</div>
                  </div>
                </div>
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${watchlistUpload ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                  {watchlistUpload ? <Check size={12} /> : <Instagram size={12} />}
                  <div className="flex-1">
                    <div className="font-semibold">IG Watchlist</div>
                    <div className="text-[10px]">{watchlistUpload ? `${watchlistUpload.row_count} handles` : 'Upload with kind = Instagram Watchlist'}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Prompt modal-ish panel */}
      {promptOpen && (
        <div className="bg-white rounded-lg border border-pink-200 p-4 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-pink-500" />
              <span className="text-sm font-semibold text-gray-900">Prompt ready for Claude-in-Chrome</span>
            </div>
            <button onClick={() => setPromptOpen(false)} className="text-gray-300 hover:text-gray-500">
              <X size={16} />
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mb-3">
            Copy this prompt, paste it into Claude-in-Chrome, and run it. When it finishes, come back and click "Paste Results" below with the JSON output.
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
              className="px-3 py-1.5 bg-pink-500 text-white rounded-lg text-xs font-medium hover:bg-pink-600 flex items-center gap-1.5"
            >
              <Copy size={12} /> {copied ? 'Copied!' : 'Copy Prompt'}
            </button>
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 flex items-center gap-1.5"
            >
              <ExternalLink size={12} /> Open Instagram
            </a>
            <button
              onClick={() => { setPasteOpen(true) }}
              className="px-3 py-1.5 text-pink-600 hover:text-pink-800 rounded-lg text-xs font-medium"
            >
              → Ready to paste results
            </button>
          </div>
        </div>
      )}

      {/* Paste results panel */}
      {pasteOpen && (
        <div className="bg-white rounded-lg border border-amber-200 p-4 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ClipboardPaste size={14} className="text-amber-500" />
              <span className="text-sm font-semibold text-gray-900">Paste Claude-in-Chrome output</span>
            </div>
            <button onClick={() => { setPasteOpen(false); setPasteText(''); setPasteError(null); setPasteResult(null) }} className="text-gray-300 hover:text-gray-500">
              <X size={16} />
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mb-2">
            Paste the JSON array the agent returned. We'll cross-reference it against your client list locally (no API call) and save the matches.
          </p>
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            rows={6}
            placeholder='[{"handle": "@...", "post_url": "...", "caption": "...", ...}]'
            className="w-full text-[10px] font-mono bg-gray-50 border border-gray-200 rounded-lg p-3 outline-none resize-y"
          />
          {pasteError && (
            <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2 flex items-start gap-2">
              <AlertTriangle size={12} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-red-700">{pasteError}</p>
            </div>
          )}
          {pasteResult && (
            <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-2 text-[11px] text-green-700">
              <div className="font-semibold flex items-center gap-1.5"><Check size={12} /> Ingested {pasteResult.total} posts</div>
              <div className="mt-0.5">{pasteResult.matched} matched a client · {pasteResult.unmatched} unmatched (dropped as noise)</div>
            </div>
          )}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleIngest}
              disabled={ingesting || !pasteText.trim()}
              className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-500 flex items-center gap-1.5"
            >
              {ingesting ? 'Ingesting…' : <><Check size={12} /> Ingest & Match</>}
            </button>
          </div>
        </div>
      )}

      {/* Signals list */}
      {loading ? (
        <div className="text-xs text-gray-400 py-4">Loading…</div>
      ) : visibleSignals.length === 0 ? (
        !notConfigured && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
            <Instagram size={20} className="mx-auto text-gray-300 mb-2" />
            <p className="text-xs text-gray-500">No signals yet. Click "Run Daily Rundown" to generate a prompt.</p>
          </div>
        )
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {visibleSignals.map((s, i) => (
            <div key={s.id} className={`px-4 py-3 flex items-start gap-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
              <div className="w-8 h-8 rounded bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center shrink-0">
                <Instagram size={14} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">{s.handle || '(unknown handle)'}</span>
                  {s.matched_client && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                      → {s.matched_client}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400">{formatDate(s.post_date || s.created_at)}</span>
                  <ScoreBar score={s.relevance_score || 0} />
                  {s.match_type && s.match_type !== 'none' && (
                    <span className="text-[10px] text-gray-400">via {s.match_type}</span>
                  )}
                </div>
                {s.caption && (
                  <p className="text-xs text-gray-700 leading-relaxed line-clamp-2">{s.caption}</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  {s.post_url && (
                    <a
                      href={s.post_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-gray-500 hover:text-amber-600 flex items-center gap-1"
                    >
                      <ExternalLink size={10} /> View post
                    </a>
                  )}
                  <button
                    onClick={() => handleConvertToLead(s.id)}
                    className="text-[11px] text-green-600 hover:text-green-800 flex items-center gap-1"
                  >
                    <UserPlus size={10} /> Convert to Lead
                  </button>
                  {s.status === 'new' && (
                    <button
                      onClick={() => handleMarkReviewed(s.id)}
                      className="text-[11px] text-gray-500 hover:text-amber-600 flex items-center gap-1"
                    >
                      <Check size={10} /> Mark Reviewed
                    </button>
                  )}
                  <button
                    onClick={() => handleDismiss(s.id)}
                    className="text-[11px] text-gray-400 hover:text-red-500 flex items-center gap-1"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <button onClick={() => handleDelete(s.id)} className="text-gray-300 hover:text-red-500 shrink-0" title="Delete">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
