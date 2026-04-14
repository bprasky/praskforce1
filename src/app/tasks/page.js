'use client'
import { useState, useEffect, useMemo } from 'react'
import Sidebar from '@/components/Sidebar'
import {
  getTasks, saveTasks, addTask, updateTask, deleteTask, getMeetings, saveMeeting,
  TASK_TYPES, TASK_STATUS, LIFECYCLE_STAGES,
  buildParsePrompt, buildContinuationPrompt,
  findRecentMeetingForContact, findOpenTasksForContact,
} from '@/lib/tasks'
import { createJob, updateJob } from '@/lib/agent-jobs'
import { draftRecap } from '@/lib/recap'
import { getCompiledPrompt } from '@/components/AgentInstructionsTab'
import { getRefinedPrompt } from '@/components/AIConfigChat'
import { getConfig } from '@/lib/config'
import {
  LIFECYCLE,
  findSimilarResolutions,
  buildContextSnapshot,
  getLatestProposalForTask,
  updateProposal,
  computeMetrics,
} from '@/lib/task-learning'
import { generateProposal } from '@/lib/task-proposals'
import TaskProposalCard from '@/components/TaskProposalCard'
import TaskResolutionPanel from '@/components/TaskResolutionPanel'
import TaskChat from '@/components/TaskChat'
import OutlookImportPanel from '@/components/OutlookImportPanel'
import TasksMatrix from '@/components/TasksMatrix'
import { Plus, X, Send, Play, CheckCircle, Trash2, ChevronDown, ChevronRight, FileText, Zap, AlertTriangle, Clock, Filter, Sparkles, MessageCircle, TrendingUp, Mail, LayoutGrid, List, Users, Tag } from 'lucide-react'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function TasksPage() {
  const [tasks, setTasks] = useState([])
  const [showInput, setShowInput] = useState(false)
  const [notes, setNotes] = useState('')
  const [contactName, setContactName] = useState('')
  const [propertyAddress, setPropertyAddress] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parsedItems, setParsedItems] = useState(null)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('active')
  const [expandedId, setExpandedId] = useState(null)

  // Learning layer per-task state, keyed by task.id:
  //   proposals[id]   = { proposal, matches } from generateProposal()
  //   matches[id]     = matched historical resolutions for the history ribbon
  //   resolvingId     = task currently in the resolve panel (only one at a time)
  //   chatOpenId      = task with the chat thread open
  //   proposingId     = task currently waiting on a proposal generation call
  const [proposals, setProposals] = useState({})
  const [matchesByTask, setMatchesByTask] = useState({})
  const [resolvingId, setResolvingId] = useState(null)
  const [chatOpenId, setChatOpenId] = useState(null)
  const [proposingId, setProposingId] = useState(null)
  const [metrics, setMetrics] = useState(null)

  // View / sort / group state for the matrix layout. Persisted to
  // localStorage so Brad's preferences stick across sessions.
  const [view, setView] = useState('cards')      // 'cards' | 'matrix'
  const [groupBy, setGroupBy] = useState('none') // 'none' | 'contact' | 'type' | 'source'
  const [typeFilter, setTypeFilter] = useState('all')
  const [showOutlook, setShowOutlook] = useState(false)

  // Continuation state — populated when the contact name typed into the
  // notes form matches an existing client with open tasks. Drives the
  // "you have N open tasks for this client" banner and switches handleParse
  // to the continuation prompt path.
  const [continuationContext, setContinuationContext] = useState(null)

  useEffect(() => {
    try {
      const v = localStorage.getItem('pf1_tasks_view')
      const g = localStorage.getItem('pf1_tasks_group')
      if (v) setView(v)
      if (g) setGroupBy(g)
    } catch {}
  }, [])
  useEffect(() => { try { localStorage.setItem('pf1_tasks_view', view) } catch {} }, [view])
  useEffect(() => { try { localStorage.setItem('pf1_tasks_group', groupBy) } catch {} }, [groupBy])

  // Watch the contact name as Brad types. If it matches a recent client
  // with open tasks, surface a continuation banner so the parse uses the
  // continuation prompt instead of starting fresh.
  useEffect(() => {
    if (!contactName.trim()) { setContinuationContext(null); return }
    const open = findOpenTasksForContact(contactName)
    const recent = findRecentMeetingForContact(contactName, 21)
    if (open.length > 0 || recent) {
      setContinuationContext({ openTasks: open, recentMeeting: recent })
    } else {
      setContinuationContext(null)
    }
  }, [contactName, tasks])

  useEffect(() => { setTasks(getTasks()) }, [])

  // Refresh learning metrics whenever the task list changes — this drives
  // the adoption-curve banner at the top of the page.
  useEffect(() => {
    computeMetrics(7).then(setMetrics).catch(() => {})
  }, [tasks])

  // When the user expands a task, lazily look up any existing proposal +
  // matching history. Cached in state so re-expanding doesn't re-query.
  useEffect(() => {
    if (!expandedId || proposals[expandedId] !== undefined) return
    const task = tasks.find(t => t.id === expandedId)
    if (!task) return
    const snapshot = buildContextSnapshot(task)
    Promise.all([
      getLatestProposalForTask(task.id),
      findSimilarResolutions(task.type, snapshot, 5),
    ]).then(([proposal, matches]) => {
      setProposals(p => ({ ...p, [task.id]: proposal || null }))
      setMatchesByTask(m => ({ ...m, [task.id]: matches }))
    })
  }, [expandedId])

  async function handleGenerateProposal(task) {
    setProposingId(task.id)
    try {
      const result = await generateProposal({ task })
      setProposals(p => ({ ...p, [task.id]: result.proposal }))
      setMatchesByTask(m => ({ ...m, [task.id]: result.matches }))
      const updated = updateTask(task.id, { lifecycle: 'PROPOSED' })
      setTasks(updated)
    } catch (e) {
      console.warn('Proposal generation failed', e)
    } finally {
      setProposingId(null)
    }
  }

  async function handleAcceptProposal(task) {
    const proposal = proposals[task.id]
    if (proposal) await updateProposal(proposal.id, { status: 'accepted' })
    const updated = updateTask(task.id, { lifecycle: 'ACTIVE' })
    setTasks(updated)
    setResolvingId(task.id)
  }

  async function handleCorrectProposal(task) {
    const updated = updateTask(task.id, { lifecycle: 'RESOLVING' })
    setTasks(updated)
    setResolvingId(task.id)
  }

  async function handleRejectProposal(task) {
    const proposal = proposals[task.id]
    if (proposal) {
      await updateProposal(proposal.id, { status: 'rejected' })
      setProposals(p => ({ ...p, [task.id]: null }))
    }
  }

  function handleResolved(task) {
    const updated = updateTask(task.id, { lifecycle: 'RESOLVED', status: 'done' })
    setTasks(updated)
    setResolvingId(null)
    // Force-refresh matches so future tasks pick up this fresh resolution.
    setMatchesByTask(m => ({ ...m, [task.id]: undefined }))
  }

  // Shared expanded-detail renderer used by both the card view and the
  // matrix view. Keeps the proposal/resolution/chat workflow identical
  // across both layouts so switching views never loses functionality.
  function renderTaskDetail(task) {
    const tt = TASK_TYPES[task.type] || TASK_TYPES.CUSTOM
    const proposal = proposals[task.id]
    const matches = matchesByTask[task.id] || []
    const isResolving = resolvingId === task.id
    const isChatOpen = chatOpenId === task.id

    return (
      <div className="space-y-3">
        {/* Learning layer: proposal → resolve → chat */}
        {proposal === null && !isResolving && task.status !== 'done' && (
          <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between">
            <div className="text-[11px] text-gray-600">
              {matches.length > 0
                ? `${matches.length} similar historical task${matches.length === 1 ? '' : 's'} found.`
                : 'No matching history yet — the system needs more resolutions on this type of situation.'}
            </div>
            <button
              onClick={() => handleGenerateProposal(task)}
              disabled={proposingId === task.id}
              className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 ${
                proposingId === task.id ? 'bg-gray-200 text-gray-500' : 'bg-amber-500 text-white hover:bg-amber-600'
              }`}
            >
              <Sparkles size={12} />
              {proposingId === task.id ? 'Thinking…' : 'Propose Action'}
            </button>
          </div>
        )}

        {proposal && !isResolving && task.status !== 'done' && (
          <TaskProposalCard
            proposal={proposal}
            matches={matches}
            onAccept={() => handleAcceptProposal(task)}
            onCorrect={() => handleCorrectProposal(task)}
            onReject={() => handleRejectProposal(task)}
          />
        )}

        {isResolving && (
          <TaskResolutionPanel
            task={task}
            proposal={proposal}
            onResolved={() => handleResolved(task)}
            onCancel={() => setResolvingId(null)}
          />
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() => setChatOpenId(isChatOpen ? null : task.id)}
            className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <MessageCircle size={12} />
            {isChatOpen ? 'Close chat' : 'Open chat to explain or update this task'}
          </button>
          {!isResolving && task.status !== 'done' && (
            <button
              onClick={() => setResolvingId(task.id)}
              className="text-[11px] text-purple-600 hover:text-purple-800 flex items-center gap-1"
            >
              <CheckCircle size={12} /> Log resolution manually
            </button>
          )}
        </div>

        {isChatOpen && (
          <TaskChat
            task={task}
            onClose={() => setChatOpenId(null)}
            onResolutionLogged={() => {
              const updated = updateTask(task.id, { lifecycle: 'RESOLVED', status: 'done' })
              setTasks(updated)
            }}
            onTasksAdded={() => setTasks(getTasks())}
          />
        )}

        {/* Editable details — same grid as the cards view so switching
            views doesn't lose the inline edit affordances */}
        <div className="grid grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-gray-400 text-[10px] font-medium uppercase">Description</span>
            <textarea
              value={task.description || ''}
              onChange={e => { const updated = updateTask(task.id, { description: e.target.value }); setTasks(updated) }}
              rows={3}
              className="mt-1 w-full border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:border-amber-400 bg-white"
            />
          </div>
          <div>
            <span className="text-gray-400 text-[10px] font-medium uppercase">Details</span>
            <div className="mt-1 space-y-1.5">
              <div><span className="text-gray-400">Contact:</span> {task.contact || '—'}</div>
              <div><span className="text-gray-400">Property:</span> {task.property || '—'}</div>
              <div><span className="text-gray-400">Materials:</span> {task.materials || '—'}</div>
              <div><span className="text-gray-400">Deadline:</span> {task.deadline || '—'}</div>
              <div className="flex items-center gap-1">
                <span className="text-gray-400">Value:</span>
                <input
                  type="number"
                  value={task.value ?? ''}
                  placeholder="0"
                  onChange={e => {
                    const v = e.target.value === '' ? null : Number(e.target.value)
                    const updated = updateTask(task.id, { value: v })
                    setTasks(updated)
                  }}
                  className="w-24 border border-gray-200 rounded px-1.5 py-0.5 text-xs bg-white"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-400">Quote ref:</span>
                <input
                  type="text"
                  value={task.quote_ref || ''}
                  placeholder="Q-2024-…"
                  onChange={e => {
                    const updated = updateTask(task.id, { quote_ref: e.target.value || null })
                    setTasks(updated)
                  }}
                  className="w-28 border border-gray-200 rounded px-1.5 py-0.5 text-xs bg-white font-mono"
                />
              </div>
              <div><span className="text-gray-400">Playbook:</span> <span className="font-mono text-amber-600">{tt.playbook || 'none'}</span></div>
              <div><span className="text-gray-400">Systems:</span> {tt.systems?.join(', ') || 'none'}</div>
            </div>
          </div>
          <div>
            <span className="text-gray-400 text-[10px] font-medium uppercase">CRM Data to Record</span>
            {task.crm_data ? (
              <pre className="mt-1 text-xs text-gray-700 bg-white border border-gray-200 rounded p-2 whitespace-pre-wrap">{typeof task.crm_data === 'string' ? task.crm_data : JSON.stringify(task.crm_data, null, 2)}</pre>
            ) : (
              <p className="mt-1 text-gray-400 italic">No CRM data extracted</p>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {['pending', 'ready', 'running', 'needs_review', 'done'].map(s => (
                <button key={s} onClick={() => { const updated = updateTask(task.id, { status: s }); setTasks(updated) }} className={`text-[10px] px-2 py-0.5 rounded ${task.status === s ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {TASK_STATUS[s].label}
                </button>
              ))}
            </div>
            <button onClick={() => { handleDelete(task.id); setExpandedId(null) }} className="mt-2 text-[10px] text-red-500 hover:text-red-700 flex items-center gap-1"><Trash2 size={10} /> Delete task</button>
          </div>
        </div>
      </div>
    )
  }

  const filtered = useMemo(() => {
    let rows = tasks
    if (statusFilter === 'active') rows = rows.filter(t => t.status !== 'done')
    else if (statusFilter === 'done') rows = rows.filter(t => t.status === 'done')
    if (typeFilter !== 'all') rows = rows.filter(t => t.type === typeFilter)
    return rows
  }, [tasks, statusFilter, typeFilter])

  const stats = useMemo(() => ({
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending' || t.status === 'ready').length,
    running: tasks.filter(t => t.status === 'running' || t.status === 'needs_review').length,
    done: tasks.filter(t => t.status === 'done').length,
  }), [tasks])

  // Parse meeting notes via AI. Two paths:
  //   (a) FRESH: contact is new — use the standard parse prompt.
  //   (b) CONTINUATION: contact has open tasks from a recent meeting —
  //       use buildContinuationPrompt so Claude dedupes against existing
  //       tasks and only extracts NEW action items, plus optionally
  //       marks some existing tasks as resolved.
  async function handleParse() {
    if (!notes.trim()) { setError('Enter meeting notes'); return }
    const config = getConfig()
    if (!config.ai?.api_key) { setError('Add your Claude API key in Settings → AI & Outreach'); return }

    setParsing(true)
    setError(null)
    try {
      const isContinuation = !!continuationContext && continuationContext.openTasks.length > 0
      const prompt = isContinuation
        ? buildContinuationPrompt({
            notes,
            contactName,
            propertyAddress,
            openTasks: continuationContext.openTasks,
            lastMeetingNotes: continuationContext.recentMeeting?.notes || null,
          })
        : buildParsePrompt(notes, contactName, propertyAddress)
      const systemPrompt = getRefinedPrompt() || getCompiledPrompt()
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': config.ai.api_key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: config.ai.model || 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          system: systemPrompt || undefined,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error.message)
      const text = data.content?.[0]?.text || ''
      const cleaned = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)

      if (isContinuation) {
        // Continuation shape: { resolved_task_ids, resolution_notes, new_tasks }
        // Stash resolution metadata for the accept handler to apply.
        setParsedItems({
          isContinuation: true,
          resolved_task_ids: parsed.resolved_task_ids || [],
          resolution_notes: parsed.resolution_notes || {},
          items: parsed.new_tasks || [],
        })
      } else {
        setParsedItems({ isContinuation: false, items: parsed })
      }
    } catch (e) {
      setError('Parse failed: ' + e.message)
    } finally {
      setParsing(false)
    }
  }

  // Accept parsed items as tasks, then auto-queue downstream agent jobs
  // (StoneProfits quote + Outlook recap). The recap drafting runs in the
  // background against the Claude API and writes back to the job when done.
  //
  // For continuation parses, also close out any existing open tasks the
  // model said were resolved by the new notes, with the model's stated
  // reason captured as a resolution note (so the learning system gets
  // training signal even on auto-resolved continuations).
  async function handleAcceptAll() {
    if (!parsedItems) return
    const items = parsedItems.items || []
    let updated = tasks
    const meeting = saveMeeting({ contact: contactName, property: propertyAddress, notes, task_count: items.length })

    // Close out tasks Claude said are resolved by these new notes.
    if (parsedItems.isContinuation && parsedItems.resolved_task_ids?.length > 0) {
      for (const id of parsedItems.resolved_task_ids) {
        const reason = parsedItems.resolution_notes?.[id] || 'resolved by new meeting notes'
        updated = updateTask(id, { status: 'done', lifecycle: 'RESOLVED', resolution_note: reason })
      }
    }

    items.forEach(item => {
      updated = addTask({
        type: item.type || 'CUSTOM',
        description: item.description,
        contact: item.contact || contactName,
        property: item.property || propertyAddress,
        materials: item.materials || null,
        deadline: item.deadline || null,
        priority: item.priority || 'medium',
        value: item.value ?? null,
        quote_ref: item.quote_ref || null,
        crm_data: item.crm_data || null,
        meeting_id: meeting.id,
        source: 'meeting_notes',
        status: 'ready',
      })
    })
    setTasks(updated)

    // Queue browser-agent jobs so the Pipeline card has something to act on.
    // Only queue sp_quote if the meeting actually produced a QUOTE task —
    // otherwise there's nothing to create in StoneProfits.
    const hasQuoteTask = items.some(i => i.type === 'QUOTE')
    const materials = items.map(i => i.materials).filter(Boolean).join(', ')

    try {
      if (hasQuoteTask) {
        await createJob({
          kind: 'sp_quote',
          priority: 3,
          meeting_id: meeting.id,
          payload: {
            contact: contactName,
            property: propertyAddress,
            materials,
            notes,
            source: 'meeting_notes',
          },
        })
      }
      const recapJob = await createJob({
        kind: 'outlook_recap',
        priority: 4,
        meeting_id: meeting.id,
        payload: {
          contact: contactName,
          property: propertyAddress,
          notes,
          drafted: null, // filled in by draftRecap below
        },
      })

      // Fire the recap draft in background. Any failure is surfaced via
      // the job's error field on the Pipeline page — we don't block the
      // UI on it since the user just wants to get to the next meeting.
      draftRecap({ notes, contact: contactName, property: propertyAddress })
        .then(drafted => {
          updateJob(recapJob.id, {
            payload: { ...recapJob.payload, drafted },
          })
        })
        .catch(err => {
          updateJob(recapJob.id, {
            status: 'needs_review',
            error: err.message,
          })
        })
    } catch (e) {
      console.warn('Failed to queue agent jobs:', e)
    }

    setParsedItems(null)
    setNotes('')
    setContactName('')
    setPropertyAddress('')
    setShowInput(false)
  }

  function handleStatusChange(id, status) {
    const updated = updateTask(id, { status })
    setTasks(updated)
  }

  function handleDelete(id) {
    const updated = deleteTask(id)
    setTasks(updated)
  }

  // Add single manual task
  function handleManualAdd(type) {
    const updated = addTask({ type, description: '', status: 'pending', priority: 'medium', contact: '', property: '' })
    setTasks(updated)
    setExpandedId(updated[0].id)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-56">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Tasks</h1>
            <p className="text-xs text-gray-500">Meeting notes + inbox → action items → executed in your systems</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowOutlook(!showOutlook); if (!showOutlook) setShowInput(false) }}
              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                showOutlook ? 'bg-gray-200 text-gray-700' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {showOutlook ? <><X size={14} /> Close</> : <><Mail size={14} /> Import from Outlook</>}
            </button>
            <button
              onClick={() => { setShowInput(!showInput); if (!showInput) setShowOutlook(false) }}
              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                showInput ? 'bg-gray-200 text-gray-700' : 'bg-amber-500 text-white hover:bg-amber-600'
              }`}
            >
              {showInput ? <><X size={14} /> Close</> : <><Plus size={14} /> Meeting Notes</>}
            </button>
          </div>
        </header>

        <div className="p-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            {[
              { l: 'Total Tasks', v: stats.total, c: 'text-gray-900' },
              { l: 'Pending / Ready', v: stats.pending, c: 'text-amber-600' },
              { l: 'In Progress', v: stats.running, c: 'text-blue-600' },
              { l: 'Completed', v: stats.done, c: 'text-green-600' },
            ].map((s, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
                <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">{s.l}</div>
                <div className={`text-xl font-bold ${s.c}`}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* Learning adoption banner — the key signal that the system is
              getting smarter over time. acceptance_rate should trend up;
              coverage_rate climbs as more resolutions are stored. */}
          {metrics && metrics.total_tasks > 0 && (
            <div className="bg-white border border-purple-200 rounded-lg px-4 py-3 mb-4 flex items-center gap-6">
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-purple-600" />
                <span className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider">
                  Learning · last 7 days
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500 uppercase">Acceptance</span>
                <span className="text-sm font-bold text-green-600">
                  {Math.round(metrics.acceptance_rate * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500 uppercase">Coverage</span>
                <span className="text-sm font-bold text-blue-600">
                  {Math.round(metrics.coverage_rate * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500 uppercase">Corrections</span>
                <span className="text-sm font-bold text-amber-600">
                  {metrics.proposals_corrected}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500 uppercase">Avg Confidence</span>
                <span className="text-sm font-bold text-gray-700">
                  {Math.round(metrics.avg_confidence * 100)}%
                </span>
              </div>
            </div>
          )}

          {/* Outlook Import Panel — paste an email or queue a background scan */}
          {showOutlook && (
            <OutlookImportPanel
              onClose={() => setShowOutlook(false)}
              onTasksCreated={() => setTasks(getTasks())}
            />
          )}

          {/* Meeting Notes Input */}
          {showInput && (
            <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
              <div className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2"><FileText size={16} /> New Meeting Notes</div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <span className="text-[10px] font-medium text-gray-500">Contact Name</span>
                  <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Who did you meet with?" className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400" />
                </div>
                <div>
                  <span className="text-[10px] font-medium text-gray-500">Property / Project</span>
                  <input value={propertyAddress} onChange={e => setPropertyAddress(e.target.value)} placeholder="Address or project name (optional)" className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400" />
                </div>
              </div>

              <div className="mb-3">
                <span className="text-[10px] font-medium text-gray-500">Meeting Notes</span>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={6}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400 leading-relaxed"
                  placeholder="Paste your meeting notes here. The AI will extract action items, map them to task playbooks, and identify CRM data to record..."
                />
              </div>

              {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-3">{error}</div>}

              {/* Continuation banner — shows when contact has open tasks
                  from a prior meeting. Tells Brad the parse will pick up
                  where the last meeting left off rather than restart. */}
              {continuationContext && continuationContext.openTasks.length > 0 && !parsedItems && (
                <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mb-3 text-[11px] text-violet-800">
                  <div className="font-semibold mb-1">
                    Continuing from {continuationContext.openTasks.length} open task{continuationContext.openTasks.length === 1 ? '' : 's'} for {contactName}
                  </div>
                  <div className="text-violet-700">
                    The new notes will be parsed against existing tasks. Claude will mark any that are now resolved and only extract genuinely new action items.
                  </div>
                </div>
              )}

              {/* Parsed preview */}
              {parsedItems && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                      <Zap size={12} />
                      {parsedItems.isContinuation
                        ? `${parsedItems.items.length} new task${parsedItems.items.length === 1 ? '' : 's'}` +
                          (parsedItems.resolved_task_ids?.length > 0
                            ? ` · ${parsedItems.resolved_task_ids.length} existing resolved`
                            : '')
                        : `${parsedItems.items.length} action items extracted`}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setParsedItems(null)} className="text-xs text-gray-500 hover:text-gray-700">Discard</button>
                      <button onClick={handleAcceptAll} className="px-3 py-1 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600">Accept All → Create Tasks</button>
                    </div>
                  </div>

                  {/* Resolved-by-continuation list */}
                  {parsedItems.isContinuation && parsedItems.resolved_task_ids?.length > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded p-2 mb-2">
                      <div className="text-[10px] font-semibold text-green-800 uppercase mb-1">
                        These existing tasks will be marked resolved
                      </div>
                      {parsedItems.resolved_task_ids.map(id => {
                        const t = tasks.find(x => x.id === id)
                        if (!t) return null
                        const reason = parsedItems.resolution_notes?.[id]
                        return (
                          <div key={id} className="text-[11px] text-green-900">
                            ✓ {t.description} {reason && <span className="text-green-700 italic">— {reason}</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="space-y-2">
                    {parsedItems.items.map((item, i) => {
                      const tt = TASK_TYPES[item.type] || TASK_TYPES.CUSTOM
                      return (
                        <div key={i} className="bg-white rounded-lg p-3 flex items-start gap-3">
                          <span className="text-lg">{tt.icon}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tt.bg} ${tt.color}`}>{tt.label}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${item.priority === 'high' ? 'bg-red-50 text-red-600' : item.priority === 'low' ? 'bg-gray-50 text-gray-500' : 'bg-yellow-50 text-yellow-600'}`}>{item.priority}</span>
                              {item.value != null && (
                                <span className="text-[10px] font-semibold text-emerald-700">${Number(item.value).toLocaleString()}</span>
                              )}
                              {item.quote_ref && (
                                <span className="text-[10px] font-mono text-blue-700">{item.quote_ref}</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-700">{item.description}</p>
                            {item.crm_data && <p className="text-[10px] text-blue-600 mt-1 flex items-center gap-1">💾 CRM: {typeof item.crm_data === 'string' ? item.crm_data : JSON.stringify(item.crm_data)}</p>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button onClick={handleParse} disabled={parsing} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${parsing ? 'bg-gray-200 text-gray-500' : 'bg-amber-500 text-white hover:bg-amber-600'}`}>
                  {parsing ? <><Clock size={14} className="animate-spin" /> Parsing...</> : <><Zap size={14} /> Extract Action Items</>}
                </button>
                <span className="text-[10px] text-gray-400">AI reads your notes → extracts tasks → maps to playbooks → identifies CRM data</span>
              </div>
            </div>
          )}

          {/* Filter / sort / view toolbar */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Filter size={14} className="text-gray-400" />
            {['active', 'done', 'all'].map(f => (
              <button key={f} onClick={() => setStatusFilter(f)} className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${statusFilter === f ? 'bg-amber-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {f.charAt(0).toUpperCase() + f.slice(1)} {f === 'active' ? `(${stats.pending + stats.running})` : f === 'done' ? `(${stats.done})` : `(${stats.total})`}
              </button>
            ))}

            {/* Type filter — narrow to a single category like Trello lists */}
            <div className="flex items-center gap-1 ml-2">
              <Tag size={12} className="text-gray-400" />
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="border border-gray-200 rounded px-2 py-1 text-xs bg-white"
              >
                <option value="all">All categories</option>
                {Object.values(TASK_TYPES).map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Group-by — only meaningful in matrix view but the option
                is always visible so toggling between views is sticky */}
            <div className="flex items-center gap-1 ml-2">
              <Users size={12} className="text-gray-400" />
              <select
                value={groupBy}
                onChange={e => setGroupBy(e.target.value)}
                className="border border-gray-200 rounded px-2 py-1 text-xs bg-white"
              >
                <option value="none">No grouping</option>
                <option value="contact">Group by client</option>
                <option value="type">Group by category</option>
                <option value="source">Group by source</option>
              </select>
            </div>

            {/* View toggle: cards (current) vs matrix (sortable table) */}
            <div className="ml-auto flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setView('cards')}
                className={`px-3 py-1 text-xs font-medium flex items-center gap-1 ${
                  view === 'cards' ? 'bg-amber-500 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
                title="Card view"
              >
                <List size={12} /> Cards
              </button>
              <button
                onClick={() => setView('matrix')}
                className={`px-3 py-1 text-xs font-medium flex items-center gap-1 ${
                  view === 'matrix' ? 'bg-amber-500 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
                title="Matrix view"
              >
                <LayoutGrid size={12} /> Matrix
              </button>
            </div>
          </div>

          {/* Task list — matrix or cards layout */}
          {view === 'matrix' ? (
            <TasksMatrix
              tasks={filtered}
              expandedId={expandedId}
              onExpand={setExpandedId}
              renderExpanded={renderTaskDetail}
              groupBy={groupBy}
            />
          ) : (
            <div className="space-y-2">
              {filtered.map(task => {
                const tt = TASK_TYPES[task.type] || TASK_TYPES.CUSTOM
                const ts = TASK_STATUS[task.status] || TASK_STATUS.pending
                const isOpen = expandedId === task.id

                return (
                  <div key={task.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div onClick={() => setExpandedId(isOpen ? null : task.id)} className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50/50 transition-colors">
                      <span className="text-lg">{tt.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tt.bg} ${tt.color}`}>{tt.label}</span>
                          {task.contact && <span className="text-xs text-gray-500 truncate">{task.contact}</span>}
                          {task.property && <><span className="text-gray-300">·</span><span className="text-xs text-gray-400 truncate">{task.property}</span></>}
                          {task.value != null && (
                            <span className="text-[10px] font-semibold text-emerald-700">
                              ${Number(task.value) >= 1000 ? `${Math.round(Number(task.value)/1000)}k` : Number(task.value)}
                            </span>
                          )}
                          {task.quote_ref && (
                            <span className="text-[10px] font-mono text-blue-700">{task.quote_ref}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-800 truncate">{task.description || 'No description'}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-gray-400">{formatDate(task.created_at)}</span>
                        {task.lifecycle && LIFECYCLE[task.lifecycle] && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider ${LIFECYCLE[task.lifecycle].bg} ${LIFECYCLE[task.lifecycle].color}`}>
                            {LIFECYCLE[task.lifecycle].label}
                          </span>
                        )}
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${ts.bg} ${ts.color}`}>{ts.label}</span>
                        {task.status === 'ready' && (
                          <button onClick={e => { e.stopPropagation(); handleStatusChange(task.id, 'needs_review') }} className="px-2 py-1 bg-amber-500 text-white rounded text-[10px] font-medium hover:bg-amber-600 flex items-center gap-1" title="Run this task">
                            <Play size={10} /> Run
                          </button>
                        )}
                        {task.status !== 'done' && (
                          <button onClick={e => { e.stopPropagation(); handleStatusChange(task.id, 'done') }} className="p-1 text-gray-300 hover:text-green-500"><CheckCircle size={14} /></button>
                        )}
                      </div>
                    </div>

                    {isOpen && (
                      <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50">
                        {renderTaskDetail(task)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {filtered.length === 0 && (
            <div className="text-center py-12">
              <Zap size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-500 mb-1">{statusFilter === 'done' ? 'No completed tasks yet' : 'No active tasks'}</p>
              <p className="text-xs text-gray-400">Click "+ Meeting Notes" or "Import from Outlook" to populate the board</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
