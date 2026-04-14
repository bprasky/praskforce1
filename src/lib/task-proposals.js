// PraskForce1 — Task Proposal Generator
//
// Calls Claude with the task context + matched historical resolutions and
// asks for a concrete proposed action. The matcher in task-learning.js
// decides WHICH resolutions are relevant; this module decides WHAT to
// recommend based on them. They are kept separate so the matcher can be
// tested in isolation without paying for an API call.
//
// Confidence honesty is non-negotiable. When the model says "not enough
// data," we pass that through — we never round up a low-confidence
// proposal to look smarter than it is.

import { getConfig } from '@/lib/config'
import {
  buildContextSnapshot,
  findSimilarResolutions,
  computeConfidence,
  createProposal,
  listPatterns,
} from '@/lib/task-learning'
import { buildProposalPrompt } from '@/lib/agent-prompts'

// Threshold below which we don't even ask the model — just tell the user
// "I don't have enough data, what's the move?"
const MIN_MATCH_SCORE = 0.6
const MIN_SAMPLE_SIZE = 3

export async function generateProposal({ task, contextExtras = {} }) {
  const snapshot = buildContextSnapshot(task, contextExtras)
  const matches = await findSimilarResolutions(task.type, snapshot, 5)

  // Cold-start path: not enough history yet. Return null so the UI can
  // show "no proposal — what's the move?" instead of guessing.
  if (matches.length === 0 || matches[0].score < MIN_MATCH_SCORE) {
    return {
      proposal: null,
      snapshot,
      matches,
      reason: 'not_enough_similar_history',
    }
  }

  const lowSample = matches.length < MIN_SAMPLE_SIZE
  const config = getConfig()

  // No API key → fall back to a deterministic proposal pulled straight
  // from the top match. This keeps the UI usable in dev / demo mode and
  // means the system still proposes something based on history.
  if (!config.ai?.api_key) {
    const top = matches[0].resolution
    return {
      proposal: await createProposal({
        task_id: task.id,
        proposed_action: top.resolution_action,
        proposed_channel: top.resolution_channel,
        confidence: computeConfidence(matches) * (lowSample ? 0.7 : 1),
        reasoning: `Based on ${matches.length} similar ${task.type} task${matches.length === 1 ? '' : 's'}. ` +
                   `Last time: ${top.resolution_action || 'no action recorded'}` +
                   (lowSample ? ' (limited data — only a handful of comparable cases)' : ''),
        matched_resolution_ids: matches.map(m => m.resolution.id),
        match_criteria: { source: 'top_match_passthrough', sample_size: matches.length },
      }),
      snapshot,
      matches,
    }
  }

  // Real path: ask Claude to synthesize a concrete recommendation from
  // the historical matches and any aggregated patterns.
  const patterns = (await listPatterns()).filter(p => p.task_category === task.type)
  const prompt = buildProposalPrompt({ task, snapshot, matches, patterns })

  let parsed
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.ai.api_key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: config.ai.model || 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)
    const text = data.content?.[0]?.text || ''
    const cleaned = text.replace(/```json|```/g, '').trim()
    parsed = JSON.parse(cleaned)
  } catch (e) {
    console.warn('Proposal generation via Claude failed, falling back to top match', e)
    const top = matches[0].resolution
    parsed = {
      proposed_action: top.resolution_action,
      proposed_channel: top.resolution_channel,
      confidence: computeConfidence(matches) * 0.7, // penalize for using fallback
      reasoning: `Fallback: Claude call failed (${e.message}). Showing top historical match.`,
      matched_pattern_summary: null,
    }
  }

  // Cap whatever the model says by the matcher's confidence — the model
  // should never be allowed to claim more confidence than the data
  // actually supports.
  const matcherConfidence = computeConfidence(matches)
  const finalConfidence = Math.min(parsed.confidence ?? 0, matcherConfidence)

  const proposal = await createProposal({
    task_id: task.id,
    proposed_action: parsed.proposed_action,
    proposed_channel: parsed.proposed_channel,
    confidence: finalConfidence,
    reasoning: parsed.reasoning + (lowSample ? ' (limited historical data)' : ''),
    matched_resolution_ids: matches.map(m => m.resolution.id),
    match_criteria: {
      sample_size: matches.length,
      top_score: matches[0].score,
      pattern_summary: parsed.matched_pattern_summary,
    },
  })

  return { proposal, snapshot, matches }
}
