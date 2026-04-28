// PraskForce1 — Meeting notes parser (server-side)
//
// POST /api/tasks/parse-notes
// Body: { notes: string, meeting_context?: { attendees, date, account_id } }
//
// Pipeline:
//   1. Load compiled task playbooks from the Agent Instructions store.
//      Falls back to the static category guide if none are compiled.
//   2. Load active accounts and pipeline deals for disambiguation.
//   3. Load the last N resolved task_events per category as few-shot
//      examples — the seed of the learning loop.
//   4. Call Claude with a strict-JSON system prompt.
//   5. Parse the response. For each task: write to `tasks` and
//      record a `task_events` row with event_type='created'.
//
// Returns: { tasks: [...created task rows], run_id, model, examples_used }
//
// Why server-side:
//   The existing Tasks page calls Claude directly from the browser.
//   That worked for one-off use, but it leaks the API key into the UI
//   layer and prevents us from injecting server-only context (Supabase
//   account list, resolution history). Now the UI POSTs raw notes here
//   and the server enriches.

import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { getSupabase } from '@/lib/supabase'
import { recordTaskEvent, recentResolutionsByCategory } from '@/lib/resolution'

export const runtime = 'nodejs'

// 8 task categories from the spec. Kept inline (not imported from
// src/lib/tasks.js) because tasks.js touches `window.localStorage` at
// module load and would break server-side import.
const CATEGORIES = [
  'QUOTE',
  'FOLLOW_UP',
  'EMAIL',
  'RESEARCH',
  'ADMIN',
  'SCHEDULE',
  'CAPTURE',
  'CRM_UPDATE',
]

const CATEGORY_GUIDE = `
- QUOTE: Build or modify a quote in StoneProfits. Set materials/quote_ref when known.
- FOLLOW_UP: Follow-up on a previous quote, sample, or conversation. Has a time component.
- EMAIL: Send a specific email — thank-you, info request, recap, intro.
- RESEARCH: Look up info on materials, contacts, properties, owners, permits.
- ADMIN: Internal admin — place a hold on slabs, block inventory, update notes.
- SCHEDULE: Schedule a delivery, fab slot, install, or non-meeting calendar event.
- CAPTURE: Capture structured CRM data from the meeting (contact info, project status, etc).
- CRM_UPDATE: Update fields in StoneProfits — pricing, status, terms.`

function sha1(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16)
}

async function loadAccountsContext() {
  const sb = getSupabase()
  if (!sb) return { accounts: [], properties: [] }
  try {
    const [{ data: firms }, { data: properties }] = await Promise.all([
      sb.from('firms').select('id, name, type').order('name').limit(200),
      sb.from('properties').select('id, address, municipality').order('updated_at', { ascending: false }).limit(200),
    ])
    return { accounts: firms || [], properties: properties || [] }
  } catch (e) {
    console.warn('loadAccountsContext failed', e.message)
    return { accounts: [], properties: [] }
  }
}

function buildSystemPrompt({ playbooks, accounts, properties, examples }) {
  const accountsBlock = accounts.length
    ? accounts.map(a => `- [${a.id}] ${a.name}${a.type ? ` (${a.type})` : ''}`).join('\n')
    : '(none yet)'

  const propertiesBlock = properties.length
    ? properties.map(p => `- [${p.id}] ${p.address}${p.municipality ? ` — ${p.municipality}` : ''}`).join('\n')
    : '(none yet)'

  const examplesBlock = examples.length
    ? examples.map(e =>
        `- ${e.category}: "${e.task_summary}" → ${e.channel || 'unknown'}/${e.outcome || 'unknown'}${e.notes ? ` (${e.notes})` : ''}`
      ).join('\n')
    : '(no resolutions logged yet — first parse)'

  const playbookBlock = playbooks?.trim()
    ? playbooks
    : '(no compiled playbooks — using category guide only)'

  return `You are a sales operations assistant for a natural stone importer. You parse meeting notes into structured action items.

CATEGORIES (you MUST pick one of these for each task):
${CATEGORIES.join(', ')}

CATEGORY GUIDE:${CATEGORY_GUIDE}

COMPILED TASK PLAYBOOKS:
${playbookBlock}

KNOWN ACCOUNTS (use the bracketed UUID for account_id when the task is clearly about that account):
${accountsBlock}

KNOWN PROPERTIES (use the bracketed UUID for property_id when the task is clearly about that property):
${propertiesBlock}

RESOLUTION HISTORY — how similar tasks were resolved before. Use these as anchors when picking category and writing descriptions:
${examplesBlock}

For each actionable item in the meeting notes, return one JSON object with these fields:
  - "category": one of ${CATEGORIES.join(' | ')}
  - "title": short imperative title (e.g. "Send Calacatta sample to Mira")
  - "description": one or two sentences expanding on the title
  - "contact": person involved, or null
  - "property": property/project address or label, or null
  - "materials": comma-separated materials list, or null
  - "deadline": deadline as a date string, or null
  - "priority": "high" | "medium" | "low"
  - "value": estimated dollar value if tied to a quote, else null
  - "quote_ref": StoneProfits quote number if mentioned (e.g. "Q-2024-1337"), else null
  - "account_id": UUID from KNOWN ACCOUNTS if matched, else null
  - "property_id": UUID from KNOWN PROPERTIES if matched, else null
  - "suggested_action": one-line description of the FIRST step the user (or the dispatcher) should take
  - "suggested_channel": "wired" if the work is purely structured CRM data; "copy_prompt" if the work needs Claude in Chrome (StoneProfits, Outlook, vague matching, drafting)

CRITICAL RULES:
  - Wrong matches are worse than missing matches. If you are not >80% sure on account_id or property_id, use null.
  - Do NOT fabricate quote_ref values. Only set it if explicitly stated in the notes.
  - Output a strict JSON ARRAY only — no prose, no markdown, no comments.`
}

