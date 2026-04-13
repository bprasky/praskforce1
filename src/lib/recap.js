// PraskForce1 — Recap Drafting
//
// Uses the Claude API to evaluate a meeting's "level of completion" (where
// the deal sits in the sales cycle) and draft a tone-matched follow-up
// email. Not the same every time — the prompt asks Claude to read the room
// from the notes and match its tone to the situation.
//
// Returns structured JSON so downstream browser agents can paste the
// subject and body directly into Outlook without re-interpreting prose.
//
// IMPORTANT: this runs client-side against api.anthropic.com using the
// user's API key from Configuration → AI & Outreach. No server-side
// proxy exists yet. If the user hasn't configured a key, we return a
// structured "unconfigured" result so the UI can prompt them.

import { getConfig } from '@/lib/config'

export const DEAL_STAGES = {
  initial_contact: { label: 'Initial Contact', desc: 'First touch — discovery mode' },
  needs_assessment: { label: 'Needs Assessment', desc: 'Understanding project, materials, budget' },
  proposal: { label: 'Proposal', desc: 'Quote sent, awaiting feedback' },
  negotiation: { label: 'Negotiation', desc: 'Active back-and-forth on terms or selection' },
  closing: { label: 'Closing', desc: 'Final decision in sight' },
  post_sale: { label: 'Post-Sale', desc: 'Delivered — nurturing for next project' },
  stalled: { label: 'Stalled', desc: 'No recent movement — needs re-engagement' },
}

function buildRecapPrompt({ notes, contact, property, senderName }) {
  return `You are a sales operations assistant for a natural stone importer (ARCA Worldwide). Your job is to read meeting notes from a client conversation and draft a perfectly-toned follow-up email.

SENDER: ${senderName || 'the ARCA representative'}
CONTACT: ${contact || 'unspecified'}
PROPERTY / PROJECT: ${property || 'unspecified'}

MEETING NOTES:
${notes}

Your task:
1. Evaluate where this deal sits in the sales cycle. Pick ONE stage:
   - initial_contact: first touch, discovery mode
   - needs_assessment: understanding project, materials, budget
   - proposal: quote sent, awaiting feedback
   - negotiation: active back-and-forth on terms or selection
   - closing: final decision in sight
   - post_sale: delivered — nurturing for next project
   - stalled: no recent movement — needs re-engagement

2. Give a rough completion percent (0-100) — how close this deal feels to closed based on the notes.

3. Decide the appropriate TONE. Read the room from the notes. Examples of tones that might fit:
   - "Warm and educational" — early stage, relationship-building
   - "Concise and professional" — busy decision-maker
   - "Enthusiastic but not pushy" — product interest established
   - "Reassuring and patient" — concerns or hesitations raised
   - "Direct and action-oriented" — ready to close, needs a nudge
   - "Celebratory and forward-looking" — deal won, looking ahead
   Use your judgment. Don't reuse the same tone across every recap.

4. Draft a follow-up email matched to that tone:
   - Subject line: specific, not generic ("Re: Pine Tree marble options" not "Following up")
   - Body: plain text, 3-6 short paragraphs, natural voice, no corporate filler
   - Reference specific things from the notes (materials discussed, concerns raised, next steps agreed)
   - End with a clear single ask or next step
   - Sign off as "${senderName || 'ARCA Worldwide'}"

5. List 1-4 concrete next actions the sender should take offline (e.g. "Pull 3ft samples of Calacatta Borghini", "Check inventory on Taj Mahal quartzite slabs 2cm").

6. Briefly explain your reasoning for the stage + tone decision so the sender can sanity-check your read.

Respond with ONLY a JSON object (no markdown, no prose before or after) with this exact shape:
{
  "stage": "needs_assessment",
  "completion_percent": 35,
  "tone": "Warm and educational",
  "subject": "...",
  "body": "...",
  "next_actions": ["...", "..."],
  "reasoning": "..."
}`
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Draft a recap email from meeting notes. Returns a structured object or
 * throws with a clear error message. Safe to call from the browser.
 */
export async function draftRecap({ notes, contact, property }) {
  if (!notes || !notes.trim()) {
    throw new Error('Meeting notes are required to draft a recap')
  }

  const config = getConfig()
  const apiKey = config.ai?.api_key
  if (!apiKey) {
    const err = new Error('Claude API key not configured. Add one in Configuration → AI & Outreach.')
    err.code = 'NO_API_KEY'
    throw err
  }

  const prompt = buildRecapPrompt({
    notes,
    contact,
    property,
    senderName: config.user?.name || config.notifications?.email?.split('@')[0] || '',
  })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.ai?.model || 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await res.json()
  if (data.error) throw new Error(data.error.message || 'Claude API error')

  const text = data.content?.[0]?.text || ''
  // Be defensive — strip any markdown fencing if Claude ignored the instruction
  const cleaned = text.replace(/```json|```/g, '').trim()

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch (e) {
    throw new Error('Claude returned a response that was not valid JSON: ' + text.slice(0, 200))
  }

  // Validate required fields with friendly errors
  const required = ['stage', 'subject', 'body']
  for (const f of required) {
    if (!parsed[f]) throw new Error(`Drafted recap is missing required field: ${f}`)
  }

  return {
    stage: parsed.stage,
    completion_percent: parsed.completion_percent ?? null,
    tone: parsed.tone || '',
    subject: parsed.subject,
    body: parsed.body,
    next_actions: Array.isArray(parsed.next_actions) ? parsed.next_actions : [],
    reasoning: parsed.reasoning || '',
    drafted_at: new Date().toISOString(),
  }
}
