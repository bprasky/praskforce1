'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { getMeetings, getTasks, updateTask, TASK_TYPES, TASK_STATUS } from '@/lib/tasks'
import { listJobs, updateJob, createJob, JOB_STATUS } from '@/lib/agent-jobs'
import { draftRecap, DEAL_STAGES } from '@/lib/recap'
import { listQuotes, updateQuote, QUOTE_STATUS } from '@/lib/quotes'
import {
  Briefcase, FileText, Send, ExternalLink, Plus, CheckCircle, Play,
  Clock, User, MapPin, Zap, RefreshCw, Copy, AlertTriangle, Sparkles,
  ChevronDown, ChevronRight, Link2, Search
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

function StagePill({ stage, pct }) {
  const info = DEAL_STAGES[stage]
  if (!info) return null
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
      <Sparkles size={9} /> {info.label}{typeof pct === 'number' ? ` · ${pct}%` : ''}
    </span>
  )
}

function JobStatusPill({ status }) {
  const info = JOB_STATUS[status] || JOB_STATUS.queued
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${info.bg} ${info.color}`}>
      {info.label}
    </span>
  )
}

export default function PipelinePage() {
  const [meetings, setMeetings] = useState([])
  const [tasks, setTasks] = useState([])
  const [jobs, setJobs] = useState([])
  const [quotes, setQuotes] = useState([])
  const [expanded, setExpanded] = useState({})  // { [meetingId]: true }
  const [redrafting, setRedrafting] = useState({}) // { [jobId]: true }
  const [copied, setCopied] = useState(null) // jobId
  const [quotesOpen, setQuotesOpen] = useState(true)
  const [quotesSearch, setQuotesSearch] = useState('')
  const [quotesStatusFilter, setQuotesStatusFilter] = useState('all')

  const refresh = useCallback(async () => {
    setMeetings(getMeetings())
    setTasks(getTasks())
    const [j, q] = await Promise.all([listJobs(), listQuotes()])
    setJobs(j)
    setQuotes(q || [])
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Refresh jobs periodically so a draft completed in the background
  // while the user is on this page surfaces without a manual reload.
  useEffect(() => {
    const interval = setInterval(() => {
      listJobs().then(setJobs).catch(() => {})
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  // Join meetings with their extracted tasks and agent jobs
  const deals = useMemo(() => {
    return meetings.map(m => {
      const meetingTasks = tasks.filter(t => t.meeting_id === m.id)
      const meetingJobs = jobs.filter(j => j.meeting_id === m.id)
      const quoteJob = meetingJobs.find(j => j.kind === 'sp_quote')
      const recapJob = meetingJobs.find(j => j.kind === 'outlook_recap')
      const open = meetingTasks.filter(t => t.status !== 'done').length
      const done = meetingTasks.filter(t => t.status === 'done').length
      return { ...m, tasks: meetingTasks, jobs: meetingJobs, quoteJob, recapJob, open, done }
    })
  }, [meetings, tasks, jobs])

  const stats = useMemo(() => ({
    deals: deals.length,
    active: deals.filter(d => d.open > 0).length,
    openTasks: deals.reduce((s, d) => s + d.open, 0),
    quotesPending: jobs.filter(j => j.kind === 'sp_quote' && j.status === 'queued').length,
  }), [deals, jobs])

  function toggleExpand(id) {
    setExpanded(e => ({ ...e, [id]: !e[id] }))
  }

  // ── Quote actions ──

  async function handleStartQuote(deal) {
    // Create the job on demand if the meeting didn't originally produce one
    // (e.g. parsed items had no QUOTE type but the user wants to quote anyway).
    let job = deal.quoteJob
    if (!job) {
      job = await createJob({
        kind: 'sp_quote',
        priority: 3,
        meeting_id: deal.id,
        payload: {
          contact: deal.contact,
          property: deal.property,
          notes: deal.notes,
          source: 'manual_trigger',
        },
      })
    } else {
      await updateJob(job.id, { status: 'running' })
    }
    await refresh()
  }

  async function handleMarkQuoteDone(deal) {
    if (!deal.quoteJob) return
    await updateJob(deal.quoteJob.id, { status: 'done' })
    await refresh()
  }

  // ── Recap actions ──

  async function handleRedraft(deal) {
    if (!deal.recapJob) return
    const job = deal.recapJob
    setRedrafting(r => ({ ...r, [job.id]: true }))
    try {
      const drafted = await draftRecap({
        notes: deal.notes,
        contact: deal.contact,
        property: deal.property,
      })
      await updateJob(job.id, {
        status: 'queued',
        error: null,
        payload: { ...job.payload, drafted },
      })
      await refresh()
    } catch (e) {
      await updateJob(job.id, { status: 'needs_review', error: e.message })
      await refresh()
    } finally {
      setRedrafting(r => ({ ...r, [job.id]: false }))
    }
  }

  async function handleCopyRecap(deal) {
    const drafted = deal.recapJob?.payload?.drafted
    if (!drafted) return
    const text = `Subject: ${drafted.subject}\n\n${drafted.body}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(deal.recapJob.id)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      alert('Copy failed — your browser blocked clipboard access. Select the text manually.')
    }
  }

  async function handleMarkRecapSent(deal) {
    if (!deal.recapJob) return
    await updateJob(deal.recapJob.id, { status: 'done' })
    await refresh()
  }

  async function handleTaskStatus(taskId, status) {
    updateTask(taskId, { status })
    setTasks(getTasks())
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-56">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Pipeline</h1>
            <p className="text-xs text-gray-500">Active deals from meeting notes — quote, follow up, close</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className="p-2 text-gray-500 hover:text-amber-600 rounded-lg hover:bg-gray-100"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
            <Link
              href="/tasks"
              className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 bg-amber-500 text-white hover:bg-amber-600"
            >
              <Plus size={14} /> New Meeting Notes
            </Link>
          </div>
        </header>

        <div className="p-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { l: 'Deals', v: stats.deals, c: 'text-gray-900' },
              { l: 'Active', v: stats.active, c: 'text-amber-600' },
              { l: 'Open Tasks', v: stats.openTasks, c: 'text-blue-600' },
              { l: 'Quotes Queued', v: stats.quotesPending, c: 'text-purple-600' },
            ].map((s, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
                <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">{s.l}</div>
                <div className={`text-xl font-bold ${s.c}`}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* Deals */}
          {deals.length === 0 ? (
            <div className="bg-white rounded-lg border border-dashed border-gray-300 p-12 text-center">
              <Briefcase size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-600 mb-1 font-medium">No active deals yet</p>
              <p className="text-xs text-gray-400 mb-4">Enter meeting notes on the Tasks page — each meeting becomes a deal card here with an auto-queued quote and a drafted recap email.</p>
              <Link
                href="/tasks"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600"
              >
                <Plus size={14} /> Add Meeting Notes
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {deals.map(deal => {
                const drafted = deal.recapJob?.payload?.drafted
                const isExpanded = expanded[deal.id]
                const isDrafting = deal.recapJob && !drafted && deal.recapJob.status === 'queued' && !deal.recapJob.error
                const draftError = deal.recapJob?.error
                return (
                  <div key={deal.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    {/* Deal header */}
                    <div className="px-5 py-4 border-b border-gray-100">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Briefcase size={14} className="text-amber-500" />
                            <h3 className="text-sm font-semibold text-gray-900 truncate">
                              {deal.contact || 'Untitled meeting'}
                            </h3>
                            <span className="text-[10px] text-gray-400">{formatDate(deal.created_at)}</span>
                            {drafted && <StagePill stage={drafted.stage} pct={drafted.completion_percent} />}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                            {deal.contact && (
                              <span className="flex items-center gap-1"><User size={10} /> {deal.contact}</span>
                            )}
                            {deal.property && (
                              <span className="flex items-center gap-1"><MapPin size={10} /> {deal.property}</span>
                            )}
                            <span className="flex items-center gap-1">
                              <Zap size={10} /> {deal.open} open · {deal.done} done
                            </span>
                          </div>
                        </div>

                        {/* Quick actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {deal.quoteJob ? (
                            <button
                              onClick={() => deal.quoteJob.status === 'done' ? null : handleMarkQuoteDone(deal)}
                              disabled={deal.quoteJob.status === 'done'}
                              className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-500 flex items-center gap-1.5"
                              title="Mark StoneProfits quote as created"
                            >
                              <FileText size={12} />
                              {deal.quoteJob.status === 'done' ? 'Quote Created' : 'Mark Quote Done'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStartQuote(deal)}
                              className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 flex items-center gap-1.5"
                              title="Queue a StoneProfits quote for this deal"
                            >
                              <FileText size={12} /> Queue Quote
                            </button>
                          )}
                          <a
                            href="https://stoneprofits.arcaww.com"
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 flex items-center gap-1.5"
                          >
                            <ExternalLink size={12} /> StoneProfits
                          </a>
                        </div>
                      </div>

                      {/* Job status line */}
                      <div className="flex items-center gap-3 text-[11px] text-gray-500 pt-1">
                        {deal.quoteJob && (
                          <span className="flex items-center gap-1.5">
                            <FileText size={11} /> Quote: <JobStatusPill status={deal.quoteJob.status} />
                          </span>
                        )}
                        {deal.recapJob && (
                          <span className="flex items-center gap-1.5">
                            <Send size={11} /> Recap: <JobStatusPill status={deal.recapJob.status} />
                          </span>
                        )}
                        {isDrafting && (
                          <span className="flex items-center gap-1.5 text-indigo-600">
                            <Clock size={11} className="animate-spin" /> Drafting recap with Claude...
                          </span>
                        )}
                        {draftError && (
                          <span className="flex items-center gap-1.5 text-red-600" title={draftError}>
                            <AlertTriangle size={11} /> Draft failed — {draftError.slice(0, 60)}{draftError.length > 60 ? '…' : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Drafted recap */}
                    {drafted && (
                      <div className="px-5 py-4 bg-indigo-50/40 border-b border-indigo-100">
                        <button
                          onClick={() => toggleExpand(deal.id)}
                          className="flex items-center gap-2 text-[11px] font-semibold text-indigo-700 uppercase tracking-wider mb-2 hover:text-indigo-900"
                        >
                          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          <Sparkles size={12} /> Drafted Recap
                          {drafted.tone && <span className="font-normal normal-case text-indigo-500 italic">· {drafted.tone}</span>}
                        </button>

                        <div className="text-sm">
                          <div className="font-semibold text-gray-900 mb-1">
                            Subject: <span className="font-normal">{drafted.subject}</span>
                          </div>
                          <div className={`text-xs text-gray-700 leading-relaxed whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-3'}`}>
                            {drafted.body}
                          </div>
                        </div>

                        {isExpanded && (
                          <>
                            {drafted.next_actions?.length > 0 && (
                              <div className="mt-3">
                                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Next Actions</div>
                                <ul className="space-y-0.5">
                                  {drafted.next_actions.map((a, i) => (
                                    <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                                      <span className="text-indigo-400">→</span> {a}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {drafted.reasoning && (
                              <div className="mt-3">
                                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Claude's Read</div>
                                <p className="text-[11px] text-gray-600 italic leading-relaxed">{drafted.reasoning}</p>
                              </div>
                            )}
                          </>
                        )}

                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => handleCopyRecap(deal)}
                            className="px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-xs font-medium hover:bg-indigo-600 flex items-center gap-1.5"
                          >
                            <Copy size={12} /> {copied === deal.recapJob.id ? 'Copied!' : 'Copy Subject + Body'}
                          </button>
                          <a
                            href={`mailto:?subject=${encodeURIComponent(drafted.subject)}&body=${encodeURIComponent(drafted.body)}`}
                            className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600 flex items-center gap-1.5"
                          >
                            <Send size={12} /> Open in Mail
                          </a>
                          <button
                            onClick={() => handleRedraft(deal)}
                            disabled={redrafting[deal.recapJob.id]}
                            className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <RefreshCw size={12} className={redrafting[deal.recapJob.id] ? 'animate-spin' : ''} /> Re-draft
                          </button>
                          {deal.recapJob.status !== 'done' && (
                            <button
                              onClick={() => handleMarkRecapSent(deal)}
                              className="px-3 py-1.5 text-gray-500 hover:text-green-600 rounded-lg text-xs font-medium flex items-center gap-1.5"
                              title="Mark recap as sent"
                            >
                              <CheckCircle size={12} /> Mark Sent
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Re-draft button when drafting failed */}
                    {draftError && !drafted && (
                      <div className="px-5 py-3 bg-red-50/50 border-b border-red-100">
                        <button
                          onClick={() => handleRedraft(deal)}
                          disabled={redrafting[deal.recapJob?.id]}
                          className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <RefreshCw size={12} className={redrafting[deal.recapJob?.id] ? 'animate-spin' : ''} /> Retry Draft
                        </button>
                      </div>
                    )}

                    {/* Notes preview */}
                    {deal.notes && (
                      <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100">
                        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Meeting Notes</div>
                        <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{deal.notes}</p>
                      </div>
                    )}

                    {/* Task list */}
                    <div className="px-5 py-3">
                      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Action Items</div>
                      {deal.tasks.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No action items extracted for this meeting</p>
                      ) : (
                        <div className="space-y-1.5">
                          {deal.tasks.map(task => {
                            const tt = TASK_TYPES[task.type] || TASK_TYPES.CUSTOM
                            const ts = TASK_STATUS[task.status] || TASK_STATUS.pending
                            return (
                              <div key={task.id} className="flex items-center gap-2 py-1.5">
                                <span className="text-sm">{tt.icon}</span>
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tt.bg} ${tt.color} shrink-0`}>{tt.label}</span>
                                <p className="text-xs text-gray-700 flex-1 truncate">{task.description || 'No description'}</p>
                                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${ts.bg} ${ts.color} shrink-0`}>{ts.label}</span>
                                {task.status !== 'done' && (
                                  <button
                                    onClick={() => handleTaskStatus(task.id, 'done')}
                                    className="p-1 text-gray-300 hover:text-green-500"
                                    title="Mark done"
                                  >
                                    <CheckCircle size={14} />
                                  </button>
                                )}
                                {task.status === 'ready' && (
                                  <button
                                    onClick={() => handleTaskStatus(task.id, 'running')}
                                    className="p-1 text-gray-300 hover:text-amber-500"
                                    title="Run"
                                  >
                                    <Play size={14} />
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Quotes browser ───────────────────────────────────── */}
          {(() => {
            const filtered = quotes.filter(q => {
              if (quotesStatusFilter !== 'all' && q.status !== quotesStatusFilter) return false
              if (quotesSearch) {
                const s = quotesSearch.toLowerCase()
                const hay = [q.quote_number, q.customer_name, q.contact_name, q.project_name, q.address, q.materials].join(' ').toLowerCase()
                if (!hay.includes(s)) return false
              }
              return true
            })
            const totalValue = filtered.reduce((s, q) => s + (q.total_value || 0), 0)
            const fmtMoney = n => (n == null ? '—' : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${(n / 1e3).toFixed(0)}K`)
            const fmtDate = s => {
              if (!s) return '—'
              const d = new Date(s)
              return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
            }
            return (
              <div className="mt-8">
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => setQuotesOpen(!quotesOpen)}
                    className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wider hover:text-gray-900"
                  >
                    {quotesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <FileText size={14} className="text-gray-400" />
                    Quotes <span className="text-[10px] text-gray-400 font-normal normal-case">({quotes.length} total · {fmtMoney(totalValue)} filtered)</span>
                  </button>
                  {quotes.length === 0 && (
                    <a href="/settings" className="text-[11px] text-amber-600 hover:underline">Upload quotes CSV →</a>
                  )}
                </div>

                {quotesOpen && (
                  quotes.length === 0 ? (
                    <div className="bg-white rounded-lg border border-dashed border-gray-300 p-6 text-center">
                      <FileText size={20} className="mx-auto text-gray-300 mb-2" />
                      <p className="text-xs text-gray-500 mb-1">No quotes loaded</p>
                      <p className="text-[11px] text-gray-400">Upload a StoneProfits quote export on the Data Upload tab to seed this list.</p>
                    </div>
                  ) : (
                    <>
                      <div className="bg-white rounded-lg border border-gray-200 px-3 py-2 mb-2 flex items-center gap-3">
                        <Search size={12} className="text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search quote #, customer, project, materials..."
                          value={quotesSearch}
                          onChange={e => setQuotesSearch(e.target.value)}
                          className="flex-1 text-xs outline-none placeholder:text-gray-300"
                        />
                        <select
                          value={quotesStatusFilter}
                          onChange={e => setQuotesStatusFilter(e.target.value)}
                          className="text-[11px] border border-gray-200 rounded px-2 py-1 outline-none bg-white"
                        >
                          <option value="all">All statuses</option>
                          {Object.entries(QUOTE_STATUS).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                          ))}
                        </select>
                        <span className="text-[10px] text-gray-400">{filtered.length} shown</span>
                      </div>

                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr className="text-[10px] font-semibold text-gray-500 uppercase">
                              <th className="py-2 px-3 text-left">Quote #</th>
                              <th className="py-2 px-3 text-left">Date</th>
                              <th className="py-2 px-3 text-left">Customer</th>
                              <th className="py-2 px-3 text-left">Project</th>
                              <th className="py-2 px-3 text-left">Materials</th>
                              <th className="py-2 px-3 text-right">Value</th>
                              <th className="py-2 px-3 text-left">Status</th>
                              <th className="py-2 px-3 text-left">Linked</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map(q => {
                              const st = QUOTE_STATUS[q.status] || QUOTE_STATUS.unknown
                              return (
                                <tr key={q.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                                  <td className="py-2 px-3 font-mono text-gray-700">{q.quote_number || '—'}</td>
                                  <td className="py-2 px-3 text-gray-500">{fmtDate(q.quote_date)}</td>
                                  <td className="py-2 px-3 text-gray-800 truncate max-w-40">{q.customer_name || '—'}</td>
                                  <td className="py-2 px-3 text-gray-600 truncate max-w-40">{q.project_name || q.address || '—'}</td>
                                  <td className="py-2 px-3 text-gray-500 truncate max-w-48">{q.materials || '—'}</td>
                                  <td className="py-2 px-3 text-right font-mono text-gray-700">{fmtMoney(q.total_value)}</td>
                                  <td className="py-2 px-3">
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${st.bg} ${st.color}`}>{st.label}</span>
                                  </td>
                                  <td className="py-2 px-3 text-[10px] text-gray-500">
                                    {q.firm_id && <span className="inline-flex items-center gap-1 text-indigo-600" title="Linked to firm"><Link2 size={9} /> firm</span>}
                                    {q.meeting_id && <span className="inline-flex items-center gap-1 ml-1 text-amber-600" title="Linked to meeting"><Link2 size={9} /> meeting</span>}
                                    {!q.firm_id && !q.meeting_id && <span className="text-gray-400">—</span>}
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
          })()}
        </div>
      </main>
    </div>
  )
}