function safeParseJsonArray(text) {
  const cleaned = String(text || '').replace(/```(?:json)?/g, '').trim()
  // Find the first '[' and last ']' to be tolerant of accidental prose.
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`Claude returned non-array JSON: ${cleaned.slice(0, 200)}…`)
  }
  return JSON.parse(cleaned.slice(start, end + 1))
}

export async function POST(req) {
  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }

  const { notes, meeting_context = {}, playbooks: playbooksOverride = null } = body || {}
  if (!notes || typeof notes !== 'string' || !notes.trim()) {
    return NextResponse.json({ error: 'notes_required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'anthropic_api_key_missing', message: 'Set ANTHROPIC_API_KEY in .env.local' }, { status: 500 })
  }

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'

  // 1-3: gather context.
  const [{ accounts, properties }, examples] = await Promise.all([
    loadAccountsContext(),
    recentResolutionsByCategory(10),
  ])

  const systemPrompt = buildSystemPrompt({
    playbooks: playbooksOverride,
    accounts,
    properties,
    examples,
  })

  // 4: call Claude.
  let parsed
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey })
    const resp = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text:
              `MEETING CONTEXT:\n${JSON.stringify(meeting_context, null, 2)}\n\nMEETING NOTES:\n${notes}\n\nReturn the JSON array only.`
            },
          ],
        },
      ],
    })
    const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
    parsed = safeParseJsonArray(text)
    if (!Array.isArray(parsed)) throw new Error('Top-level JSON is not an array')
  } catch (e) {
    return NextResponse.json({ error: 'parse_failed', message: e.message }, { status: 502 })
  }

  // 5: write tasks + record events. Only when Supabase is connected — if
  // not, we return the parsed shape and let the client persist locally.
  const sb = getSupabase()
  const notesHash = sha1(notes)
  const runId = crypto.randomUUID()
  const created = []

  if (sb) {
    for (const item of parsed) {
      const taskRow = {
        type: item.category || 'CUSTOM',
        description: item.description || item.title || '',
        contact: item.contact || null,
        property: item.property || null,
        materials: item.materials || null,
        deadline: item.deadline || null,
        priority: item.priority || 'medium',
        crm_data: item.crm_data || null,
        playbook: null,
        meeting_id: meeting_context?.meeting_id || null,
      }
      try {
        const { data, error } = await sb.from('tasks').insert(taskRow).select().single()
        if (error) throw error
        await recordTaskEvent({
          taskId: data.id,
          eventType: 'created',
          channel: null,
          outcome: null,
          notes: item.suggested_action || null,
          metadata: {
            run_id: runId,
            notes_hash: notesHash,
            model,
            account_id: item.account_id || null,
            property_id: item.property_id || null,
            suggested_channel: item.suggested_channel || null,
            value: item.value ?? null,
            quote_ref: item.quote_ref || null,
            title: item.title || null,
          },
        })
        created.push({ ...data, suggested_action: item.suggested_action, suggested_channel: item.suggested_channel })
      } catch (e) {
        console.warn('insert task failed', e.message)
        // Continue with the rest — partial parse is better than none.
      }
    }
  }

  return NextResponse.json({
    run_id: runId,
    model,
    examples_used: examples.length,
    tasks: sb ? created : parsed.map(p => ({ ...p, _local: true })),
    persisted: !!sb,
  })
}
