'use client'
import { useState } from 'react'
import { Play, Copy, Check, CheckCircle, X, Loader2, AlertTriangle } from 'lucide-react'
import { dispatchFor, runWired, buildPromptForTask, markResolved } from '@/lib/dispatcher'

// Inline dispatcher row for a task. Two modes:
//   wired       → Run button (calls handler, displays result)
//   copy_prompt → Copy Prompt button + Mark Resolved affordance
//
// The wired path also writes a `task_events` resolved row; the copy_prompt
// path writes the resolved row only when the user clicks Mark Resolved
// and types in an outcome. That free-text outcome is what feeds the
// meeting-notes parser's few-shot examples on the next run — the seed
// of the learning loop.

const OUTCOMES = [
  { id: 'completed', label: 'Completed' },
  { id: 'no_action', label: 'No action needed' },
  { id: 'deferred',  label: 'Deferred' },
  { id: 'failed',    label: 'Failed / blocked' },
]

export default function TaskDispatcher({ task, context = {}, onResolved }) {
  const entry = dispatchFor(task.type)
  const [wiredResult, setWiredResult] = useState(null)
  const [wiredError, setWiredError] = useState(null)
  const [running, setRunning] = useState(false)
  const [copied, setCopied] = useState(false)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [outcome, setOutcome] = useState('completed')
  const [resolveNotes, setResolveNotes] = useState('')
  const [savingResolve, setSavingResolve] = useState(false)

  async function handleRunWired() {
    setRunning(true)
    setWiredError(null)
    try {
      const result = await runWired(task, context)
      setWiredResult(result)
      if (result.ok && onResolved) onResolved(task)
    } catch (e) {
      setWiredError(e.message)
    } finally {
      setRunning(false)
    }
  }

  async function handleCopyPrompt() {
    try {
      const prompt = await buildPromptForTask(task, context)
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      setWiredError(e.message)
    }
  }

  async function handleSaveResolve() {
    setSavingResolve(true)
    try {
      await markResolved(task, { outcome, notes: resolveNotes || null })
      setResolveOpen(false)
      setResolveNotes('')
      setOutcome('completed')
      if (onResolved) onResolved(task)
    } catch (e) {
      setWiredError(e.message)
    } finally {
      setSavingResolve(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] text-gray-600">
          <span className="font-semibold uppercase tracking-wider mr-2 text-gray-700">
            {entry.mode === 'wired' ? 'Wired' : 'Copy Prompt'}
          </span>
          {entry.notes}
        </div>
        <div className="flex items-center gap-2">
          {entry.mode === 'wired' ? (
            <button
              onClick={handleRunWired}
              disabled={running}
              className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-500 flex items-center gap-1.5"
            >
              {running ? <><Loader2 size={11} className="animate-spin" /> Running…</> : <><Play size={11} /> Run</>}
            </button>
          ) : (
            <>
              <button
                onClick={handleCopyPrompt}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 flex items-center gap-1.5"
              >
                {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy Prompt</>}
              </button>
              <button
                onClick={() => setResolveOpen(true)}
                className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded text-xs font-medium hover:bg-gray-50 flex items-center gap-1.5"
              >
                <CheckCircle size={11} /> Mark resolved
              </button>
            </>
          )}
        </div>
      </div>

      {wiredResult && (
        <div className={`mt-2 text-[11px] rounded p-2 border ${wiredResult.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          <div className="font-semibold flex items-center gap-1">
            {wiredResult.ok ? <Check size={11} /> : <AlertTriangle size={11} />}
            {wiredResult.summary || (wiredResult.ok ? 'Done.' : 'Run completed without changes.')}
          </div>
          {wiredResult.written && (
            <div className="text-[10px] mt-0.5">
              Wrote: {Object.entries(wiredResult.written).filter(([_, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(', ') || 'nothing'}
            </div>
          )}
        </div>
      )}

      {wiredError && (
        <div className="mt-2 text-[11px] bg-red-50 border border-red-200 rounded p-2 text-red-800 flex items-start gap-1.5">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          <span>{wiredError}</span>
          <button onClick={() => setWiredError(null)} className="ml-auto text-red-400 hover:text-red-700">
            <X size={11} />
          </button>
        </div>
      )}

      {resolveOpen && (
        <div className="mt-3 bg-gray-50 border border-gray-200 rounded p-3">
          <div className="text-[11px] font-semibold text-gray-700 mb-2">What did you do?</div>
          <div className="flex flex-wrap gap-1 mb-2">
            {OUTCOMES.map(o => (
              <button
                key={o.id}
                onClick={() => setOutcome(o.id)}
                className={`text-[10px] px-2 py-0.5 rounded ${outcome === o.id ? 'bg-amber-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <textarea
            value={resolveNotes}
            onChange={e => setResolveNotes(e.target.value)}
            rows={2}
            placeholder="Free-text: how did it actually go? (1-2 sentences — feeds the next parse)"
            className="w-full text-[11px] bg-white border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-amber-400"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleSaveResolve}
              disabled={savingResolve}
              className="px-3 py-1 bg-amber-500 text-white rounded text-[11px] font-semibold hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-500"
            >
              {savingResolve ? 'Saving…' : 'Save resolution'}
            </button>
            <button
              onClick={() => setResolveOpen(false)}
              className="text-[11px] text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
