// PraskForce1 — Tasks dispatcher.
//
// Each task category gets a dispatcher entry. Two modes:
//
//   wired       — green "Run" button. Calls handler(task), shows result
//                 inline, writes a `task_events` row with channel='wired',
//                 outcome='completed'.
//
//   copy_prompt — blue "Copy Prompt" button. Calls promptBuilder(task,
//                 context), copies the result to the clipboard, and shows
//                 a "Mark resolved" affordance. When the user marks
//                 resolved, we capture (channel='copy_prompt', outcome,
//                 free-text notes) — that capture is what feeds the
//                 next meeting-notes parse's few-shot examples.
//
// Why most categories are copy_prompt:
//   StoneProfits, Outlook, and the various permit/research portals are
//   all semantic surfaces. Wiring them via Puppeteer breaks the moment
//   a UI shifts. Until the resolution-learning model is mature enough
//   to make wiring those safe, we lean on prompts that already work
//   well in Claude Code. The dispatch table is the contract — change
//   `mode: 'copy_prompt'` to `mode: 'wired'` and supply a handler when
//   a category is ready to graduate.

import { PROMPT_BUILDERS } from '@/lib/prompt-builders/index.js'
import { recordTaskEvent } from '@/lib/resolution.js'
import { getSupabase } from '@/lib/supabase.js'

// ── Wired handlers ───────────────────────────────────────────────────

/**
 * CAPTURE handler — pure data capture from a meeting. Writes structured
 * fields straight into our Supabase (firms / firm_contacts / etc.) — no
 * StoneProfits round-trip. Safe to wire because there's no semantic
 * matching: the parser already extracted typed fields.
 *
 * Expected `task.crm_data` shape (any subset is fine):
 *   {
 *     firm: { name, type, city, state, website, instagram, notes },
 *     contacts: [{ name, title, email, phone, linkedin, instagram }],
 *     property_notes: "free text"
 *   }
 *
 * Returns: { ok: bool, summary, written: { firms, contacts, notes } }
 */
async function captureHandler(task) {
  const sb = getSupabase()
  const data = task.crm_data || {}
  const written = { firms: 0, contacts: 0, notes: 0 }

  if (!sb) {
    return {
      ok: false,
      summary: 'Supabase not connected — capture cannot persist. Connect Supabase in Configuration first.',
      written,
    }
  }

  // Firm
  if (data.firm?.name) {
    try {
      const id = data.firm.id || `firm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const { error } = await sb.from('firms').upsert({
        id,
        name: data.firm.name,
        type: data.firm.type || null,
        city: data.firm.city || null,
        state: data.firm.state || null,
        website: data.firm.website || null,
        instagram: data.firm.instagram || null,
        notes: data.firm.notes || null,
        source: 'meeting',
      })
      if (error) throw error
      written.firms = 1
    } catch (e) {
      console.warn('captureHandler firm failed', e.message)
    }
  }

  // Contacts
  if (Array.isArray(data.contacts)) {
    for (const c of data.contacts) {
      if (!c.name) continue
      try {
        const id = c.id || `contact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        const { error } = await sb.from('firm_contacts').upsert({
          id,
          firm_id: data.firm?.id || null,
          name: c.name,
          title: c.title || null,
          email: c.email || null,
          phone: c.phone || null,
          linkedin: c.linkedin || null,
          instagram: c.instagram || null,
          notes: c.notes || null,
          source: 'meeting',
        })
        if (error) throw error
        written.contacts++
      } catch (e) {
        console.warn('captureHandler contact failed', e.message)
      }
    }
  }

  // Property notes — if a property is mentioned, append to listing_notes.
  if (data.property_notes && task.property) {
    try {
      const { data: rows } = await sb
        .from('properties')
        .select('id, listing_notes')
        .ilike('address', `%${task.property}%`)
        .limit(1)
      if (rows && rows[0]) {
        const merged = [rows[0].listing_notes, data.property_notes].filter(Boolean).join('\n\n')
        await sb.from('properties').update({ listing_notes: merged }).eq('id', rows[0].id)
        written.notes = 1
      }
    } catch (e) {
      console.warn('captureHandler property note failed', e.message)
    }
  }

  return {
    ok: written.firms + written.contacts + written.notes > 0,
    summary: `Wrote ${written.firms} firm, ${written.contacts} contact(s), ${written.notes} property note.`,
    written,
  }
}

// ── Dispatch table ───────────────────────────────────────────────────

