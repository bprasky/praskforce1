'use client'
import { useState, useEffect, useMemo } from 'react'
import Sidebar from '@/components/Sidebar'
import { getTasks, saveTasks, addTask, updateTask, deleteTask, getMeetings, saveMeeting, TASK_TYPES, TASK_STATUS, buildParsePrompt } from '@/lib/tasks'
import { createJob, updateJob } from '@/lib/agent-jobs'
import { draftRecap } from '@/lib/recap'
import { getCompiledPrompt } from '@/components/AgentInstructionsTab'
import { getRefinedPrompt } from '@/components/AIConfigChat'
import { getConfig } from '@/lib/config'
import { Plus, X, Send, Play, CheckCircle, Trash2, ChevronDown, ChevronRight, FileText, Zap, AlertTriangle, Clock, Filter } from 'lucide-react'

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

  useEffect(() => { setTasks(getTasks()) }, [])

  const filtered = useMemo(() => {
    if (statusFilter === 'active') return tasks.filter(t => t.status !== 'done')
    if (statusFilter === 'done') return tasks.filter(t => t.status === 'done')
    return tasks
  }, [tasks, statusFilter])

  const stats = useMemo(() => ({
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending' || t.status === 'ready').length,
    running: tasks.filter(t => t.status === 'running' || t.status === 'needs_review').length,
    done: tasks.filter(t => t.status === 'done').length,
  }), [tasks])

  // Parse meeting notes via AI
  async function handleParse() {
    if (!notes.trim()) { setError('Enter meeting notes'); return }
    const config = getConfig()
    if (!config.ai?.api_key) { setError('Add your Claude API key in Settings → AI & Outreach'); return }

    setParsing(true)
    setError(null)
    try {
      const prompt = buildParsePrompt(notes, contactName, propertyAddress)
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
      const items = JSON.parse(cleaned)
      setParsedItems(items)
    } catch (e) {
      setError('Parse failed: ' + e.message)
    } finally {
      setParsing(false)
    }
  }

  // Accept parsed items as tasks, then auto-queue downstream agent jobs
  // (StoneProfits quote + Outlook recap). The recap drafting runs in the
  // background against the Claude API and writes back to the job when done.
  async function handleAcceptAll() {
    if (!parsedItems) return
    let updated = tasks
    const meeting = saveMeeting({ contact: contactName, property: propertyAddress, notes, task_count: parsedItems.length })
    parsedItems.forEach(item => {
      updated = addTask({
        type: item.type || 'CUSTOM',
        description: item.description,
        contact: item.contact || contactName,
        property: item.property || propertyAddress,
        materials: item.materials || null,
        deadline: item.deadline || null,
        priority: item.priority || 'medium',
        crm_data: item.crm_data || null,
        meeting_id: meeting.id,
        status: 'ready',
      })
    })
    setTasks(updated)

    // Queue browser-agent jobs so the Pipeline card has something to act on.
    // Only queue sp_quote if the meeting actually produced a QUOTE task —
    // otherwise there's nothing to create in StoneProfits.
    const hasQuoteTask = parsedItems.some(i => i.type === 'QUOTE')
    const materials = parsedItems.map(i => i.materials).filter(Boolean).join(', ')

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
            <p className="text-xs text-gray-500">Meeting notes in → action items out → executed in your systems</p>
          </div>
          <button onClick={() => setShowInput(!showInput)} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${showInput ? 'bg-gray-200 text-gray-700' : 'bg-amber-500 text-white hover:bg-amber-600'}`}>
            {showInput ? <><X size={14} /> Close</> : <><Plus size={14} /> Meeting Notes</>}
          </button>
        </header>

        <div className="p-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
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

              {/* Parsed preview */}
              {parsedItems && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-semibold text-amber-800 flex items-center gap-1.5"><Zap size={12} /> {parsedItems.length} action items extracted</div>
                    <div className="flex gap-2">
                      <button onClick={() => setParsedItems(null)} className="text-xs text-gray-500 hover:text-gray-700">Discard</button>
                      <button onClick={handleAcceptAll} className="px-3 py-1 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600">Accept All → Create Tasks</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {parsedItems.map((item, i) => {
                      const tt = TASK_TYPES[item.type] || TASK_TYPES.CUSTOM
                      return (
                        <div key={i} className="bg-white rounded-lg p-3 flex items-start gap-3">
                          <span className="text-lg">{tt.icon}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tt.bg} ${tt.color}`}>{tt.label}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${item.priority === 'high' ? 'bg-red-50 text-red-600' : item.priority === 'low' ? 'bg-gray-50 text-gray-500' : 'bg-yellow-50 text-yellow-600'}`}>{item.priority}</span>
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

          {/* Filter */}
          <div className="flex items-center gap-2 mb-4">
            <Filter size={14} className="text-gray-400" />
            {['active', 'done', 'all'].map(f => (
              <button key={f} onClick={() => setStatusFilter(f)} className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${statusFilter === f ? 'bg-amber-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {f.charAt(0).toUpperCase() + f.slice(1)} {f === 'active' ? `(${stats.pending + stats.running})` : f === 'done' ? `(${stats.done})` : `(${stats.total})`}
              </button>
            ))}
          </div>

          {/* Task list */}
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
                      </div>
                      <p className="text-sm text-gray-800 truncate">{task.description || 'No description'}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-gray-400">{formatDate(task.created_at)}</span>
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
                  )}
                </div>
              )
            })}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12">
              <Zap size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-500 mb-1">{statusFilter === 'done' ? 'No completed tasks yet' : 'No active tasks'}</p>
              <p className="text-xs text-gray-400">Click "+ Meeting Notes" to paste notes and auto-generate action items</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
