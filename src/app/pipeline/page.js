'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { getMeetings, getTasks, updateTask, TASK_TYPES, TASK_STATUS } from '@/lib/tasks'
import { Briefcase, FileText, Send, ExternalLink, Plus, CheckCircle, Play, Clock, User, MapPin, Zap } from 'lucide-react'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function PipelinePage() {
  const [meetings, setMeetings] = useState([])
  const [tasks, setTasks] = useState([])

  useEffect(() => {
    setMeetings(getMeetings())
    setTasks(getTasks())
  }, [])

  // Join meetings with their extracted tasks
  const deals = useMemo(() => {
    return meetings.map(m => {
      const meetingTasks = tasks.filter(t => t.meeting_id === m.id)
      const open = meetingTasks.filter(t => t.status !== 'done').length
      const done = meetingTasks.filter(t => t.status === 'done').length
      return { ...m, tasks: meetingTasks, open, done }
    })
  }, [meetings, tasks])

  const stats = useMemo(() => ({
    deals: deals.length,
    active: deals.filter(d => d.open > 0).length,
    openTasks: deals.reduce((s, d) => s + d.open, 0),
    quotes: tasks.filter(t => t.type === 'QUOTE' && t.status !== 'done').length,
  }), [deals, tasks])

  function refresh() {
    setTasks(getTasks())
  }

  function handleStartQuote(deal) {
    // Placeholder — this will eventually launch the QUOTE-001 playbook against StoneProfits.
    // For now, route to the agent prompt builder where the user can generate the instructions.
    alert(
      `Start StoneProfits Quote\n\n` +
      `Contact: ${deal.contact || '—'}\n` +
      `Property: ${deal.property || '—'}\n\n` +
      `StoneProfits quote automation is not wired up yet. The QUOTE-001 playbook will launch here once the integration is in place.`
    )
  }

  function handleSendRecap(deal) {
    alert(
      `Send Recap Email\n\n` +
      `Contact: ${deal.contact || '—'}\n` +
      `Property: ${deal.property || '—'}\n\n` +
      `Recap drafting via Claude + Outlook send is not wired up yet. This button will draft a recap from the meeting notes once the Outlook integration is in place.`
    )
  }

  function handleTaskStatus(taskId, status) {
    updateTask(taskId, { status })
    refresh()
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
          <Link
            href="/tasks"
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 bg-amber-500 text-white hover:bg-amber-600"
          >
            <Plus size={14} /> New Meeting Notes
          </Link>
        </header>

        <div className="p-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { l: 'Deals', v: stats.deals, c: 'text-gray-900' },
              { l: 'Active', v: stats.active, c: 'text-amber-600' },
              { l: 'Open Tasks', v: stats.openTasks, c: 'text-blue-600' },
              { l: 'Quotes Pending', v: stats.quotes, c: 'text-purple-600' },
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
              <p className="text-xs text-gray-400 mb-4">Enter meeting notes on the Tasks page — each meeting becomes a deal card here with quote and follow-up actions.</p>
              <Link
                href="/tasks"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600"
              >
                <Plus size={14} /> Add Meeting Notes
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {deals.map(deal => (
                <div key={deal.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  {/* Deal header */}
                  <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Briefcase size={14} className="text-amber-500" />
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          {deal.contact || 'Untitled meeting'}
                        </h3>
                        <span className="text-[10px] text-gray-400">{formatDate(deal.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
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

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleStartQuote(deal)}
                        className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 flex items-center gap-1.5"
                        title="Launch QUOTE-001 playbook in StoneProfits"
                      >
                        <FileText size={12} /> Start Quote
                      </button>
                      <button
                        onClick={() => handleSendRecap(deal)}
                        className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600 flex items-center gap-1.5"
                        title="Draft recap email via Claude → send via Outlook"
                      >
                        <Send size={12} /> Send Recap
                      </button>
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
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