export const DISPATCH = {
  QUOTE: {
    mode: 'copy_prompt',
    promptBuilder: PROMPT_BUILDERS.QUOTE,
    notes: 'StoneProfits is semantic. Prompt fills in client, project, materials, qty, address.',
  },
  FOLLOW_UP: {
    mode: 'copy_prompt',
    promptBuilder: PROMPT_BUILDERS.FOLLOW_UP,
    notes: 'Prompt drafts the email with tone + context. User reviews + sends from Outlook.',
  },
  EMAIL: {
    mode: 'copy_prompt',
    promptBuilder: PROMPT_BUILDERS.EMAIL,
    notes: 'Same as FOLLOW_UP but for non-continuation emails.',
  },
  RESEARCH: {
    mode: 'copy_prompt',
    promptBuilder: PROMPT_BUILDERS.RESEARCH,
    notes: 'Prompt is structured for Claude in Chrome — owner LLC, principal, permits.',
  },
  ADMIN: {
    mode: 'copy_prompt',
    promptBuilder: PROMPT_BUILDERS.ADMIN,
    notes: 'Holds, reschedules, internal notes.',
  },
  SCHEDULE: {
    mode: 'copy_prompt',
    promptBuilder: PROMPT_BUILDERS.SCHEDULE,
    notes: 'Until calendar API is wired.',
  },
  CAPTURE: {
    mode: 'wired',
    handler: captureHandler,
    notes: 'Pure data capture — safe to wire.',
  },
  CRM_UPDATE: {
    mode: 'copy_prompt',
    promptBuilder: PROMPT_BUILDERS.CRM_UPDATE,
    notes: 'StoneProfits writeback is semantic.',
  },
}

/**
 * Look up the dispatcher entry for a category. Returns a fallback
 * copy_prompt entry if the category isn't in the table — the UI should
 * still show *something* the user can act on, even for tasks the
 * parser tagged as CUSTOM or with a future category.
 */
export function dispatchFor(category) {
  return DISPATCH[category] || {
    mode: 'copy_prompt',
    promptBuilder: (task) => `TASK: ${task.description || task.title || '(no description)'}\n\nThis category (${category}) is not in the dispatcher yet — handle it manually and log how you resolved it so we can add a prompt builder.`,
    notes: 'Unmapped category — fallback prompt only.',
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Run a wired task. Throws if the task category is not wired.
 * Always records a dispatched event before the handler runs and a
 * resolved event after — even on failure. The point: every wired
 * action leaves an auditable trace.
 */
export async function runWired(task, context = {}) {
  const entry = dispatchFor(task.type)
  if (entry.mode !== 'wired') {
    throw new Error(`Task category ${task.type} is not wired (mode=${entry.mode})`)
  }
  await recordTaskEvent({ taskId: task.id, eventType: 'dispatched', channel: 'wired' })
  try {
    const result = await entry.handler(task, context)
    await recordTaskEvent({
      taskId: task.id,
      eventType: 'resolved',
      channel: 'wired',
      outcome: result.ok ? 'completed' : 'failed',
      notes: result.summary || null,
      metadata: result.written || null,
    })
    return result
  } catch (e) {
    await recordTaskEvent({
      taskId: task.id,
      eventType: 'resolved',
      channel: 'wired',
      outcome: 'failed',
      notes: e.message,
    })
    throw e
  }
}

/**
 * Build the prompt string for a copy_prompt task. Records a
 * `dispatched` event so we can compute "% of tasks the user actually
 * acted on" later. The corresponding 'resolved' event is recorded
 * separately when the user clicks Mark Resolved.
 */
export async function buildPromptForTask(task, context = {}) {
  const entry = dispatchFor(task.type)
  const builder = entry.promptBuilder
  const prompt = builder ? builder(task, context) : ''
  await recordTaskEvent({ taskId: task.id, eventType: 'dispatched', channel: 'copy_prompt' })
  return prompt
}

/**
 * Mark a copy_prompt task resolved. The (channel, outcome, notes)
 * triple feeds the meeting-notes parser's few-shot examples on the
 * next run, which is the seed of the learning loop.
 */
export async function markResolved(task, { outcome = 'completed', notes = null, channel = 'copy_prompt' } = {}) {
  await recordTaskEvent({
    taskId: task.id,
    eventType: 'resolved',
    channel,
    outcome,
    notes,
  })
  return { ok: true }
}
