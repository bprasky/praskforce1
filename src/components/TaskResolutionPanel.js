'use client'
// PraskForce1 — Task Resolution Capture
//
// The collaborative moment. When a task moves to RESOLVING state, this
// panel collects the four pieces of training data that matter:
//   1. WHAT was done (free text + autocomplete)
//   2. WHICH channel (quick-select)
//   3. WHAT the outcome was (quick-select)
//   4. WHY it was the right move (optional but the most valuable field)
//
// The UI is intentionally fast — every field should be reachable in a
// single click and the whole resolution should be loggable in well under
// 30 seconds. Friction here kills the dataset.

import { useState } from 'react'
import { RESOLUTION_CHANNELS, RESOLUTION_OUTCOMES, createResolution, buildContextSnapshot } from '@/lib/task-learning'
import { CheckCircle, X } from 'lucide-react'

export default function TaskResolutionPanel({ task, proposal, onResolved, onCancel }) {
  // Pre-populate from the proposal if one exists — this is the "confirm
  // and tweak" path which should be the fastest interaction in the whole
  // app once the system gets smart.
  const [action, setAction]   = useState(proposal?.proposed_action || '')
  const [channel, setChannel] = useState(proposal?.proposed_channel || '')
  const [outcome, setOutcome] = useState('')
  const [notes, setNotes]     = useState('')
  const [saving, setSaving]   = useState(false)

  const acceptedAsIs =
    proposal &&
    action.trim() === (proposal.proposed_action || '').trim() &&
    channel === (proposal.proposed_channel || '')

  async function handleSave() {
    if (!action.trim() || !outcome) return
    setSaving(true)
    const snapshot = buildContextSnapshot(task)

    let resolution_type = 'explained'
    let correction_delta = null
    if (proposal) {
      if (acceptedAsIs) {
        resolution_type = 'confirmed'
      } else {
        resolution_type = 'corrected'
        correction_delta = `Proposed: ${proposal.proposed_action} via ${proposal.proposed_channel || '?'}. ` +
                           `Actual: ${action} via ${channel || '?'}.`
      }
    }

    await createResolution({
      task_id: task.id,
      resolution_type,
      resolution_action: action.trim(),
      resolution_channel: channel || null,
      resolution_outcome: outcome,
      resolution_notes: notes.trim() || null,
      context_snapshot: snapshot,
      task_category: task.type,
      proposed_action: proposal?.proposed_action || null,
      proposed_accepted: proposal ? acceptedAsIs : null,
      correction_delta,
    })
    setSaving(false)
    onResolved && onResolved()
  }

  return (
    <div className="border border-purple-200 bg-purple-50/50 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-purple-800 uppercase tracking-wider">
          Log Resolution
        </div>
        {onCancel && (
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* What was done */}
      <div>
        <label className="text-[10px] font-medium text-gray-600 uppercase">
          What did you do?
        </label>
        <textarea
          value={action}
          onChange={e => setAction(e.target.value)}
          rows={2}
          placeholder="e.g. Called architect — out until 4/20, pushed follow-up"
          className="mt-1 w-full border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:border-purple-400 bg-white"
        />
      </div>

      {/* Channel */}
      <div>
        <label className="text-[10px] font-medium text-gray-600 uppercase">Channel</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {RESOLUTION_CHANNELS.map(c => (
            <button
              key={c.id}
              onClick={() => setChannel(c.id)}
              className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                channel === c.id
                  ? 'bg-purple-500 text-white border-purple-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
              }`}
            >
              <span className="mr-1">{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Outcome */}
      <div>
        <label className="text-[10px] font-medium text-gray-600 uppercase">Outcome</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {RESOLUTION_OUTCOMES.map(o => {
            const tone =
              o.tone === 'win'  ? 'bg-green-500 text-white border-green-500' :
              o.tone === 'loss' ? 'bg-red-500 text-white border-red-500'     :
                                  'bg-gray-500 text-white border-gray-500'
            return (
              <button
                key={o.id}
                onClick={() => setOutcome(o.id)}
                className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                  outcome === o.id
                    ? tone
                    : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                }`}
              >
                <span className="mr-1">{o.icon}</span>
                {o.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Why — the gold field */}
      <div>
        <label className="text-[10px] font-medium text-gray-600 uppercase">
          Why was this the right move? <span className="text-gray-400 normal-case">(optional, but trains the system)</span>
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="e.g. Architects in Coral Gables respond to email better than calls, especially mid-week"
          className="mt-1 w-full border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:border-purple-400 bg-white"
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-[10px] text-gray-400">
          {proposal
            ? acceptedAsIs
              ? 'Logging as: confirmed proposal'
              : 'Logging as: corrected proposal (high-signal training data)'
            : 'Logging as: explained (no proposal was offered)'}
        </span>
        <button
          onClick={handleSave}
          disabled={saving || !action.trim() || !outcome}
          className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 ${
            saving || !action.trim() || !outcome
              ? 'bg-gray-200 text-gray-400'
              : 'bg-purple-600 text-white hover:bg-purple-700'
          }`}
        >
          <CheckCircle size={12} />
          {saving ? 'Saving…' : 'Save Resolution'}
        </button>
      </div>
    </div>
  )
}
