'use client'
// PraskForce1 — Outlook Import Panel
//
// Two paths in one panel:
//   PASTE  — drop in an email body / thread, parse with Claude, get tasks
//   AGENT  — queue a browser agent to scan the inbox in the background
//
// The paste path works immediately and is the right fix for "I have an
// email open right now and need it on my board." The agent path is the
// hands-off background scan and shows up as a queued job on the agents
// page once triggered.

import { useState } from 'react'
import { parseEmailToTasks, queueOutlookScan } from '@/lib/outlook-import'
import { TASK_TYPES } from '@/lib/tasks'
import { Mail, Zap, X, Clock, Bot, Inbox } from 'lucide-react'

export default function OutlookImportPanel({ onClose, onTasksCreated }) {
  const [tab, setTab] = useState('paste')
  const [emailBody, setEmailBody] = useState('')
  const [sender, setSender] = useState('')
  const [subject, setSubject] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parsedItems, setParsedItems] = useState(null)
  const [error, setError] = useState(null)
  const [agentQueued, setAgentQueued] = useState(false)
  const [sinceDays, setSinceDays] = useState(3)

  async function handleParse() {
    if (!emailBody.trim()) { setError('Paste an email body first'); return }
    setError(null)
    setParsing(true)
    try {
      // parseEmailToTasks already persists the tasks to localStorage.
      // The caller will reload them via onTasksCreated.
      const items = await parseEmailToTasks({
        emailBody,
        sender: sender.trim() || null,
        subject: subject.trim() || null,
      })
      setParsedItems(items)
      if (items.length > 0) onTasksCreated && onTasksCreated(items.length)
    } catch (e) {
      setError(e.message)
    } finally {
      setParsing(false)
    }
  }

  async function handleQueueAgent() {
    setError(null)
    try {
      await queueOutlookScan({ sinceDays })
      setAgentQueued(true)
    } catch (e) {
      setError('Could not queue agent: ' + e.message)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Mail size={16} /> Import from Outlook
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        <button
          onClick={() => setTab('paste')}
          className={`px-3 py-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
            tab === 'paste'
              ? 'border-blue-500 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Inbox size={12} /> Paste Email
        </button>
        <button
          onClick={() => setTab('agent')}
          className={`px-3 py-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
            tab === 'agent'
              ? 'border-blue-500 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Bot size={12} /> Background Scan
        </button>
      </div>

      {tab === 'paste' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[10px] font-medium text-gray-500">From (sender)</span>
              <input
                value={sender}
                onChange={e => setSender(e.target.value)}
                placeholder="e.g. Jared Galbut <jared@galbutdev.com>"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <span className="text-[10px] font-medium text-gray-500">Subject</span>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Email subject (optional)"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
            </div>
          </div>

          <div>
            <span className="text-[10px] font-medium text-gray-500">Email body / thread</span>
            <textarea
              value={emailBody}
              onChange={e => setEmailBody(e.target.value)}
              rows={8}
              placeholder="Paste the full email body (or the entire thread). Claude will extract action items, identify the contact, and create tasks tagged with source=outlook_email."
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 leading-relaxed font-mono"
            />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
              {error}
            </div>
          )}

          {parsedItems && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-blue-800 mb-2 flex items-center gap-1.5">
                <Zap size={12} />
                {parsedItems.length === 0
                  ? 'No actionable items in this email'
                  : `${parsedItems.length} task${parsedItems.length === 1 ? '' : 's'} created and added to the board`}
              </div>
              {parsedItems.length > 0 && (
                <div className="space-y-1.5">
                  {parsedItems.map((item, i) => {
                    const tt = TASK_TYPES[item.type] || TASK_TYPES.CUSTOM
                    return (
                      <div key={i} className="text-[11px] text-gray-700 flex items-start gap-2">
                        <span>{tt.icon}</span>
                        <div className="flex-1">
                          <span className={`text-[10px] font-semibold mr-1 ${tt.color}`}>{tt.label}</span>
                          {item.description}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleParse}
              disabled={parsing}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                parsing ? 'bg-gray-200 text-gray-500' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {parsing
                ? <><Clock size={14} className="animate-spin" /> Parsing…</>
                : <><Zap size={14} /> Extract Tasks from Email</>}
            </button>
            <span className="text-[10px] text-gray-400">
              Pasted email → AI parses → tasks land on the board with source = Outlook
            </span>
          </div>
        </div>
      )}

      {tab === 'agent' && (
        <div className="space-y-3">
          <div className="text-xs text-gray-600 leading-relaxed">
            Queue a browser-agent job to scan your Outlook inbox in the background.
            The Claude-in-Chrome worker logs in, pulls recent threads, and writes them
            back as parseable email bodies. Each one gets run through the same parser
            as the paste flow above. Status shows on the Agents page.
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-gray-600">Look back</span>
            <select
              value={sinceDays}
              onChange={e => setSinceDays(Number(e.target.value))}
              className="border border-gray-200 rounded px-2 py-1 text-xs"
            >
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>1 week</option>
              <option value={14}>2 weeks</option>
              <option value={30}>1 month</option>
            </select>
          </div>

          {agentQueued && (
            <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-2">
              ✓ Outlook scan queued. Check the Agents page for status.
            </div>
          )}

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
              {error}
            </div>
          )}

          <button
            onClick={handleQueueAgent}
            disabled={agentQueued}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
              agentQueued ? 'bg-gray-200 text-gray-500' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <Bot size={14} /> {agentQueued ? 'Queued' : 'Queue Inbox Scan'}
          </button>
        </div>
      )}
    </div>
  )
}
