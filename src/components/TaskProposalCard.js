'use client'
// PraskForce1 — Task Proposal Card
//
// Shown when the system has matched historical resolutions and generated
// a proposed action. Brad's three options:
//   ✓ Accept    — proposal is right, advance to RESOLVING
//   ✎ Correct   — open the resolution panel pre-filled, edit before saving
//   ✗ Reject    — record that the proposal was wrong (with optional why)
//
// The history ribbon shows the matches so Brad can see the receipts —
// "based on 3 similar tasks" is meaningless without being able to peek at
// what those 3 tasks actually were.

import { useState } from 'react'
import { RESOLUTION_CHANNELS } from '@/lib/task-learning'
import { Sparkles, Check, Pencil, X, ChevronDown, ChevronRight } from 'lucide-react'

function ConfidencePill({ value }) {
  const pct = Math.round((value || 0) * 100)
  let label = 'Low'
  let cls = 'bg-gray-100 text-gray-600'
  if (value >= 0.75)      { label = 'High';   cls = 'bg-green-100 text-green-700' }
  else if (value >= 0.55) { label = 'Medium'; cls = 'bg-amber-100 text-amber-700' }
  else if (value >= 0.35) { label = 'Low';    cls = 'bg-orange-100 text-orange-700' }
  else                    { label = 'Tentative'; cls = 'bg-gray-100 text-gray-600' }
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cls}`}>
      {label} · {pct}%
    </span>
  )
}

export default function TaskProposalCard({ proposal, matches = [], onAccept, onCorrect, onReject }) {
  const [showHistory, setShowHistory] = useState(false)
  const channelMeta = RESOLUTION_CHANNELS.find(c => c.id === proposal.proposed_channel)

  return (
    <div className="border border-amber-200 bg-amber-50/60 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-amber-600" />
          <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
            System Proposal
          </span>
        </div>
        <ConfidencePill value={proposal.confidence} />
      </div>

      <div className="text-sm text-gray-800 leading-snug">
        {proposal.proposed_action}
      </div>

      {channelMeta && (
        <div className="flex items-center gap-2 text-[11px] text-gray-600">
          <span>{channelMeta.icon}</span>
          <span>via {channelMeta.label}</span>
        </div>
      )}

      <div className="text-[11px] text-gray-600 italic leading-relaxed">
        {proposal.reasoning}
      </div>

      {matches.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-[11px] text-amber-700 hover:text-amber-900 flex items-center gap-1"
          >
            {showHistory ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Based on {matches.length} similar task{matches.length === 1 ? '' : 's'}
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5">
              {matches.map((m, i) => {
                const r = m.resolution
                return (
                  <div key={r.id || i} className="bg-white border border-amber-100 rounded p-2 text-[11px]">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-gray-500">Match {i + 1} · score {(m.score * 100).toFixed(0)}%</span>
                      <span className="text-[10px] text-gray-400">
                        {r.resolution_outcome || 'unknown outcome'}
                      </span>
                    </div>
                    <div className="text-gray-700">{r.resolution_action}</div>
                    {r.resolution_notes && (
                      <div className="text-gray-500 italic mt-0.5">why: {r.resolution_notes}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onAccept}
          className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700 flex items-center gap-1"
        >
          <Check size={12} /> Accept
        </button>
        <button
          onClick={onCorrect}
          className="px-3 py-1.5 bg-amber-500 text-white rounded text-xs font-semibold hover:bg-amber-600 flex items-center gap-1"
        >
          <Pencil size={12} /> Correct
        </button>
        <button
          onClick={onReject}
          className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded text-xs font-semibold hover:bg-gray-50 flex items-center gap-1"
        >
          <X size={12} /> Reject
        </button>
      </div>
    </div>
  )
}
