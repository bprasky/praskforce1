// PraskForce1 — Outlook → Tasks Importer
//
// Two paths for getting tasks out of Outlook:
//
//   1. PASTE — Brad pastes an email body or thread directly into the UI.
//      Fast, works today, no API access required. Claude parses the
//      thread into structured tasks the same way it parses meeting notes.
//
//   2. AGENT — A browser agent job (kind: 'outlook_search') is queued
//      against the existing agent_jobs table. The Claude-in-Chrome worker
//      logs into Outlook, scans the inbox, and writes back the relevant
//      threads as job results. A separate poll picks those up and runs
//      them through parseEmailToTasks().
//
// Both paths converge on parseEmailToTasks() so the downstream task
// shape is identical regardless of source — important for the matrix
// view, the matcher, and the learning loop.

import { getConfig } from '@/lib/config'
import { addTask } from '@/lib/tasks'
import { createJob } from '@/lib/agent-jobs'

// Build the prompt sent to Claude when parsing an email body. Mirrors
// buildParsePrompt but with email-specific framing — sender intent,
// thread context, attachments, etc.
export function buildEmailParsePrompt({ emailBody, sender, subject, knownContact }) {
  return `You are a sales operations assistant for a natural stone importer. Parse this email (or email thread) into structured action items for Brad to act on.

EMAIL CONTEXT:
${sender ? `From: ${sender}` : ''}
${subject ? `Subject: ${subject}` : ''}
${knownContact ? `Known contact match: ${knownContact}` : ''}

EMAIL BODY:
${emailBody}

Extract every actionable item Brad should do in response to this email. For each, return a JSON object with:
- "type": one of QUOTE, QUOTE_ADJUSTMENT, FOLLOW_UP, BOOK_MEETING, INTRO, EMAIL, SAMPLE_SEND, PRICING, RESEARCH, ADMIN, SCHEDULE, CAPTURE, CRM_UPDATE, CUSTOM
- "description": clear description of what Brad needs to do (e.g. "Send revised quote with updated travertine pricing")
- "contact": the email sender (use the name if visible, fall back to email)
- "property": property address mentioned in the email, or null
- "materials": any materials mentioned, comma-separated
- "deadline": any explicit deadline (e.g. "Friday", "by EOW"), or null
- "priority": "high" if the sender asks for urgency or sets a near deadline, "medium" otherwise
- "value": numeric estimate of dollar value if the email references a quote/sale (no commas), or null
- "quote_ref": StoneProfits quote number if mentioned, or null
- "crm_data": any CRM-worthy data (project info, decision-maker hints, budget signals)

IMPORTANT:
- If the email is just a thank-you or FYI with no action required, return an empty array [].
- If the email is a reply to a quote, the most likely task type is QUOTE_ADJUSTMENT or FOLLOW_UP, NOT QUOTE.
- If someone asks to schedule a meeting, use BOOK_MEETING.
- Always prefer the most specific category over CUSTOM.

Respond with ONLY a JSON array of action items. No other text.`
}

// Run an email through Claude and turn the result into real task records.
// Returns the array of created task records (or an empty array if the
// email was non-actionable).
export async function parseEmailToTasks({ emailBody, sender, subject, knownContact }) {
  const config = getConfig()
  if (!config.ai?.api_key) throw new Error('Add your Claude API key in Settings → AI & Outreach')
  if (!emailBody?.trim()) return []

  const prompt = buildEmailParsePrompt({ emailBody, sender, subject, knownContact })
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
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)

  const text = data.content?.[0]?.text || ''
  const cleaned = text.replace(/```json|```/g, '').trim()
  let items
  try {
    items = JSON.parse(cleaned)
  } catch (e) {
    throw new Error('Could not parse email — Claude returned: ' + text.slice(0, 200))
  }
  if (!Array.isArray(items)) return []

  // Persist as real tasks. Each task is tagged with source=outlook_email
  // so the matrix view can filter and the learning system can correlate
  // outcomes back to the inbox-derived workflow.
  const created = []
  for (const item of items) {
    addTask({
      type: item.type || 'CUSTOM',
      description: item.description || '',
      contact: item.contact || sender || knownContact || null,
      property: item.property || null,
      materials: item.materials || null,
      deadline: item.deadline || null,
      priority: item.priority || 'medium',
      value: item.value ?? null,
      quote_ref: item.quote_ref || null,
      crm_data: item.crm_data || null,
      source: 'outlook_email',
      status: 'ready',
      lifecycle: 'CREATED',
    })
    created.push(item)
  }
  return created
}

// Queue a browser-agent job to scan Outlook for new threads from a list
// of contacts (or all unread). The agent worker handles the actual
// browsing — this function just enqueues the work so the Tasks page can
// fire and forget. Results are picked up later by pollOutlookScanResults.
export async function queueOutlookScan({ contacts = [], folder = 'Inbox', sinceDays = 3 } = {}) {
  return await createJob({
    kind: 'outlook_search',
    priority: 4,
    payload: {
      folder,
      since_days: sinceDays,
      contacts,                               // optional filter — empty = all
      goal: 'extract_actionable_threads',     // signals the worker to return parseable email bodies
    },
  })
}
