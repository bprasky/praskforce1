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

// Default recap prompt — informative and factual, NOT bubbly.
// Users can override this by setting config.ai.recap_prompt_template in
// Settings → AI & Outreach. Placeholders: {{notes}}, {{contact}},
// {{property}}, {{senderName}}. The JSON output contract is appended
// automatically regardless of the template so downstream parsing works.
export const DEFAULT_RECAP_PROMPT = `You are a sales operations assistant for a natural stone importer (ARCA Worldwide). Draft a follow-up email after a client meeting.

SENDER: {{senderName}}
CONTACT: {{contact}}
PROPERTY / PROJECT: {{property}}

MEETING NOTES:
{{notes}}

STYLE REQUIREMENTS — READ CAREFULLY:
- Informative and factual. NOT bubbly, NOT complimentary, NOT effusive.
- No "It was great to connect" / "Thanks for the wonderful meeting" / "Loved hearing about your project".
- No pleasantries, no flattery, no exclamation points unless the client used one first.
- Treat the reader as a busy professional who wants the information and the next step, nothing else.
- Short sentences. Concrete nouns. Specific numbers, materials, and dates from the notes.
- Match the formality of how the client communicates — if the notes suggest casual texting, be casual. If they suggest board-room formal, be formal. Default to clipped and professional.

YOUR TASK:
1. Classify the deal stage. Pick exactly one: initial_contact | needs_assessment | proposal | negotiation | closing | post_sale | stalled
2. Give a rough completion percent (0-100).
3. Pick a tone descriptor that reflects the above style requirements (e.g. "Clipped and factual", "Direct and technical", "Formal but brief"). Do NOT pick warm/enthusiastic/celebratory tones unless the notes clearly warrant them.
4. Draft a follow-up email:
   - Subject: specific to the project, no "Following up" / "Touching base"
   - Body: 2-5 short paragraphs, plain text. Lead with the most useful fact (what you committed to send, what you learned about their specs, what decision is pending). Reference concrete details from the notes. End with a single clear ask or next step.
   - Sign off "{{senderName}}"
5. List 1-4 concrete offline next actions for the sender.
6. Briefly explain your stage and tone choice.

OUTPUT FORMAT (strict — no markdown, no prose, just the JSON object):
{
  "stage": "needs_assessment",
  "completion_percent": 35,
  "tone": "Clipped and factual",
  "subject": "...",
  "body": "...",
  "next_actions": ["...", "..."],
  "reasoning": "..."
}`

function applyTemplate(template, vars) {
  return template
    .replace(/\{\{notes\}\}/g, vars.notes || '')
    .replace(/\{\{contact\}\}/g, vars.contact || 'unspecified')
    .replace(/\{\{property\}\}/g, vars.property || 'unspecified')
    .replace(/\{\{senderName\}\}/g, vars.senderName || 'ARCA Worldwide')
}

function buildRecapPrompt({ notes, contact, property, senderName, templateOverride }) {
  const template = (templateOverride && templateOverride.trim()) || DEFAULT_RECAP_PROMPT
  return applyTemplate(template, { notes, contact, property, senderName })
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
    templateOverride: config.ai?.recap_prompt_template || '',
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
